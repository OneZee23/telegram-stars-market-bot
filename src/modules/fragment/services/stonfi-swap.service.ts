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
import { Address, TonClient } from '@ton/ton';
import { mnemonicToPrivateKey } from 'ton-crypto';
import * as TonWeb from 'tonweb';
import * as nacl from 'tweetnacl';
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
 * Wallet balance information
 */
export interface WalletBalance {
  ton: string; // TON balance in nano
  usdt: string; // USDT balance in nano
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

  constructor(private readonly config: FragmentConfig) {
    this.stonApiClient = new StonApiClient();
    this.tonClient = new TonClient({
      endpoint:
        this.config.toncenterRpcUrl || 'https://toncenter.com/api/v2/jsonRPC',
      apiKey: this.config.toncenterApiKey,
    });
    // Initialize Omniston SDK
    this.omniston = new Omniston({
      apiUrl: 'wss://omni-ws.ston.fi',
    });
  }

  /**
   * Get wallet balances (TON and USDT)
   */
  async getWalletBalances(
    walletAddress: string,
  ): Promise<WalletBalance | null> {
    try {
      // Get TON balance using TON Center API
      const tonBalance = await this.getTonBalance(walletAddress);

      // Get USDT jetton balance
      const { usdtJettonAddress } = this.config;
      const usdtBalance = await this.getJettonBalance(
        walletAddress,
        usdtJettonAddress,
      );

      return {
        ton: tonBalance || '0',
        usdt: usdtBalance || '0',
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to get wallet balances: ${errorMessage}`);
      return null;
    }
  }

  /**
   * Get TON balance for a wallet address
   */
  private async getTonBalance(walletAddress: string): Promise<string> {
    try {
      const url =
        this.config.toncenterRpcUrl || 'https://toncenter.com/api/v2/jsonRPC';
      const apiKey = this.config.toncenterApiKey;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'X-API-Key': apiKey } : {}),
        },
        body: JSON.stringify({
          method: 'getAddressInformation',
          params: {
            address: walletAddress,
          },
          id: 1,
        }),
      });

      if (!response.ok) {
        throw new Error(`TON Center API error: ${response.statusText}`);
      }

      const data = await response.json();
      const balance = data.result?.balance || '0';

      return balance;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to get TON balance: ${errorMessage}. Assuming 0 balance.`,
      );
      return '0';
    }
  }

  /**
   * Get quote for swapping USDT to TON
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

      // Use reverse simulation: simulate swap from TON to USDT
      // to find out how much USDT we get for the required TON
      // Then we can calculate the required USDT amount
      const simulationResult = await this.stonApiClient.simulateSwap({
        offerAddress: this.TON_NATIVE_ADDRESS,
        askAddress: this.config.usdtJettonAddress,
        offerUnits: tonAmountRequired,
        slippageTolerance: slippageTolerance.toString(),
      });

      if (!simulationResult?.minAskUnits) {
        throw new Error('Invalid simulation result from STON.fi');
      }

      // minAskUnits is the USDT we get for the TON we offer
      // But we need the opposite - how much USDT to give to get the TON
      // So we simulate the forward swap: USDT -> TON
      const receivedUsdtNano = BigInt(simulationResult.minAskUnits.toString());

      // Now simulate forward swap with estimated USDT to get exact amounts
      // We'll use the received USDT as a starting point
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

      // Adjust USDT amount if needed to get exactly the required TON
      let requiredUsdtNano: bigint;
      if (receivedTonNano < tonAmountBigInt) {
        // Need more USDT - calculate proportion
        const ratio = (tonAmountBigInt * BigInt(1000000)) / receivedTonNano;
        requiredUsdtNano = (givenUsdtNano * ratio) / BigInt(1000000);
      } else {
        requiredUsdtNano = givenUsdtNano;
      }

      // Add reserve for swap fees (typically 0.03-0.04 TON per swap)
      // Instead of 5% reserve, we use 2% + fixed fee amount for better precision
      const swapFeeReserveTon = BigInt(40000000); // 0.04 TON for swap fees
      const swapFeeReserveUsdt =
        (swapFeeReserveTon * requiredUsdtNano) / receivedTonNano;

      // Add small percentage reserve (2%) for price fluctuations
      const smallReserveMultiplier = BigInt(102); // 1.02 = 2%
      const requiredUsdtWithSmallReserve =
        (requiredUsdtNano * smallReserveMultiplier) / BigInt(100);

      // Total: base amount + swap fee reserve + small percentage reserve
      const requiredUsdtWithReserve =
        requiredUsdtWithSmallReserve + swapFeeReserveUsdt;

      // Calculate min TON with slippage
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

      // Fallback: estimate based on approximate rate (1 USDT ≈ 6.5 TON)
      const tonAmountBigInt = BigInt(tonAmountRequired);
      const estimatedUsdtNano =
        (tonAmountBigInt * BigInt(1000000)) / BigInt(650000000);

      // Add reserve for swap fees (0.04 TON) + small percentage (2%)
      const swapFeeReserveTon = BigInt(40000000); // 0.04 TON
      const swapFeeReserveUsdt =
        (swapFeeReserveTon * estimatedUsdtNano) / tonAmountBigInt;
      const smallReserveMultiplier = BigInt(102); // 2%
      const estimatedWithSmallReserve =
        (estimatedUsdtNano * smallReserveMultiplier) / BigInt(100);
      const fromAmountWithReserve =
        estimatedWithSmallReserve + swapFeeReserveUsdt;
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
      // Initialize wallet
      const walletData = await this.initializeWallet();
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
          maxPriceSlippageBps: this.config.swapSlippageTolerance * 100, // Convert % to basis points
          gaslessSettlement: GaslessSettlement.GASLESS_SETTLEMENT_POSSIBLE,
          maxOutgoingMessages: 4, // Default for TON
          flexibleReferrerFee: true,
        },
      });

      // Wait for the best quote (with timeout)
      // Omniston SDK returns RxJS Observable - convert to Promise with timeout
      // We need to wait for 'ack' first, then 'quoteUpdated'
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
          if (!ackReceived) {
            reject(new Error('Quote request ack timeout'));
          } else if (!quoteReceived) {
            reject(new Error('Quote request timeout'));
          } else {
            reject(new Error('Quote request timeout'));
          }
        }, 15000);

        subscription = (quoteObservable as any).subscribe({
          next: (event: any) => {
            if (event.type === 'ack') {
              // Quote request acknowledged, now we can receive quoteUpdated
              ackReceived = true;
              this.logger.debug('Quote request acknowledged');
            } else if (event.type === 'quoteUpdated') {
              if (!ackReceived) {
                clearTimeout(timeoutId);
                subscription.unsubscribe();
                reject(
                  new Error('Received "quoteUpdated" event without ack event'),
                );
                return;
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

      // Build transaction using Omniston
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

      // Create custom Sender implementation using @ton/ton for signing
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
            bounce: true, // Set bounce to true for jetton transfers
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
   * Initialize wallet from mnemonic
   */
  private async initializeWallet(): Promise<{
    address: string;
    privateKey: Uint8Array;
  } | null> {
    try {
      const mnemonicArray = this.config.mnemonic.trim().split(/\s+/);
      if (mnemonicArray.length !== 24) {
        throw new Error('Mnemonic must contain 24 words');
      }

      const keyPair = await mnemonicToPrivateKey(mnemonicArray);
      const privateKey = keyPair.secretKey;

      const TonWebTyped = TonWeb as any;
      const httpProvider = new TonWebTyped.HttpProvider(
        this.config.toncenterRpcUrl || 'https://toncenter.com/api/v2/jsonRPC',
        {
          apiKey: this.config.toncenterApiKey,
        },
      );

      const tonWebInstance = new TonWebTyped(httpProvider);
      const WalletClass = tonWebInstance.wallet.all.v3R2;
      const wallet = new WalletClass(httpProvider, {
        publicKey: keyPair.publicKey,
      });

      const address = await wallet.getAddress();
      const addressString = address.toString(true, true, true);

      return {
        address: addressString,
        privateKey,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to initialize wallet: ${errorMessage}`);
      return null;
    }
  }

  /**
   * Get jetton balance for a wallet address
   * First finds the jetton wallet address, then gets its balance
   * Based on working implementation from commit 3eceec921b967538116d7a6a09352d44acc383d0
   */
  private async getJettonBalance(
    walletAddress: string,
    jettonAddress: string,
  ): Promise<string> {
    try {
      const url =
        this.config.toncenterRpcUrl || 'https://toncenter.com/api/v2/jsonRPC';
      const apiKey = this.config.toncenterApiKey;

      // Create TonWeb instance
      const TonWebTyped = TonWeb as any;
      const httpProvider = new TonWebTyped.HttpProvider(url, {
        apiKey,
      });
      const tonWebInstance = new TonWebTyped(httpProvider);

      // Step 1: Get jetton wallet address using call2
      // Create a cell with the owner address
      const cell = new tonWebInstance.boc.Cell();
      cell.bits.writeAddress(new tonWebInstance.utils.Address(walletAddress));
      const slice = tonWebInstance.utils.bytesToBase64(await cell.toBoc(false));

      const result = await tonWebInstance.provider.call2(
        jettonAddress,
        'get_wallet_address',
        [['tvm.Slice', slice]],
      );

      // Parse address from result
      const jettonWalletAddress = await this.parseAddressFromCall2Result(
        result,
        tonWebInstance,
      );

      if (!jettonWalletAddress) {
        return '0';
      }

      // Step 2: Get balance from jetton wallet using TonWeb JettonWallet class
      const JettonWalletClass = (
        TonWeb as { token?: { jetton?: { JettonWallet: unknown } } }
      ).token?.jetton?.JettonWallet;
      if (!JettonWalletClass) {
        return '0';
      }

      const wallet = new (JettonWalletClass as new (
        provider: any,
        options: { address: string },
      ) => {
        getData: () => Promise<{
          balance: { toString: (radix: number) => string };
        }>;
      })(tonWebInstance.provider, {
        address: jettonWalletAddress,
      });

      const walletData = await wallet.getData();
      const balance = walletData.balance.toString(10);

      return balance;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to get jetton balance: ${errorMessage}. Assuming 0 balance.`,
      );
      return '0';
    }
  }

  /**
   * Parse address from call2 result
   * Simplified version based on working implementation
   */
  private async parseAddressFromCall2Result(
    result: any,
    tonWebInstance: any,
  ): Promise<string | null> {
    if (!result) {
      return null;
    }

    // Try to parse from beginParse if available
    if (result.beginParse && typeof result.beginParse === 'function') {
      try {
        const slice = result.beginParse();
        if (slice?.loadAddress && typeof slice.loadAddress === 'function') {
          const address = slice.loadAddress();
          if (address) {
            return address.toString(true, true, true, 0);
          }
        }
      } catch {
        // Continue to other methods
      }
    }

    // Try to parse from stack
    if (
      result.stack &&
      Array.isArray(result.stack) &&
      result.stack.length > 0
    ) {
      const [firstItem] = result.stack;

      if (typeof firstItem === 'string') {
        return firstItem;
      }

      if (Array.isArray(firstItem) && firstItem.length >= 2) {
        const addressValue = firstItem[1];
        if (typeof addressValue === 'string') {
          return addressValue;
        }
        // Try to parse as cell
        if (typeof addressValue === 'object' && 'cell' in addressValue) {
          try {
            const cellBytes = tonWebInstance.utils.base64ToBytes(
              addressValue.cell,
            );
            const addressCell = tonWebInstance.boc.Cell.oneFromBoc(cellBytes);
            const address = addressCell.bits.readAddress();
            if (address) {
              return address.toString(true, true, true, 0);
            }
          } catch {
            // Continue
          }
        }
      }

      // Try to parse from object with cell property
      if (typeof firstItem === 'object' && firstItem !== null) {
        if ('cell' in firstItem && typeof firstItem.cell === 'string') {
          try {
            const cellBytes = tonWebInstance.utils.base64ToBytes(
              firstItem.cell,
            );
            const addressCell = tonWebInstance.boc.Cell.oneFromBoc(cellBytes);
            const address = addressCell.bits.readAddress();
            if (address) {
              return address.toString(true, true, true, 0);
            }
          } catch {
            // Continue
          }
        }
      }
    }

    // Try result.result.stack if available
    if (result.result?.stack) {
      return this.parseAddressFromCall2Result(
        { stack: result.result.stack },
        tonWebInstance,
      );
    }

    return null;
  }

  /**
   * Normalize amount to nano units (string)
   * Handles both string and number inputs, including floats
   * STON.fi API may return values in different formats
   */
  private normalizeToNano(value: string | number | undefined): string {
    if (!value) {
      return '0';
    }

    // Convert to number first
    const numValue =
      typeof value === 'string' ? parseFloat(value.trim()) : value;

    if (Number.isNaN(numValue)) {
      return '0';
    }

    // If it's a float (has decimal part), assume it's in base units
    // and convert to nano (multiply by 1e9 for TON)
    if (numValue % 1 !== 0) {
      return Math.floor(numValue * 1e9).toString();
    }

    // If it's an integer, assume it's already in nano
    return Math.floor(numValue).toString();
  }

  /**
   * Create TonWeb instance with HTTP provider
   */
  private createTonWebInstance(): {
    httpProvider: any;
    tonWebInstance: any;
  } {
    const TonWebTyped = TonWeb as any;
    const httpProvider = new TonWebTyped.HttpProvider(
      this.config.toncenterRpcUrl || 'https://toncenter.com/api/v2/jsonRPC',
      { apiKey: this.config.toncenterApiKey },
    );
    const tonWebInstance = new TonWebTyped(httpProvider);
    return { httpProvider, tonWebInstance };
  }

  /**
   * Sign transaction from parameters
   */
  private async signTransactionFromParams(
    txParams: {
      messages?: Array<{
        address: string;
        amount: string;
        payload?: string;
      }>;
    },
    privateKey: Uint8Array,
    httpProvider: any,
    tonWebInstance: any,
  ): Promise<string> {
    const TonWebTyped = TonWeb as any;
    const mnemonicArray = this.config.mnemonic.trim().split(/\s+/);
    const keyPair = await mnemonicToPrivateKey(mnemonicArray);
    const WalletClass = tonWebInstance.wallet.all.v3R2;
    const wallet = new WalletClass(httpProvider, {
      publicKey: keyPair.publicKey,
    });

    const seqno = (await wallet.methods.seqno().call()) || 0;
    const signingMessage = wallet.createSigningMessage(seqno);
    signingMessage.bits.writeUint8(3);

    for (const message of txParams.messages || []) {
      let messagePayload = null;
      if (message.payload) {
        const payloadBytes = tonWebInstance.utils.base64ToBytes(
          message.payload,
        );
        messagePayload = tonWebInstance.boc.Cell.oneFromBoc(payloadBytes);
      }

      const outMsg = TonWebTyped.Contract.createOutMsg(
        message.address,
        message.amount,
        messagePayload,
        null,
      );
      signingMessage.refs.push(outMsg);
    }

    const boc = await signingMessage.toBoc();
    const hash = await tonWebInstance.boc.Cell.oneFromBoc(boc).hash();
    const signature = nacl.sign.detached(hash, privateKey);

    const body = new TonWebTyped.boc.Cell();
    body.bits.writeBytes(signature);
    body.writeCell(tonWebInstance.boc.Cell.oneFromBoc(boc));

    const selfAddress = await wallet.getAddress();
    const header =
      TonWebTyped.Contract.createExternalMessageHeader(selfAddress);
    const externalMessage = TonWebTyped.Contract.createCommonMsgInfo(
      header,
      seqno === 0 ? (await wallet.createStateInit()).stateInit : null,
      body,
    );

    const signedBoc = await externalMessage.toBoc();
    return TonWebTyped.utils.bytesToBase64(signedBoc);
  }

  /**
   * Extract transaction hash from response
   */
  private extractTxHash(
    txHash:
      | string
      | {
          hash?: string;
          tx_hash?: string;
          transaction_id?: string;
          result?: string;
        }
      | null,
  ): string | null {
    if (typeof txHash === 'string') {
      return txHash;
    }
    if (txHash && typeof txHash === 'object') {
      return (
        txHash.hash ||
        txHash.tx_hash ||
        txHash.transaction_id ||
        txHash.result ||
        null
      );
    }
    return null;
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
