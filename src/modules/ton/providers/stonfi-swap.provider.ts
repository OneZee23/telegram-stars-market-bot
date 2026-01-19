/* eslint-disable @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports, import/no-extraneous-dependencies */
import { TonBalanceProvider } from '@modules/ton/providers/ton-balance.provider';
import { TonWalletProvider } from '@modules/ton/providers/ton-wallet.provider';
import { Injectable, Logger } from '@nestjs/common';
import { StonApiClient } from '@ston-fi/api';
import {
  Blockchain,
  GaslessSettlement,
  Omniston,
  SettlementMethod,
} from '@ston-fi/omniston-sdk';
import { Address, TonClient } from '@ton/ton';
import { TonConfig } from '../ton.config';

export interface SwapResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

export interface SwapQuote {
  fromAmount: string;
  toAmount: string;
  minToAmount: string;
}

@Injectable()
export class StonfiSwapService {
  private readonly logger = new Logger(StonfiSwapService.name);

  private readonly stonApiClient: StonApiClient;

  private readonly tonClient: TonClient;

  private readonly omniston: Omniston;

  private readonly TON_NATIVE_ADDRESS =
    'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c';

  constructor(
    private readonly config: TonConfig,
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

  async getWalletBalances(
    walletAddress: string,
  ): Promise<{ ton: string; usdt: string } | null> {
    return this.tonBalanceProvider.getWalletBalances(walletAddress);
  }

  async getSwapQuoteFromUsdt(usdtAmount: string): Promise<SwapQuote | null> {
    try {
      const usdtAmountBigInt = BigInt(usdtAmount);
      const usdtUnits = Number(usdtAmountBigInt);

      if (usdtUnits < 1000) {
        this.logger.warn(`USDT amount too small: ${usdtAmount}`);
        return null;
      }

      const simulationResult = await this.stonApiClient.simulateSwap({
        offerAddress: this.config.usdtJettonAddress,
        askAddress: this.TON_NATIVE_ADDRESS,
        offerUnits: usdtAmount,
        slippageTolerance: this.getSlippageTolerance().toString(),
      });

      if (!simulationResult?.minAskUnits) {
        throw new Error('Invalid simulation result from STON.fi');
      }

      const receivedTonNano = BigInt(simulationResult.minAskUnits.toString());
      const minTonAmount = this.calculateMinAmountWithSlippage(receivedTonNano);

      return {
        fromAmount: usdtAmount,
        toAmount: receivedTonNano.toString(),
        minToAmount: minTonAmount.toString(),
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to get swap quote from USDT: ${errorMessage}`);

      return this.createFallbackQuoteFromUsdt(usdtAmount, errorMessage);
    }
  }

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

      const quote = await this.requestOmnistonQuote(usdtAmount);
      this.verifyQuoteMeetsMinimum(quote, minTonAmount);

      const tx = await this.buildOmnistonTransaction(quote, walletData);
      await this.sendOmnistonTransaction(tx, walletData);

      this.logger.log(
        `Swap transaction sent via Omniston. Quote ID: ${quote.quoteId}`,
      );

      await this.waitForTransactionConfirmation();

      return {
        success: true,
        txHash: `omniston-${quote.quoteId}`,
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

  private async requestOmnistonQuote(usdtAmount: string): Promise<any> {
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
      let quoteReceived = false;
      const timeoutId = setTimeout(() => {
        if (subscription) {
          subscription.unsubscribe();
        }
        if (!quoteReceived) {
          reject(new Error('Quote request timeout'));
        }
      }, 15000);

      subscription = (quoteObservable as any).subscribe({
        next: (event: any) => {
          if (event.type === 'ack') {
            this.logger.debug('Quote request acknowledged');
          } else if (event.type === 'quoteUpdated') {
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

    return quote;
  }

  private verifyQuoteMeetsMinimum(quote: any, minTonAmount: string): void {
    const quoteAskAmount = BigInt(quote.askUnits);
    const minTonAmountBigInt = BigInt(minTonAmount);
    if (quoteAskAmount < minTonAmountBigInt) {
      throw new Error(
        `Quote amount ${quote.askUnits} is less than minimum required ${minTonAmount}`,
      );
    }
  }

  private async buildOmnistonTransaction(
    quote: any,
    walletData: { address: string; privateKey: Uint8Array },
  ): Promise<any> {
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
    return tx;
  }

  private async sendOmnistonTransaction(
    tx: any,
    walletData: { address: string; privateKey: Uint8Array },
  ): Promise<void> {
    const { WalletContractV3R2 } = await import('@ton/ton');
    const { keyPairFromSecretKey } = await import('@ton/crypto');

    const privateKeyBuffer = Buffer.from(walletData.privateKey);
    const keyPair = keyPairFromSecretKey(privateKeyBuffer);

    const walletContract = this.tonClient.open(
      WalletContractV3R2.create({
        publicKey: keyPair.publicKey,
        workchain: 0,
      }),
    );

    const seqno = await walletContract.getSeqno();
    const messageList = await this.buildMessageList(tx.ton.messages);

    await walletContract.sendTransfer({
      seqno,
      secretKey: privateKeyBuffer,
      messages: messageList,
    });
  }

  private async buildMessageList(messages: any[]): Promise<any[]> {
    const { internal, Cell } = await import('@ton/ton');
    const messageList = [];

    for (const message of messages) {
      const targetAddress = Address.parse(message.targetAddress);
      const sendAmount = BigInt(message.sendAmount);
      let body: InstanceType<typeof Cell> | undefined;

      if (message.payload) {
        const payloadBytes = message.payload.startsWith('0x')
          ? Buffer.from(message.payload.slice(2), 'hex')
          : Buffer.from(message.payload, 'base64');
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

    return messageList;
  }

  private calculateMinAmountWithSlippage(amount: bigint): bigint {
    const slippageMultiplier = BigInt(100 - this.config.swapSlippageTolerance);
    return (amount * slippageMultiplier) / BigInt(100);
  }

  private createFallbackQuoteFromUsdt(
    usdtAmount: string,
    errorMessage: string,
  ): SwapQuote {
    const usdtAmountBigInt = BigInt(usdtAmount);
    const estimatedTonNano =
      (usdtAmountBigInt * BigInt(650000000)) / BigInt(1000000);
    const minToAmount = this.calculateMinAmountWithSlippage(estimatedTonNano);

    this.logger.warn(
      `Using fallback quote estimation. Real API call failed: ${errorMessage}`,
    );

    return {
      fromAmount: usdtAmount,
      toAmount: estimatedTonNano.toString(),
      minToAmount: minToAmount.toString(),
    };
  }

  private getSlippageTolerance(): number {
    return parseFloat(this.config.swapSlippageTolerance.toString()) / 100;
  }

  private async waitForTransactionConfirmation(
    maxWaitTime: number = 10000,
  ): Promise<void> {
    await new Promise<void>((resolve) => {
      setTimeout(() => resolve(), maxWaitTime);
    });
  }
}
