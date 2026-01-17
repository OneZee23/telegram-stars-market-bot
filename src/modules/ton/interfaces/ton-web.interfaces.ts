export interface TonWebAddress {
  toString: (
    bounceable: boolean,
    testOnly: boolean,
    urlSafe: boolean,
    workchain?: number,
  ) => string;
}

export interface TonWebCellBits {
  writeUint8: (value: number) => void;
  writeAddress: (address: TonWebAddress) => TonWebCellBuilder;
  writeBytes: (bytes: Uint8Array) => void;
  readAddress: () => TonWebAddress | null;
}

export interface TonWebCell {
  toBoc: (includeCrc?: boolean) => Promise<Uint8Array>;
  bits: TonWebCellBits;
  refs: TonWebCell[];
  writeCell: (cell: TonWebCell) => void;
  beginParse: () => TonWebSlice;
  hash: () => Promise<Uint8Array>;
}

export interface TonWebCellBuilder {
  storeUint: (value: number | string, bitLength: number) => TonWebCellBuilder;
  storeAddress: (address: TonWebAddress) => TonWebCellBuilder;
  storeCoins: (amount: string) => TonWebCellBuilder;
  storeRef: (cell: TonWebCell) => TonWebCellBuilder;
  endCell: () => TonWebCell;
}

export interface TonWebSlice {
  loadAddress: () => TonWebAddress | null;
  readAddress: () => TonWebAddress | null;
}

export interface TonWebContractOutMsg {
  address: string;
  amount: string;
  payload: TonWebCell | null;
  stateInit: TonWebCell | null;
}

export interface TonWebContractHeader {
  [key: string]: unknown;
}

export interface TonWebContract {
  createOutMsg: (
    address: string,
    amount: string,
    payload: TonWebCell | null,
    stateInit: TonWebCell | null,
  ) => TonWebContractOutMsg;
  createExternalMessageHeader: (address: TonWebAddress) => TonWebContractHeader;
  createCommonMsgInfo: (
    header: TonWebContractHeader,
    stateInit: TonWebCell | null,
    body: TonWebCell,
  ) => TonWebCell;
}

export interface TonWebWallet {
  getAddress: () => Promise<TonWebAddress>;
  methods: {
    seqno: () => { call: () => Promise<number> };
  };
  createSigningMessage: (seqno: number) => TonWebSigningMessage;
  createStateInit: () => Promise<{ stateInit: TonWebCell }>;
}

export interface TonWebSigningMessage {
  bits: TonWebCellBits;
  refs: TonWebContractOutMsg[];
  toBoc: () => Promise<Uint8Array>;
}

export interface TonWebHttpProvider {
  getAddressInformation: (address: string) => Promise<TonWebAddressInfo>;
  sendBoc: (boc: string) => Promise<TonWebSendBocResult>;
  call2: (
    address: string,
    method: string,
    params: TonWebCall2Param[],
  ) => Promise<TonWebCall2Result>;
}

export interface TonWebAddressInfo {
  state?: string;
  balance?: string;
}

export type TonWebSendBocResult =
  | string
  | {
      hash?: string;
      tx_hash?: string;
      transaction_id?: string;
      result?: string;
    };

export type TonWebCall2Param = [string, string] | [string, TonWebCell];

export interface TonWebCall2Result {
  stack?: TonWebCall2StackItem[];
  result?: {
    stack?: TonWebCall2StackItem[];
  };
  bits?: TonWebCellBits;
  refs?: TonWebCell[];
  beginParse?: () => TonWebSlice;
  toBoc?: () => Promise<Uint8Array>;
}

export type TonWebCall2StackItem =
  | string
  | [unknown, string]
  | {
      cell?: string;
      value?: string | number;
      [key: number]: unknown;
    }
  | TonWebCell;

export interface TonWebUtils {
  Address: new (address: string) => TonWebAddress;
  toNano: (amount: string) => string;
  fromNano: (amount: string) => string;
  bytesToBase64: (bytes: Uint8Array) => string;
  base64ToBytes: (base64: string) => Uint8Array;
  bytesToHex: (bytes: Uint8Array) => string;
}

export interface TonWebBoc {
  Cell: {
    new (): TonWebCell;
    oneFromBoc: (bytes: Uint8Array) => TonWebCell;
  };
  CellBuilder: new () => TonWebCellBuilder;
}

export interface TonWebWalletAll {
  v3R2: new (
    provider: TonWebHttpProvider,
    options: { publicKey: Uint8Array },
  ) => TonWebWallet;
}

export interface TonWebTokenJetton {
  JettonWallet: new (
    provider: TonWebHttpProvider,
    options: { address: string },
  ) => TonWebJettonWallet;
}

export interface TonWebJettonWallet {
  getData: () => Promise<{
    balance: { toString: (radix: number) => string };
  }>;
}

export interface TonWebInstance {
  provider: TonWebHttpProvider;
  utils: TonWebUtils;
  boc: TonWebBoc;
  wallet: {
    all: TonWebWalletAll;
  };
  token?: {
    jetton?: TonWebTokenJetton;
  };
  Contract: TonWebContract;
}

export interface TonWebExtended {
  HttpProvider: new (
    url: string,
    options?: { apiKey?: string },
  ) => TonWebHttpProvider;
  utils: TonWebUtils;
  boc: TonWebBoc;
  wallet: {
    all: TonWebWalletAll;
  };
  Contract: TonWebContract;
}
