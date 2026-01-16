/* eslint-disable @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports, import/no-extraneous-dependencies */
import { Injectable, Logger } from '@nestjs/common';
import { mnemonicToPrivateKey } from 'ton-crypto';
import * as TonWeb from 'tonweb';
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

  constructor(private readonly config: FragmentConfig) {}

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
      // Use STON.fi API to get quote
      // For now, we'll use a simple calculation based on current rates
      // In production, you should use STON.fi SDK or API

      // STON.fi API endpoint for quotes
      const quoteUrl = `https://api.ston.fi/v1/quote?from=${this.config.usdtJettonAddress}&to=TON&amount=${tonAmountRequired}`;

      const response = await fetch(quoteUrl);
      if (!response.ok) {
        throw new Error(`STON.fi API error: ${response.statusText}`);
      }

      const data = await response.json();

      // Calculate required USDT with reserve for fees
      // API may return numbers as strings or floats, need to normalize
      const fromAmountRaw = data.from_amount || data.amount_in;
      const toAmountRaw = data.to_amount || data.amount_out;
      const minToAmountRaw = data.min_to_amount || data.amount_out_min;

      // Convert to string and handle floats - convert to nano units
      // If it's already a string with decimal, we need to handle it
      const fromAmount = this.normalizeToNano(fromAmountRaw);
      const toAmount = this.normalizeToNano(toAmountRaw);
      const minToAmount = this.normalizeToNano(minToAmountRaw || toAmountRaw);

      // Add reserve percent for fees
      const reserveMultiplier = 1 + this.config.swapReservePercent / 100;
      const fromAmountWithReserve = (
        BigInt(fromAmount) * BigInt(Math.floor(reserveMultiplier * 100))
      ).toString();

      return {
        fromAmount: fromAmountWithReserve,
        toAmount,
        minToAmount,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to get swap quote: ${errorMessage}`);

      // Fallback: estimate based on approximate rate (1 USDT ≈ 6.5 TON)
      // This is a rough estimate, should be replaced with real API call
      const estimatedUsdt = (
        (BigInt(tonAmountRequired) * BigInt(100)) /
        BigInt(650)
      ).toString();
      const reserveMultiplier = 1 + this.config.swapReservePercent / 100;
      const fromAmountWithReserve = (
        BigInt(estimatedUsdt) * BigInt(Math.floor(reserveMultiplier * 100))
      ).toString();

      this.logger.warn(
        `Using fallback quote estimation. Real API call failed: ${errorMessage}`,
      );

      return {
        fromAmount: fromAmountWithReserve,
        toAmount: tonAmountRequired,
        minToAmount: (
          (BigInt(tonAmountRequired) *
            BigInt(100 - this.config.swapSlippageTolerance)) /
          BigInt(100)
        ).toString(),
      };
    }
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

      // For now, we'll use a simplified approach
      // In production, you should use @ston-fi/sdk to create and sign the swap transaction
      // This is a placeholder implementation

      this.logger.log(
        `Swapping ${usdtAmount} nano USDT to TON (min: ${minTonAmount} nano TON)`,
      );

      // TODO: Implement actual swap using @ston-fi/sdk
      // Example structure:
      // 1. Create swap transaction using STON.fi SDK
      // 2. Sign transaction with wallet private key
      // 3. Send transaction to blockchain
      // 4. Wait for confirmation

      // Placeholder: return error indicating implementation needed
      return {
        success: false,
        error:
          'STON.fi swap implementation pending. Please use @ston-fi/sdk to implement swap transaction.',
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
}
