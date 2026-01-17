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
