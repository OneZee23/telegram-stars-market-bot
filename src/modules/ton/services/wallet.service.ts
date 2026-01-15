/* eslint-disable @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports, import/no-extraneous-dependencies */
import { Injectable, Logger } from '@nestjs/common';
import { mnemonicToPrivateKey } from 'ton-crypto';
import * as TonWeb from 'tonweb';
import { TonConfig } from '../ton.config';

interface TonWebExtended {
  HttpProvider: new (
    url: string,
    options?: { apiKey?: string },
  ) => HttpProvider;
  utils: {
    bytesToBase64: (bytes: Uint8Array) => string;
    bytesToHex: (bytes: Uint8Array) => string;
  };
  wallet: {
    all: {
      v3R2: new (
        provider: HttpProvider,
        options: { publicKey: Uint8Array },
      ) => Wallet;
    };
  };
}

interface HttpProvider {
  sendBoc: (boc: string) => Promise<any>;
}

interface Wallet {
  getAddress: () => Promise<Address>;
  createStateInit: () => Promise<{ stateInit: Cell }>;
}

interface Address {
  toString: (
    bounceable: boolean,
    testOnly: boolean,
    urlSafe: boolean,
  ) => string;
}

interface Cell {
  toBoc: () => Promise<Uint8Array>;
}

export interface WalletData {
  address: string;
  stateInit: string;
  publicKey: string;
  privateKey: Uint8Array;
}

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(private readonly config: TonConfig) {}

  async initializeWallet(): Promise<WalletData | null> {
    try {
      const mnemonicArray = this.config.mnemonic.trim().split(/\s+/);
      if (mnemonicArray.length !== 24) {
        throw new Error('Mnemonic must contain 24 words');
      }

      const keyPair = await mnemonicToPrivateKey(mnemonicArray);
      const privateKey = keyPair.secretKey;

      const TonWebTyped = TonWeb as unknown as TonWebExtended;

      const httpProvider = new TonWebTyped.HttpProvider(
        this.config.toncenterRpcUrl || 'https://toncenter.com/api/v2/jsonRPC',
        {
          apiKey: this.config.toncenterApiKey,
        },
      );

      const tonWebInstance = new (TonWeb as any)(httpProvider);

      const WalletClass = tonWebInstance.wallet.all.v3R2;
      const wallet = new WalletClass(httpProvider, {
        publicKey: keyPair.publicKey,
      });

      const address = await wallet.getAddress();
      const addressString = address.toString(true, true, true);

      const stateInit = await wallet.createStateInit();
      const stateInitCell = stateInit.stateInit;
      const stateInitBoc = await stateInitCell.toBoc();
      const stateInitBase64 = tonWebInstance.utils.bytesToBase64(stateInitBoc);

      const publicKeyHex = tonWebInstance.utils.bytesToHex(keyPair.publicKey);

      return {
        address: addressString,
        stateInit: stateInitBase64,
        publicKey: publicKeyHex,
        privateKey,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to initialize wallet: ${errorMessage}`);
      return null;
    }
  }
}
