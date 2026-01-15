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
import { TonConfig } from '../ton.config';

export interface SwapResult {
  success: boolean;
  txHash?: string;
  usdtAmount?: string;
  tonAmount?: string;
  error?: string;
}

export interface SwapQuote {
  usdtAmount: string;
  tonAmount: string;
  minTonAmount: string;
  rate: number;
}

interface TonWebExtended {
  HttpProvider: new (
    url: string,
    options?: { apiKey?: string },
  ) => HttpProvider;
  utils: {
    Address: new (address: string) => Address;
    toNano: (amount: string) => string;
    fromNano: (amount: string) => string;
    bytesToBase64: (bytes: Uint8Array) => string;
    base64ToBytes: (base64: string) => Uint8Array;
  };
  boc: {
    Cell: new () => Cell;
    CellBuilder: new () => CellBuilder;
  };
  wallet: {
    all: {
      v3R2: new (
        provider: HttpProvider,
        options: { publicKey: Uint8Array },
      ) => Wallet;
    };
  };
  Contract: {
    createOutMsg: (
      address: string,
      amount: string,
      payload: any,
      stateInit: any,
    ) => any;
    createExternalMessageHeader: (address: Address) => any;
    createCommonMsgInfo: (header: any, stateInit: any, body: Cell) => Cell;
  };
}

interface HttpProvider {
  getAddressInformation: (address: string) => Promise<any>;
  sendBoc: (boc: string) => Promise<string | any>;
  call2: (address: string, method: string, params: any[]) => Promise<any>;
}

interface Address {
  toString: (
    bounceable: boolean,
    testOnly: boolean,
    urlSafe: boolean,
    workchain?: number,
  ) => string;
}

interface Cell {
  toBoc: () => Promise<Uint8Array>;
  bits: {
    writeUint8: (value: number) => void;
    writeAddress: (address: Address) => CellBuilder;
    writeBytes: (bytes: Uint8Array) => void;
  };
  refs: any[];
  writeCell: (cell: Cell) => void;
}

interface CellBuilder {
  storeUint: (value: number | string, bitLength: number) => CellBuilder;
  storeAddress: (address: Address) => CellBuilder;
  storeCoins: (amount: string) => CellBuilder;
  storeRef: (cell: Cell) => CellBuilder;
  endCell: () => Cell;
}

interface Wallet {
  getAddress: () => Promise<Address>;
  methods: {
    seqno: () => { call: () => Promise<number> };
  };
  createSigningMessage: (seqno: number) => any;
  createStateInit: () => Promise<{ stateInit: Cell }>;
}

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

  private readonly USDT_DECIMALS = 6;

  private readonly TON_DECIMALS = 9;

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
      const baseUrl = this.getBaseUrl();
      const url = new URL(`${baseUrl}/getAddressInformation`);
      url.searchParams.append('address', walletAddress);
      if (this.config.toncenterApiKey) {
        url.searchParams.append('api_key', this.config.toncenterApiKey);
      }

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const data = await response.json();
      if (!data.ok) {
        throw new Error(`API error: ${data.error || JSON.stringify(data)}`);
      }

      const balance = data.result?.balance || '0';
      const TonWebTyped = TonWeb as unknown as TonWebExtended;
      return TonWebTyped.utils.fromNano(balance);
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
      const { tonWebInstance } = this.createTonWebInstance();

      const jettonWalletAddress = await this.getJettonWalletAddress(
        walletAddress,
        jettonMasterAddress,
        tonWebInstance,
      );

      if (!jettonWalletAddress) {
        return '0';
      }

      const JettonWalletClass = (TonWeb as any).token?.jetton?.JettonWallet;
      if (!JettonWalletClass) {
        return '0';
      }

      const wallet = new JettonWalletClass(tonWebInstance.provider, {
        address: jettonWalletAddress,
      });
      const walletData = await wallet.getData();
      const balance = walletData.balance.toString(10);
      return (parseFloat(balance) / 10 ** this.USDT_DECIMALS).toString();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to get USDT balance: ${message}`);
      return '0';
    }
  }

  async getSwapQuote(usdtAmount: string): Promise<SwapQuote | null> {
    try {
      const amount = this.validateAmount(usdtAmount, 'USDT');
      const usdtUnits = this.toUsdtUnits(amount);
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

      const tonAmount = this.fromTonUnits(simulationResult.minAskUnits);

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
      const amount = this.validateAmount(tonAmount, 'TON');
      const tonUnits = this.toTonUnits(amount);
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

      return this.fromUsdtUnits(simulationResult.minAskUnits);
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

      const usdtUnits = this.toUsdtUnits(parseFloat(usdtAmount));
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
        txParams,
        privateKey,
        walletAddress,
        httpProvider,
        tonWebInstance,
      );

      const txHash = await tonWebInstance.provider.sendBoc(signedTx);
      const hash = this.extractTxHash(txHash);

      if (!hash || hash.toLowerCase().includes('error')) {
        throw new Error(`Transaction failed: ${hash || 'unknown error'}`);
      }

      this.logger.log(`Swap transaction sent. TX Hash: ${hash}`);
      await this.waitForTransactionConfirmation();

      return {
        success: true,
        txHash: hash,
        usdtAmount,
        tonAmount: minTonAmount,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Swap failed: ${message}`);
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
    tonWebInstance: any,
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

      const address = await this.parseAddressFromCall2Result(
        result,
        tonWebInstance,
      );
      if (!address) {
        return null;
      }

      return new tonWebInstance.utils.Address(address).toString(
        true,
        true,
        true,
        false,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to get jetton wallet address: ${message}`);
      return null;
    }
  }

  private async parseAddressFromCall2Result(
    result: any,
    tonWebInstance: any,
    depth = 0,
  ): Promise<string | null> {
    if (depth > 3) {
      return null;
    }

    if (!result) {
      return null;
    }

    if (result.bits && result.refs !== undefined) {
      try {
        if (result.beginParse && typeof result.beginParse === 'function') {
          const slice = result.beginParse();
          if (slice?.loadAddress && typeof slice.loadAddress === 'function') {
            const address = slice.loadAddress();
            if (address) {
              return address.toString(true, true, true, false);
            }
          }
        }
      } catch {
        return null;
      }
    }

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
        return firstItem[1];
      }

      if (typeof firstItem === 'object' && firstItem !== null) {
        if (firstItem.cell) {
          try {
            const cellBytes = tonWebInstance.utils.base64ToBytes(
              firstItem.cell,
            );
            const addressCell = tonWebInstance.boc.Cell.oneFromBoc(cellBytes);
            const address = addressCell.bits.readAddress();
            if (address) {
              return address.toString(true, true, true, false);
            }
          } catch {
            return null;
          }
        }
      }
    }

    if (result.result?.stack) {
      return this.parseAddressFromCall2Result(
        result.result,
        tonWebInstance,
        depth + 1,
      );
    }

    return null;
  }

  private async signTransactionFromParams(
    txParams: any,
    privateKey: Uint8Array,
    walletAddress: string,
    httpProvider: HttpProvider,
    tonWebInstance: any,
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
    httpProvider: HttpProvider;
    tonWebInstance: any;
  } {
    const TonWebTyped = TonWeb as unknown as TonWebExtended;
    const httpProvider = new TonWebTyped.HttpProvider(
      this.config.toncenterRpcUrl || 'https://toncenter.com/api/v2/jsonRPC',
      { apiKey: this.config.toncenterApiKey },
    );
    const tonWebInstance = new (TonWeb as any)(httpProvider);
    return { httpProvider, tonWebInstance };
  }

  private getBaseUrl(): string {
    return this.config.toncenterRpcUrl
      ? this.config.toncenterRpcUrl.replace('/jsonRPC', '')
      : 'https://toncenter.com/api/v2';
  }

  private validateAmount(amount: string, currency: string): number {
    const value = parseFloat(amount);
    if (value <= 0 || Number.isNaN(value)) {
      throw new Error(`Invalid ${currency} amount: ${amount}`);
    }
    return value;
  }

  private toUsdtUnits(amount: number): number {
    return Math.floor(amount * 10 ** this.USDT_DECIMALS);
  }

  private fromUsdtUnits(units: string): string {
    return (parseFloat(units) / 10 ** this.USDT_DECIMALS).toString();
  }

  private toTonUnits(amount: number): number {
    return Math.floor(amount * 10 ** this.TON_DECIMALS);
  }

  private fromTonUnits(units: string): string {
    return (parseFloat(units) / 10 ** this.TON_DECIMALS).toString();
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

  private extractTxHash(txHash: any): string | null {
    if (typeof txHash === 'string') {
      return txHash;
    }
    return (
      (txHash as any)?.hash ||
      (txHash as any)?.tx_hash ||
      (txHash as any)?.transaction_id ||
      null
    );
  }

  private async waitForTransactionConfirmation(
    maxWaitTime: number = 10000,
  ): Promise<void> {
    await new Promise<void>((resolve) => {
      setTimeout(() => resolve(), maxWaitTime);
    });
  }
}
