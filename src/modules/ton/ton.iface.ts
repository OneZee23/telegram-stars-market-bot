/**
 * Wallet data structure
 */
export interface WalletData {
  address: string;
  stateInit: string;
  publicKey: string;
  privateKey: Uint8Array;
}

/**
 * Wallet data for swap operations (without stateInit)
 */
export interface WalletDataForSwap {
  address: string;
  privateKey: Uint8Array;
}

/**
 * Transaction message structure
 */
export interface TransactionMessage {
  address: string;
  amount: string;
  payload?: string;
}

/**
 * Transaction structure for signing
 */
export interface Transaction {
  validUntil: number;
  from: string;
  messages: TransactionMessage[];
}

/**
 * Wallet balance information
 */
export interface WalletBalance {
  ton: string; // TON balance in nano
  usdt: string; // USDT balance in nano
}
