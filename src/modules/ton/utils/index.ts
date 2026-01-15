import { TonWebCall2Result, TonWebInstance } from '../interfaces';

export const USDT_DECIMALS = 6;
export const TON_DECIMALS = 9;

export function validateAmount(amount: string, currency: string): number {
  const value = parseFloat(amount);
  if (value <= 0 || Number.isNaN(value)) {
    throw new Error(`Invalid ${currency} amount: ${amount}`);
  }
  return value;
}

export function toUsdtUnits(amount: number): number {
  return Math.floor(amount * 10 ** USDT_DECIMALS);
}

export function fromUsdtUnits(units: string): string {
  return (parseFloat(units) / 10 ** USDT_DECIMALS).toString();
}

export function toTonUnits(amount: number): number {
  return Math.floor(amount * 10 ** TON_DECIMALS);
}

export function fromTonUnits(units: string): string {
  return (parseFloat(units) / 10 ** TON_DECIMALS).toString();
}

export function getBaseUrl(toncenterRpcUrl?: string): string {
  return toncenterRpcUrl
    ? toncenterRpcUrl.replace('/jsonRPC', '')
    : 'https://toncenter.com/api/v2';
}

export function extractTxHash(
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

export async function waitForTransactionConfirmation(
  maxWaitTime: number = 10000,
): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(() => resolve(), maxWaitTime);
  });
}

export async function parseAddressFromCall2Result(
  result: TonWebCall2Result | null,
  tonWebInstance: TonWebInstance,
): Promise<string | null> {
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
            return address.toString(true, true, true, 0);
          }
        }
      }
    } catch {
      return null;
    }
  }

  if (result.stack && Array.isArray(result.stack) && result.stack.length > 0) {
    const [firstItem] = result.stack;

    if (typeof firstItem === 'string') {
      return firstItem;
    }

    if (Array.isArray(firstItem) && firstItem.length >= 2) {
      return String(firstItem[1]);
    }

    if (typeof firstItem === 'object' && firstItem !== null) {
      if ('cell' in firstItem && typeof firstItem.cell === 'string') {
        try {
          const cellBytes = tonWebInstance.utils.base64ToBytes(firstItem.cell);
          const addressCell = tonWebInstance.boc.Cell.oneFromBoc(cellBytes);
          const address = addressCell.bits.readAddress();
          if (address) {
            return address.toString(true, true, true, 0);
          }
        } catch {
          return null;
        }
      }
    }
  }

  if (result.result?.stack) {
    return parseAddressFromCall2Result(
      { stack: result.result.stack },
      tonWebInstance,
    );
  }

  return null;
}
