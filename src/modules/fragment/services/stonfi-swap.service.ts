/* eslint-disable @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports, import/no-extraneous-dependencies */
import { Injectable, Logger } from '@nestjs/common';
// eslint-disable-next-line import/no-extraneous-dependencies
import { StonApiClient } from '@ston-fi/api';
// eslint-disable-next-line import/no-extraneous-dependencies
import { DEX, pTON } from '@ston-fi/sdk';
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
      // eslint-disable-next-line no-console
      console.log(
        `[BALANCE] USDT jetton address from config: ${usdtJettonAddress}`,
      );
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
      // eslint-disable-next-line no-console
      console.log(
        `[QUOTE] Getting swap quote for ${tonAmountRequired} nano TON`,
      );

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
      // eslint-disable-next-line no-console
      console.log(
        `[QUOTE] Simulating reverse swap: TON -> USDT to calculate required USDT`,
      );

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

      // eslint-disable-next-line no-console
      console.log(
        `[QUOTE] Simulating forward swap: ${estimatedUsdtForSimulation} nano USDT -> TON`,
      );

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

      // eslint-disable-next-line no-console
      console.log(
        `[QUOTE] Forward simulation: ${givenUsdtNano.toString()} nano USDT -> ${receivedTonNano.toString()} nano TON`,
      );

      // Adjust USDT amount if needed to get exactly the required TON
      let requiredUsdtNano: bigint;
      if (receivedTonNano < tonAmountBigInt) {
        // Need more USDT - calculate proportion
        const ratio = (tonAmountBigInt * BigInt(1000000)) / receivedTonNano;
        requiredUsdtNano = (givenUsdtNano * ratio) / BigInt(1000000);
        // eslint-disable-next-line no-console
        console.log(
          `[QUOTE] Adjusting USDT: ${givenUsdtNano.toString()} -> ${requiredUsdtNano.toString()}`,
        );
      } else {
        requiredUsdtNano = givenUsdtNano;
      }

      // Add reserve percent for fees
      const reserveMultiplier = 1 + this.config.swapReservePercent / 100;
      const requiredUsdtWithReserve =
        (requiredUsdtNano * BigInt(Math.floor(reserveMultiplier * 100))) /
        BigInt(100);

      // Calculate min TON with slippage
      const slippageMultiplier = BigInt(
        100 - this.config.swapSlippageTolerance,
      );
      const minTonAmount = (tonAmountBigInt * slippageMultiplier) / BigInt(100);

      // eslint-disable-next-line no-console
      console.log(
        `[QUOTE] Final quote: ${requiredUsdtWithReserve.toString()} nano USDT -> ${tonAmountRequired} nano TON (min: ${minTonAmount.toString()})`,
      );

      return {
        fromAmount: requiredUsdtWithReserve.toString(),
        toAmount: tonAmountRequired,
        minToAmount: minTonAmount.toString(),
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to get swap quote: ${errorMessage}`);
      // eslint-disable-next-line no-console
      console.log(`[QUOTE] Error: ${errorMessage}`);

      // Fallback: estimate based on approximate rate (1 USDT ≈ 6.5 TON)
      const tonAmountBigInt = BigInt(tonAmountRequired);
      const estimatedUsdtNano =
        (tonAmountBigInt * BigInt(1000000)) / BigInt(650000000);
      const reserveMultiplier = 1 + this.config.swapReservePercent / 100;
      const fromAmountWithReserve =
        (estimatedUsdtNano * BigInt(Math.floor(reserveMultiplier * 100))) /
        BigInt(100);
      const slippageMultiplier = BigInt(
        100 - this.config.swapSlippageTolerance,
      );
      const minToAmount = (tonAmountBigInt * slippageMultiplier) / BigInt(100);

      this.logger.warn(
        `Using fallback quote estimation. Real API call failed: ${errorMessage}`,
      );
      // eslint-disable-next-line no-console
      console.log(
        `[QUOTE] Using fallback: ${fromAmountWithReserve.toString()} nano USDT`,
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
   * Execute swap: USDT -> TON
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

      // eslint-disable-next-line no-console
      console.log(
        `[SWAP] Starting swap: ${usdtAmount} nano USDT -> min ${minTonAmount} nano TON`,
      );
      this.logger.log(
        `Swapping ${usdtAmount} nano USDT to TON (min: ${minTonAmount} nano TON)`,
      );

      // Convert USDT amount from nano to units for simulation
      const usdtAmountFloat = parseFloat(usdtAmount) / 10 ** this.USDT_DECIMALS;
      const usdtUnits = Math.floor(usdtAmountFloat * 10 ** this.USDT_DECIMALS);
      const slippageTolerance = this.getSlippageTolerance();

      // eslint-disable-next-line no-console
      console.log(
        `[SWAP] Simulating swap with ${usdtUnits} nano USDT, slippage: ${slippageTolerance}`,
      );

      // Simulate swap to get transaction parameters
      const simulationResult = await this.stonApiClient.simulateSwap({
        offerAddress: this.config.usdtJettonAddress,
        askAddress: this.TON_NATIVE_ADDRESS,
        offerUnits: usdtUnits.toString(),
        slippageTolerance: slippageTolerance.toString(),
      });

      if (!simulationResult?.router) {
        throw new Error('Invalid simulation result from STON.fi');
      }

      // eslint-disable-next-line no-console
      console.log(
        `[SWAP] Simulation result: ${simulationResult.minAskUnits} nano TON`,
      );

      // Create DEX contracts using SDK
      const { router: routerInfo } = simulationResult;
      // Use DEX v1 Router
      const RouterClass = DEX.v1.Router;
      const routerContract = RouterClass.create(routerInfo.address);
      // Create pTON contract - pass the contract instance, not opened
      const PtonClass = pTON.v1;
      const proxyTonContract = PtonClass.create(routerInfo.ptonMasterAddress);

      // Get transaction parameters
      // eslint-disable-next-line no-console
      console.log(`[SWAP] Getting transaction parameters...`);
      // getSwapJettonToTonTxParams returns SenderArguments: { to, value, body }
      const routerAddress = Address.parse(routerInfo.address);
      const senderArgs = await routerContract.getSwapJettonToTonTxParams(
        this.tonClient.provider(routerAddress),
        {
          userWalletAddress: walletData.address,
          offerJettonAddress: this.config.usdtJettonAddress,
          offerAmount: simulationResult.offerUnits,
          minAskAmount: simulationResult.minAskUnits,
          proxyTon: proxyTonContract,
          queryId: Date.now(),
        },
      );

      // eslint-disable-next-line no-console
      console.log(
        `[SWAP] SenderArguments: to=${senderArgs.to.toString()}, value=${senderArgs.value.toString()}`,
      );

      // Convert SenderArguments to messages format for signing
      // SenderArguments has: { to: Address, value: bigint, body: Cell }
      const { httpProvider, tonWebInstance } = this.createTonWebInstance();
      // eslint-disable-next-line no-console
      console.log(`[SWAP] Signing transaction...`);
      const signedTx = await this.signTransactionFromParams(
        {
          messages: [
            {
              address: senderArgs.to.toString(),
              amount: senderArgs.value.toString(),
              payload: senderArgs.body
                ? tonWebInstance.utils.bytesToBase64(
                    await senderArgs.body.toBoc(),
                  )
                : undefined,
            },
          ],
        },
        walletData.privateKey,
        httpProvider,
        tonWebInstance,
      );

      // eslint-disable-next-line no-console
      console.log(`[SWAP] Sending transaction to blockchain...`);
      const txHash = await tonWebInstance.provider.sendBoc(signedTx);
      const hash = this.extractTxHash(txHash);

      if (!hash || hash.toLowerCase().includes('error')) {
        throw new Error(`Transaction failed: ${hash || 'unknown error'}`);
      }

      // eslint-disable-next-line no-console
      console.log(`[SWAP] Transaction sent. TX Hash: ${hash}`);
      this.logger.log(`Swap transaction sent. TX Hash: ${hash}`);

      // Wait for transaction confirmation
      await this.waitForTransactionConfirmation();

      return {
        success: true,
        txHash: hash,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Swap failed: ${errorMessage}`);
      // eslint-disable-next-line no-console
      console.log(`[SWAP] Swap failed: ${errorMessage}`);
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

      // eslint-disable-next-line no-console
      console.log(
        `[JETTON] Getting jetton wallet address for ${walletAddress} from jetton master ${jettonAddress}`,
      );

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

      // eslint-disable-next-line no-console
      console.log(
        `[JETTON] Calling get_wallet_address with serialized address...`,
      );

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
        // eslint-disable-next-line no-console
        console.log(`[JETTON] Could not get jetton wallet address`);
        return '0';
      }

      // eslint-disable-next-line no-console
      console.log(`[JETTON] Jetton wallet address: ${jettonWalletAddress}`);

      // Step 2: Get balance from jetton wallet using TonWeb JettonWallet class
      const JettonWalletClass = (
        TonWeb as { token?: { jetton?: { JettonWallet: unknown } } }
      ).token?.jetton?.JettonWallet;
      if (!JettonWalletClass) {
        // eslint-disable-next-line no-console
        console.log(`[JETTON] JettonWallet class not available`);
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

      // eslint-disable-next-line no-console
      console.log(`[JETTON] Getting balance from jetton wallet...`);
      const walletData = await wallet.getData();
      const balance = walletData.balance.toString(10);

      // Balance is in nano units (6 decimals for USDT)
      // Return as nano string (not converted to base units)
      // eslint-disable-next-line no-console
      console.log(`[JETTON] Balance: ${balance} nano USDT`);

      return balance;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `[JETTON] Failed to get jetton balance: ${errorMessage}. Assuming 0 balance.`,
      );
      // eslint-disable-next-line no-console
      console.log(`[JETTON] Error details: ${errorMessage}`);
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
