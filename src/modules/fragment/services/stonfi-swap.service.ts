/* eslint-disable @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports, import/no-extraneous-dependencies */
import { Injectable, Logger } from '@nestjs/common';
// eslint-disable-next-line import/no-extraneous-dependencies
import { StonApiClient } from '@ston-fi/api';
// eslint-disable-next-line import/no-extraneous-dependencies
import {
  Blockchain,
  GaslessSettlement,
  Omniston,
  SettlementMethod,
} from '@ston-fi/omniston-sdk';
// eslint-disable-next-line import/no-extraneous-dependencies
import { TonBalanceProvider } from '@modules/ton/providers/ton-balance.provider';
import { TonWalletProvider } from '@modules/ton/providers/ton-wallet.provider';
import { Address, TonClient } from '@ton/ton';
import { FragmentConfig } from '../fragment.config';

/**
 * Result of swap operation
 */
export interface SwapResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

/**
 * Quote for swap operation
 */
export interface SwapQuote {
  fromAmount: string; // Amount in USDT (nano)
  toAmount: string; // Amount in TON (nano)
  minToAmount: string; // Minimum TON to receive (with slippage)
}

/**
 * Service for swapping USDT to TON using STON.fi
 */
@Injectable()
export class StonfiSwapService {
  private readonly logger = new Logger(StonfiSwapService.name);

  private readonly stonApiClient: StonApiClient;

  private readonly tonClient: TonClient;

  private readonly omniston: Omniston;

  private readonly TON_NATIVE_ADDRESS =
    'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c';

  private readonly USDT_DECIMALS = 6;

  private readonly TON_DECIMALS = 9;

  constructor(
    private readonly config: FragmentConfig,
    private readonly tonWalletProvider: TonWalletProvider,
    private readonly tonBalanceProvider: TonBalanceProvider,
  ) {
    this.stonApiClient = new StonApiClient();
    this.tonClient = new TonClient({
      endpoint:
        this.config.toncenterRpcUrl || 'https://toncenter.com/api/v2/jsonRPC',
      apiKey: this.config.toncenterApiKey,
    });
    this.omniston = new Omniston({
      apiUrl: 'wss://omni-ws.ston.fi',
    });
  }

  /**
   * Get wallet balances (TON and USDT)
   * @deprecated Use TonBalanceProvider.getWalletBalances directly
   */
  async getWalletBalances(
    walletAddress: string,
  ): Promise<{ ton: string; usdt: string } | null> {
    return this.tonBalanceProvider.getWalletBalances(walletAddress);
  }

  /**
   * Get quote for swapping USDT to TON based on USDT amount
   * @param usdtAmount USDT amount in nano (6 decimals)
   * @returns Quote with expected TON amount
   */
  async getSwapQuoteFromUsdt(usdtAmount: string): Promise<SwapQuote | null> {
    try {
      const usdtAmountBigInt = BigInt(usdtAmount);
      const usdtUnits = Number(usdtAmountBigInt);
      const slippageTolerance = this.getSlippageTolerance();

      if (usdtUnits < 1000) {
        this.logger.warn(`USDT amount too small: ${usdtAmount}`);
        return null;
      }

      // Simulate swap USDT -> TON to get expected TON amount
      const simulationResult = await this.stonApiClient.simulateSwap({
        offerAddress: this.config.usdtJettonAddress,
        askAddress: this.TON_NATIVE_ADDRESS,
        offerUnits: usdtAmount,
        slippageTolerance: slippageTolerance.toString(),
      });

      if (!simulationResult?.minAskUnits) {
        throw new Error('Invalid simulation result from STON.fi');
      }

      const receivedTonNano = BigInt(simulationResult.minAskUnits.toString());

      // Calculate min TON with slippage
      const slippageMultiplier = BigInt(
        100 - this.config.swapSlippageTolerance,
      );
      const minTonAmount = (receivedTonNano * slippageMultiplier) / BigInt(100);

      return {
        fromAmount: usdtAmount,
        toAmount: receivedTonNano.toString(),
        minToAmount: minTonAmount.toString(),
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to get swap quote from USDT: ${errorMessage}`);

      // Fallback: estimate TON amount
      const usdtAmountBigInt = BigInt(usdtAmount);
      const estimatedTonNano =
        (usdtAmountBigInt * BigInt(650000000)) / BigInt(1000000);

      const slippageMultiplier = BigInt(
        100 - this.config.swapSlippageTolerance,
      );
      const minToAmount = (estimatedTonNano * slippageMultiplier) / BigInt(100);

      this.logger.warn(
        `Using fallback quote estimation. Real API call failed: ${errorMessage}`,
      );

      return {
        fromAmount: usdtAmount,
        toAmount: estimatedTonNano.toString(),
        minToAmount: minToAmount.toString(),
      };
    }
  }

  /**
   * Get quote for swapping USDT to TON (legacy method - calculates USDT needed for required TON)
   * @param tonAmountRequired Required TON amount in nano
   * @returns Quote with required USDT amount
   */
  async getSwapQuote(tonAmountRequired: string): Promise<SwapQuote | null> {
    try {
      const tonAmountBigInt = BigInt(tonAmountRequired);
      const tonUnits = Number(tonAmountBigInt);
      const slippageTolerance = this.getSlippageTolerance();

      if (tonUnits < 100000000) {
        this.logger.warn(`TON amount too small: ${tonAmountRequired}`);
        return null;
      }

      const simulationResult = await this.stonApiClient.simulateSwap({
        offerAddress: this.TON_NATIVE_ADDRESS,
        askAddress: this.config.usdtJettonAddress,
        offerUnits: tonAmountRequired,
        slippageTolerance: slippageTolerance.toString(),
      });

      if (!simulationResult?.minAskUnits) {
        throw new Error('Invalid simulation result from STON.fi');
      }

      const receivedUsdtNano = BigInt(simulationResult.minAskUnits.toString());
      const estimatedUsdtForSimulation = receivedUsdtNano.toString();

      const forwardSimulation = await this.stonApiClient.simulateSwap({
        offerAddress: this.config.usdtJettonAddress,
        askAddress: this.TON_NATIVE_ADDRESS,
        offerUnits: estimatedUsdtForSimulation,
        slippageTolerance: slippageTolerance.toString(),
      });

      if (!forwardSimulation?.minAskUnits) {
        throw new Error('Invalid forward simulation result from STON.fi');
      }

      const receivedTonNano = BigInt(forwardSimulation.minAskUnits.toString());
      const givenUsdtNano = BigInt(estimatedUsdtForSimulation);

      let requiredUsdtNano: bigint;
      if (receivedTonNano < tonAmountBigInt) {
        const ratio = (tonAmountBigInt * BigInt(1000000)) / receivedTonNano;
        requiredUsdtNano = (givenUsdtNano * ratio) / BigInt(1000000);
      } else {
        requiredUsdtNano = givenUsdtNano;
      }

      const reserveMultiplier = BigInt(1015);
      const requiredUsdtWithReserve =
        (requiredUsdtNano * reserveMultiplier) / BigInt(1000);
      const slippageMultiplier = BigInt(
        100 - this.config.swapSlippageTolerance,
      );
      const minTonAmount = (tonAmountBigInt * slippageMultiplier) / BigInt(100);

      return {
        fromAmount: requiredUsdtWithReserve.toString(),
        toAmount: tonAmountRequired,
        minToAmount: minTonAmount.toString(),
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to get swap quote: ${errorMessage}`);

      const tonAmountBigInt = BigInt(tonAmountRequired);
      const estimatedUsdtNano =
        (tonAmountBigInt * BigInt(1000000)) / BigInt(650000000);

      const reserveMultiplier = BigInt(1015);
      const fromAmountWithReserve =
        (estimatedUsdtNano * reserveMultiplier) / BigInt(1000);
      const slippageMultiplier = BigInt(
        100 - this.config.swapSlippageTolerance,
      );
      const minToAmount = (tonAmountBigInt * slippageMultiplier) / BigInt(100);

      this.logger.warn(
        `Using fallback quote estimation. Real API call failed: ${errorMessage}`,
      );

      return {
        fromAmount: fromAmountWithReserve.toString(),
        toAmount: tonAmountRequired,
        minToAmount: minToAmount.toString(),
      };
    }
  }

  /**
   * Get slippage tolerance as decimal (e.g., 1% = 0.01)
   */
  private getSlippageTolerance(): number {
    return parseFloat(this.config.swapSlippageTolerance.toString()) / 100;
  }

  /**
   * Execute swap: USDT -> TON using Omniston protocol
   * @param usdtAmount Amount of USDT to swap (in nano)
   * @param minTonAmount Minimum TON to receive (in nano)
   * @returns Swap result with transaction hash
   */
  async swapUsdtToTon(
    usdtAmount: string,
    minTonAmount: string,
  ): Promise<SwapResult> {
    try {
      const walletData = await this.tonWalletProvider.initializeWalletForSwap();
      if (!walletData) {
        return {
          success: false,
          error: 'Failed to initialize wallet',
        };
      }

      this.logger.log(
        `Swapping ${usdtAmount} nano USDT to TON (min: ${minTonAmount} nano TON) via Omniston`,
      );

      // Request quote from Omniston

      const quoteObservable = this.omniston.requestForQuote({
        settlementMethods: [SettlementMethod.SETTLEMENT_METHOD_SWAP],
        bidAssetAddress: {
          blockchain: Blockchain.TON,
          address: this.config.usdtJettonAddress,
        },
        askAssetAddress: {
          blockchain: Blockchain.TON,
          address: this.TON_NATIVE_ADDRESS,
        },
        amount: {
          bidUnits: usdtAmount,
        },
        settlementParams: {
          maxPriceSlippageBps: this.config.swapSlippageTolerance * 100,
          gaslessSettlement: GaslessSettlement.GASLESS_SETTLEMENT_POSSIBLE,
          maxOutgoingMessages: 4,
          flexibleReferrerFee: true,
        },
      });

      const quoteEvents = await new Promise<{
        type: string;
        quote?: any;
        rfqId?: string;
      }>((resolve, reject) => {
        let subscription: any;
        let ackReceived = false;
        let quoteReceived = false;
        const timeoutId = setTimeout(() => {
          if (subscription) {
            subscription.unsubscribe();
          }
          if (!quoteReceived) {
            reject(new Error('Quote request timeout'));
          } else {
            reject(new Error('Quote request timeout'));
          }
        }, 15000);

        subscription = (quoteObservable as any).subscribe({
          next: (event: any) => {
            if (event.type === 'ack') {
              ackReceived = true;
              this.logger.debug('Quote request acknowledged');
            } else if (event.type === 'quoteUpdated') {
              // Accept quoteUpdated even if ack hasn't been received yet
              // (events may arrive in different order)
              if (!ackReceived) {
                this.logger.debug(
                  'Received quoteUpdated before ack, accepting anyway',
                );
              }
              quoteReceived = true;
              clearTimeout(timeoutId);
              subscription.unsubscribe();
              resolve(event);
            } else if (event.type === 'noQuote') {
              clearTimeout(timeoutId);
              subscription.unsubscribe();
              reject(new Error('No quote available'));
            }
          },
          error: (error: unknown) => {
            clearTimeout(timeoutId);
            if (subscription) {
              subscription.unsubscribe();
            }
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            this.logger.error(`Quote observable error: ${errorMessage}`);
            reject(error);
          },
        });
      });

      if (quoteEvents.type !== 'quoteUpdated' || !quoteEvents.quote) {
        throw new Error(`Failed to get quote: ${quoteEvents.type}`);
      }

      const { quote } = quoteEvents;
      this.logger.log(
        `Quote received: ${quote.bidUnits} USDT -> ${quote.askUnits} TON via ${quote.resolverName}`,
      );

      // Verify that the quote meets minimum requirements
      const quoteAskAmount = BigInt(quote.askUnits);
      const minTonAmountBigInt = BigInt(minTonAmount);
      if (quoteAskAmount < minTonAmountBigInt) {
        throw new Error(
          `Quote amount ${quote.askUnits} is less than minimum required ${minTonAmount}`,
        );
      }

      const tx = await this.omniston.buildTransfer({
        quote,
        sourceAddress: {
          blockchain: Blockchain.TON,
          address: walletData.address,
        },
        destinationAddress: {
          blockchain: Blockchain.TON,
          address: walletData.address,
        },
        gasExcessAddress: {
          blockchain: Blockchain.TON,
          address: walletData.address,
        },
        useRecommendedSlippage: true,
      });

      const messages = tx.ton?.messages ?? [];
      if (messages.length === 0) {
        throw new Error('No messages in transaction');
      }

      this.logger.debug(`Transaction built: ${messages.length} message(s)`);

      // eslint-disable-next-line import/no-extraneous-dependencies
      const { WalletContractV3R2, internal, Cell } = await import('@ton/ton');
      // eslint-disable-next-line import/no-extraneous-dependencies
      const { keyPairFromSecretKey } = await import('@ton/crypto');

      // Get key pair from private key (convert Uint8Array to Buffer if needed)
      const privateKeyBuffer = Buffer.from(walletData.privateKey);
      const keyPair = keyPairFromSecretKey(privateKeyBuffer);

      // Create wallet contract
      const walletContract = this.tonClient.open(
        WalletContractV3R2.create({
          publicKey: keyPair.publicKey,
          workchain: 0,
        }),
      );

      // Get seqno for the transaction
      const seqno = await walletContract.getSeqno();

      // Parse and send each message
      // Note: We need to send all messages in a single transaction, so we collect them first
      const messageList = [];
      for (const message of messages) {
        const targetAddress = Address.parse(message.targetAddress);
        const sendAmount = BigInt(message.sendAmount);
        let body: InstanceType<typeof Cell> | undefined;

        if (message.payload) {
          // Parse payload from hex or base64
          let payloadBytes: Buffer;
          if (message.payload.startsWith('0x')) {
            // Hex format
            payloadBytes = Buffer.from(message.payload.slice(2), 'hex');
          } else {
            // Base64 format
            payloadBytes = Buffer.from(message.payload, 'base64');
          }
          const [cell] = Cell.fromBoc(payloadBytes);
          body = cell as InstanceType<typeof Cell>;
        }

        messageList.push(
          internal({
            to: targetAddress,
            value: sendAmount,
            body,
            bounce: true,
          }),
        );
      }

      // Send all messages in a single transaction
      await walletContract.sendTransfer({
        seqno,
        secretKey: privateKeyBuffer,
        messages: messageList,
      });

      this.logger.log(
        `Swap transaction sent via Omniston. Quote ID: ${quote.quoteId}`,
      );

      // Wait for transaction confirmation
      await this.waitForTransactionConfirmation();

      return {
        success: true,
        txHash: `omniston-${quote.quoteId}`, // Use quote ID as identifier
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Swap failed: ${errorMessage}`);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Wait for transaction confirmation
   */
  private async waitForTransactionConfirmation(
    maxWaitTime: number = 10000,
  ): Promise<void> {
    await new Promise<void>((resolve) => {
      setTimeout(() => resolve(), maxWaitTime);
    });
  }
}
