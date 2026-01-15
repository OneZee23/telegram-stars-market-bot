import { Injectable, Logger } from '@nestjs/common';
// eslint-disable-next-line import/no-extraneous-dependencies
import { StonApiClient } from '@ston-fi/api';
// eslint-disable-next-line import/no-extraneous-dependencies
import { dexFactory } from '@ston-fi/sdk';
// eslint-disable-next-line import/no-extraneous-dependencies
import { TonClient } from '@ton/ton';
import { mnemonicToPrivateKey } from 'ton-crypto';
import * as TonWeb from 'tonweb';
import * as nacl from 'tweetnacl';
import {
  SwapQuote,
  SwapResult,
  TonWebExtended,
  TonWebHttpProvider,
  TonWebInstance,
} from '../interfaces';
import { TonConfig } from '../ton.config';
import {
  extractTxHash,
  fromTonUnits,
  fromUsdtUnits,
  getBaseUrl,
  parseAddressFromCall2Result,
  toTonUnits,
  toUsdtUnits,
  USDT_DECIMALS,
  validateAmount,
  waitForTransactionConfirmation,
} from '../utils';

@Injectable()
export class DexSwapService {
  private readonly logger = new Logger(DexSwapService.name);

  private readonly stonApiClient: StonApiClient;

  private readonly tonClient: TonClient;

  private readonly DEFAULT_USDT_JETTON_ADDRESS =
    'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs';

  private readonly TON_NATIVE_ADDRESS =
    'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c';

  private readonly DEFAULT_MIN_TON_FOR_FEES = '100000000';

  constructor(private readonly config: TonConfig) {
    this.stonApiClient = new StonApiClient();
    this.tonClient = new TonClient({
      endpoint:
        this.config.toncenterRpcUrl || 'https://toncenter.com/api/v2/jsonRPC',
      apiKey: this.config.toncenterApiKey,
    });
  }

  async getTonBalance(walletAddress: string): Promise<string> {
    try {
      const baseUrl = getBaseUrl(this.config.toncenterRpcUrl);
      const url = new URL(`${baseUrl}/getAddressInformation`);
      url.searchParams.append('address', walletAddress);
      if (this.config.toncenterApiKey) {
        url.searchParams.append('api_key', this.config.toncenterApiKey);
      }

      this.logger.debug(`Getting TON balance for wallet: ${walletAddress}`);

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          `TON balance API error: HTTP ${response.status}: ${errorText}`,
        );
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      if (!data.ok) {
        this.logger.error(
          `TON balance API error: ${data.error || JSON.stringify(data)}`,
        );
        throw new Error(`API error: ${data.error || JSON.stringify(data)}`);
      }

      const balance = data.result?.balance || '0';
      const TonWebTyped = TonWeb as unknown as TonWebExtended;
      const tonBalance = TonWebTyped.utils.fromNano(balance);
      this.logger.debug(
        `TON balance: ${tonBalance} TON (raw: ${balance} nano)`,
      );
      return tonBalance;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to get TON balance: ${message}`);
      throw error;
    }
  }

  async getUsdtBalance(walletAddress: string): Promise<string> {
    try {
      const jettonMasterAddress =
        this.config.usdtJettonAddress || this.DEFAULT_USDT_JETTON_ADDRESS;
      this.logger.debug(
        `Getting USDT balance for wallet: ${walletAddress}, jetton master: ${jettonMasterAddress}`,
      );
      const { tonWebInstance } = this.createTonWebInstance();

      const jettonWalletAddress = await this.getJettonWalletAddress(
        walletAddress,
        jettonMasterAddress,
        tonWebInstance,
      );

      if (!jettonWalletAddress) {
        this.logger.warn(
          `Failed to get jetton wallet address for ${walletAddress}`,
        );
        return '0';
      }

      this.logger.debug(`Jetton wallet address: ${jettonWalletAddress}`);

      const JettonWalletClass = (
        TonWeb as { token?: { jetton?: { JettonWallet: unknown } } }
      ).token?.jetton?.JettonWallet;
      if (!JettonWalletClass) {
        this.logger.error('JettonWallet class not found in TonWeb');
        return '0';
      }

      const wallet = new (JettonWalletClass as new (
        provider: TonWebHttpProvider,
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
      const usdtBalance = (
        parseFloat(balance) /
        10 ** USDT_DECIMALS
      ).toString();
      this.logger.debug(
        `USDT balance: ${usdtBalance} USDT (raw: ${balance} nano)`,
      );
      return usdtBalance;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to get USDT balance: ${message}`);
      return '0';
    }
  }

  async getSwapQuote(usdtAmount: string): Promise<SwapQuote | null> {
    try {
      const amount = validateAmount(usdtAmount, 'USDT');
      const usdtUnits = toUsdtUnits(amount);
      const slippageTolerance = this.getSlippageTolerance();

      if (usdtUnits < 1000000) {
        this.logger.warn(`USDT amount too small: ${usdtAmount}`);
        return null;
      }

      const simulationResult = await this.stonApiClient.simulateSwap({
        offerAddress:
          this.config.usdtJettonAddress || this.DEFAULT_USDT_JETTON_ADDRESS,
        askAddress: this.TON_NATIVE_ADDRESS,
        offerUnits: usdtUnits.toString(),
        slippageTolerance: slippageTolerance.toString(),
      });

      if (!simulationResult?.minAskUnits) {
        throw new Error('Invalid simulation result from STON.fi');
      }

      const tonAmount = fromTonUnits(simulationResult.minAskUnits);

      return {
        usdtAmount,
        tonAmount,
        minTonAmount: tonAmount,
        rate: parseFloat(tonAmount) / parseFloat(usdtAmount),
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to get swap quote: ${message}`);
      return null;
    }
  }

  async calculateRequiredUsdt(tonAmount: string): Promise<string | null> {
    try {
      const amount = validateAmount(tonAmount, 'TON');
      const tonUnits = toTonUnits(amount);
      const slippageTolerance = this.getSlippageTolerance();

      if (tonUnits < 100000000) {
        this.logger.warn(`TON amount too small: ${tonAmount}`);
        return null;
      }

      const simulationResult = await this.stonApiClient.simulateSwap({
        offerAddress: this.TON_NATIVE_ADDRESS,
        askAddress:
          this.config.usdtJettonAddress || this.DEFAULT_USDT_JETTON_ADDRESS,
        offerUnits: tonUnits.toString(),
        slippageTolerance: slippageTolerance.toString(),
      });

      if (!simulationResult?.minAskUnits) {
        throw new Error('Invalid simulation result from STON.fi');
      }

      return fromUsdtUnits(simulationResult.minAskUnits);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to calculate required USDT: ${message}`);
      return null;
    }
  }

  async swapUsdtToTon(
    usdtAmount: string,
    minTonAmount: string,
    walletAddress: string,
    privateKey: Uint8Array,
  ): Promise<SwapResult> {
    try {
      this.logger.log(`Swapping ${usdtAmount} USDT → min ${minTonAmount} TON`);

      const usdtUnits = toUsdtUnits(parseFloat(usdtAmount));
      const slippageTolerance = this.getSlippageTolerance();

      const simulationResult = await this.stonApiClient.simulateSwap({
        offerAddress:
          this.config.usdtJettonAddress || this.DEFAULT_USDT_JETTON_ADDRESS,
        askAddress: this.TON_NATIVE_ADDRESS,
        offerUnits: usdtUnits.toString(),
        slippageTolerance: slippageTolerance.toString(),
      });

      const { router: routerInfo } = simulationResult;
      const dexContracts = dexFactory(routerInfo);
      const router = this.tonClient.open(
        dexContracts.Router.create(routerInfo.address),
      );
      const proxyTon = dexContracts.pTON.create(routerInfo.ptonMasterAddress);

      const txParams = await router.getSwapJettonToTonTxParams({
        userWalletAddress: walletAddress,
        offerJettonAddress:
          this.config.usdtJettonAddress || this.DEFAULT_USDT_JETTON_ADDRESS,
        offerAmount: simulationResult.offerUnits,
        minAskAmount: simulationResult.minAskUnits,
        proxyTon,
        queryId: Date.now(),
      });

      const { httpProvider, tonWebInstance } = this.createTonWebInstance();
      const signedTx = await this.signTransactionFromParams(
        txParams as unknown as {
          messages?: Array<{
            address: string;
            amount: string;
            payload?: string;
          }>;
        },
        privateKey,
        httpProvider,
        tonWebInstance,
      );

      this.logger.debug('Sending swap transaction to blockchain...');
      const txHash = await tonWebInstance.provider.sendBoc(signedTx);
      const hash = extractTxHash(txHash);

      if (!hash || hash.toLowerCase().includes('error')) {
        this.logger.error(
          `Swap transaction failed: ${hash || 'unknown error'}`,
        );
        throw new Error(`Transaction failed: ${hash || 'unknown error'}`);
      }

      this.logger.log(`Swap transaction sent successfully. TX Hash: ${hash}`);
      this.logger.debug('Waiting for transaction confirmation...');
      await waitForTransactionConfirmation();
      this.logger.debug('Transaction confirmation wait completed');

      this.logger.log(
        `Swap completed successfully: ${usdtAmount} USDT → ${minTonAmount} TON, TX: ${hash}`,
      );
      return {
        success: true,
        txHash: hash,
        usdtAmount,
        tonAmount: minTonAmount,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Swap failed: ${message}. Attempted: ${usdtAmount} USDT → min ${minTonAmount} TON`,
      );
      return { success: false, error: message };
    }
  }

  async checkSufficientBalance(
    walletAddress: string,
    requiredTonAmount: string,
  ): Promise<{ canPurchase: boolean; error?: string }> {
    try {
      const totalRequired = this.calculateTotalRequired(requiredTonAmount);

      let usdtBalance: number;
      let tonBalance: number;

      try {
        usdtBalance = parseFloat(await this.getUsdtBalance(walletAddress));
        tonBalance = parseFloat(await this.getTonBalance(walletAddress));
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to get balances: ${message}`);
        return { canPurchase: false, error: 'balance_check_failed' };
      }

      if (tonBalance >= totalRequired) {
        return { canPurchase: true };
      }

      const tonNeeded = totalRequired - tonBalance;
      const usdtNeeded = await this.calculateRequiredUsdt(tonNeeded.toString());

      if (!usdtNeeded) {
        return usdtBalance === 0 && tonBalance < totalRequired
          ? { canPurchase: false, error: 'insufficient_balance' }
          : { canPurchase: true };
      }

      const usdtNeededFloat = parseFloat(usdtNeeded);
      if (usdtBalance >= usdtNeededFloat) {
        return { canPurchase: true };
      }

      return {
        canPurchase: false,
        error: 'insufficient_balance',
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Balance check failed: ${message}`);
      return { canPurchase: false, error: 'balance_check_failed' };
    }
  }

  getMinTonForFees(): string {
    return this.config.minTonForFees || this.DEFAULT_MIN_TON_FOR_FEES;
  }

  getSwapReservePercent(): number {
    return parseFloat(this.config.swapReservePercent || '5');
  }

  private async getJettonWalletAddress(
    account: string,
    jettonMasterAddress: string,
    tonWebInstance: TonWebInstance,
  ): Promise<string | null> {
    try {
      const cell = new tonWebInstance.boc.Cell();
      cell.bits.writeAddress(new tonWebInstance.utils.Address(account));
      const slice = tonWebInstance.utils.bytesToBase64(await cell.toBoc(false));

      const result = await tonWebInstance.provider.call2(
        jettonMasterAddress,
        'get_wallet_address',
        [['tvm.Slice', slice]],
      );

      const address = await parseAddressFromCall2Result(result, tonWebInstance);
      if (!address) {
        return null;
      }

      return new tonWebInstance.utils.Address(address).toString(
        true,
        true,
        true,
        0,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to get jetton wallet address: ${message}`);
      return null;
    }
  }

  private async signTransactionFromParams(
    txParams: {
      messages?: Array<{
        address: string;
        amount: string;
        payload?: string;
      }>;
    },
    privateKey: Uint8Array,
    httpProvider: TonWebHttpProvider,
    tonWebInstance: TonWebInstance,
  ): Promise<string> {
    const TonWebTyped = TonWeb as unknown as TonWebExtended;
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

  private createTonWebInstance(): {
    httpProvider: TonWebHttpProvider;
    tonWebInstance: TonWebInstance;
  } {
    const TonWebTyped = TonWeb as unknown as TonWebExtended;
    const httpProvider = new TonWebTyped.HttpProvider(
      this.config.toncenterRpcUrl || 'https://toncenter.com/api/v2/jsonRPC',
      { apiKey: this.config.toncenterApiKey },
    );
    const tonWebInstance = new (TonWeb as unknown as new (
      provider: TonWebHttpProvider,
    ) => TonWebInstance)(httpProvider);
    return { httpProvider, tonWebInstance };
  }

  private getSlippageTolerance(): number {
    return parseFloat(this.config.swapSlippageTolerance || '1') / 100;
  }

  private calculateTotalRequired(requiredTonAmount: string): number {
    const requiredTon = parseFloat(requiredTonAmount) / 1e9;
    const reservePercent = this.getSwapReservePercent();
    const requiredWithReserve = requiredTon * (1 + reservePercent / 100);
    const minTonForFees = parseFloat(this.getMinTonForFees()) / 1e9;
    return requiredWithReserve + minTonForFees;
  }
}
