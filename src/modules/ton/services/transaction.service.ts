/* eslint-disable @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports, import/no-extraneous-dependencies */
import { Injectable, Logger } from '@nestjs/common';
import { mnemonicToPrivateKey } from 'ton-crypto';
import * as TonWeb from 'tonweb';
import * as nacl from 'tweetnacl';
import { TonConfig } from '../ton.config';
import { WalletData } from './wallet.service';

interface TonWebExtended {
  HttpProvider: new (
    url: string,
    options?: { apiKey?: string },
  ) => HttpProvider;
  boc: {
    Cell: new () => Cell;
  };
  utils: {
    base64ToBytes: (base64: string) => Uint8Array;
    bytesToBase64: (bytes: Uint8Array) => string;
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
  sendBoc: (boc: string) => Promise<
    | string
    | {
        hash?: string;
        tx_hash?: string;
        transaction_id?: string;
        result?: string;
      }
  >;
}

interface Wallet {
  getAddress: () => Promise<Address>;
  createStateInit: () => Promise<{ stateInit: Cell }>;
  methods: {
    seqno: () => { call: () => Promise<number> };
  };
  createSigningMessage: (seqno: number) => any;
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
  hash: () => Promise<Uint8Array>;
  bits: {
    writeUint8: (value: number) => void;
    writeBytes: (bytes: Uint8Array) => void;
  };
  refs: any[];
  writeCell: (cell: Cell) => void;
}

export interface TransactionMessage {
  address: string;
  amount: string;
  payload?: string;
}

export interface Transaction {
  validUntil: number;
  from: string;
  messages: TransactionMessage[];
}

@Injectable()
export class TransactionService {
  private readonly logger = new Logger(TransactionService.name);

  constructor(private readonly config: TonConfig) {}

  async signTransaction(
    transaction: Transaction,
    walletData: WalletData,
  ): Promise<string> {
    try {
      const TonWebTyped = TonWeb as unknown as TonWebExtended;

      const httpProvider = new TonWebTyped.HttpProvider(
        this.config.toncenterRpcUrl || 'https://toncenter.com/api/v2/jsonRPC',
        {
          apiKey: this.config.toncenterApiKey,
        },
      );
      const tonWebInstance = new (TonWeb as any)(httpProvider);

      const mnemonicArray = this.config.mnemonic.trim().split(/\s+/);
      const keyPair = await mnemonicToPrivateKey(mnemonicArray);
      const WalletClass = tonWebInstance.wallet.all.v3R2;
      const wallet = new WalletClass(httpProvider, {
        publicKey: keyPair.publicKey,
      });

      const seqno = (await wallet.methods.seqno().call()) || 0;

      const secretKeyUint8 =
        walletData.privateKey instanceof Buffer
          ? new Uint8Array(walletData.privateKey)
          : walletData.privateKey;

      const signingMessage = wallet.createSigningMessage(seqno);
      const SEND_MODE = 3;
      signingMessage.bits.writeUint8(SEND_MODE);

      for (const msg of transaction.messages) {
        let messagePayload = null;
        if (msg.payload) {
          const payloadBytes = tonWebInstance.utils.base64ToBytes(msg.payload);
          messagePayload = tonWebInstance.boc.Cell.oneFromBoc(payloadBytes);
        }

        const outMsg = tonWebInstance.Contract.createOutMsg(
          msg.address,
          msg.amount,
          messagePayload,
          null,
        );
        signingMessage.refs.push(outMsg);
      }

      const boc = await signingMessage.toBoc();
      const hash = await tonWebInstance.boc.Cell.oneFromBoc(boc).hash();

      const signature = nacl.sign.detached(hash, secretKeyUint8);

      const body = new TonWebTyped.boc.Cell();
      body.bits.writeBytes(signature);
      body.writeCell(tonWebInstance.boc.Cell.oneFromBoc(boc));

      let stateInit = null;
      if (seqno === 0) {
        const deploy = await wallet.createStateInit();
        stateInit = deploy.stateInit;
      }

      const selfAddress = await wallet.getAddress();
      const header =
        tonWebInstance.Contract.createExternalMessageHeader(selfAddress);
      const externalMessage = tonWebInstance.Contract.createCommonMsgInfo(
        header,
        stateInit,
        body,
      );

      const signedBoc = await externalMessage.toBoc();
      return tonWebInstance.utils.bytesToBase64(signedBoc);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to sign transaction: ${errorMessage}`);
      throw error;
    }
  }

  async sendTransaction(signedBoc: string): Promise<string | undefined> {
    try {
      const TonWebTyped = TonWeb as unknown as TonWebExtended;

      const httpProvider = new TonWebTyped.HttpProvider(
        this.config.toncenterRpcUrl || 'https://toncenter.com/api/v2/jsonRPC',
        {
          apiKey: this.config.toncenterApiKey,
        },
      );

      const result = await httpProvider.sendBoc(signedBoc);

      let txHash: string | undefined;

      if (typeof result === 'string') {
        txHash = result;
      } else if (typeof result === 'object' && result !== null) {
        txHash =
          (result as any).hash ||
          (result as any).tx_hash ||
          (result as any).transaction_id ||
          (result as any).result;
      }

      if (
        txHash &&
        typeof txHash === 'string' &&
        (txHash.toLowerCase().includes('error') ||
          txHash.toLowerCase().includes('rate') ||
          txHash.toLowerCase().includes('limit') ||
          txHash.toLowerCase().includes('exceed') ||
          txHash.toLowerCase().includes('fail'))
      ) {
        this.logger.error(
          `Blockchain API returned error message instead of txHash: ${txHash}`,
        );
        return undefined;
      }

      return txHash;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to send transaction to blockchain: ${errorMessage}`,
      );
      return undefined;
    }
  }
}
