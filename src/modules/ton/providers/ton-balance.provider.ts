/* eslint-disable @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports, import/no-extraneous-dependencies */
import { Injectable, Logger } from '@nestjs/common';
import * as TonWeb from 'tonweb';
import { TonConfig } from '../ton.config';
import { WalletBalance } from '../ton.iface';

/**
 * Extended TonWeb interface
 */
interface TonWebExtended {
  HttpProvider: new (
    url: string,
    options?: { apiKey?: string },
  ) => HttpProvider;
  boc: {
    Cell: {
      new (): CellBuilder;
      oneFromBoc: (bytes: Uint8Array) => Cell;
    };
  };
  utils: {
    Address: new (address: string) => Address;
    bytesToBase64: (bytes: Uint8Array) => string;
    base64ToBytes: (base64: string) => Uint8Array;
  };
  provider: {
    call2: (address: string, method: string, params: any[]) => Promise<any>;
  };
  token?: {
    jetton?: {
      JettonWallet: new (
        provider: any,
        options: { address: string },
      ) => {
        getData: () => Promise<{
          balance: { toString: (radix: number) => string };
        }>;
      };
    };
  };
}

interface HttpProvider {
  call2?: (address: string, method: string, params: any[]) => Promise<any>;
}

interface Address {
  toString: (
    bounceable: boolean,
    testOnly: boolean,
    urlSafe: boolean,
  ) => string;
}

interface Cell {
  bits: {
    readAddress: () => Address | null;
    writeAddress: (address: Address) => void;
  };
}

interface CellBuilder {
  bits: {
    writeAddress: (address: Address) => void;
  };
  toBoc: (isBase64?: boolean) => Promise<Uint8Array>;
}

/**
 * Provider for TON balance operations
 * Handles getting TON and USDT (jetton) balances
 */
@Injectable()
export class TonBalanceProvider {
  private readonly logger = new Logger(TonBalanceProvider.name);

  constructor(private readonly config: TonConfig) {}

  /**
   * Get wallet balances (TON and USDT)
   */
  async getWalletBalances(
    walletAddress: string,
  ): Promise<WalletBalance | null> {
    try {
      const tonBalance = await this.getTonBalance(walletAddress);
      const usdtBalance = await this.getJettonBalance(
        walletAddress,
        this.config.usdtJettonAddress,
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
  async getTonBalance(walletAddress: string): Promise<string> {
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
   * Get jetton balance for a wallet address
   * First finds the jetton wallet address, then gets its balance
   */
  async getJettonBalance(
    walletAddress: string,
    jettonAddress: string,
  ): Promise<string> {
    try {
      const url =
        this.config.toncenterRpcUrl || 'https://toncenter.com/api/v2/jsonRPC';
      const apiKey = this.config.toncenterApiKey;

      const TonWebTyped = TonWeb as unknown as TonWebExtended;
      const httpProvider = new TonWebTyped.HttpProvider(url, {
        apiKey,
      });
      const tonWebInstance = new (TonWeb as any)(httpProvider);

      const cell = new tonWebInstance.boc.Cell();
      cell.bits.writeAddress(new tonWebInstance.utils.Address(walletAddress));
      const slice = tonWebInstance.utils.bytesToBase64(await cell.toBoc(false));

      const result = await tonWebInstance.provider.call2(
        jettonAddress,
        'get_wallet_address',
        [['tvm.Slice', slice]],
      );

      const jettonWalletAddress = await this.parseAddressFromCall2Result(
        result,
        tonWebInstance,
      );

      if (!jettonWalletAddress) {
        return '0';
      }

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
   */
  private async parseAddressFromCall2Result(
    result: any,
    tonWebInstance: any,
  ): Promise<string | null> {
    if (!result) {
      return null;
    }

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

    if (result.result?.stack) {
      return this.parseAddressFromCall2Result(
        { stack: result.result.stack },
        tonWebInstance,
      );
    }

    return null;
  }
}
