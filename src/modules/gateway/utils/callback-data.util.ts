/**
 * Utility functions for parsing and building callback data
 */

/**
 * Parse amount from callback data
 * Supports formats: "amount_50", "amount_50_test", "confirm_payment_50"
 * @returns amount or null if not found
 */
export function parseAmountFromCallback(callbackData: string): number | null {
  // Match patterns like: amount_50, amount_50_test, confirm_payment_50
  const match = callbackData.match(
    /(?:amount_|confirm_payment_)(\d+)(?:_test)?/,
  );
  if (!match) {
    return null;
  }
  const amount = parseInt(match[1], 10);
  return Number.isNaN(amount) ? null : amount;
}

/**
 * Check if callback data is for amount selection
 */
export function isAmountCallback(callbackData: string): boolean {
  return callbackData.startsWith('amount_');
}

/**
 * Check if callback data is for payment confirmation
 */
export function isPaymentConfirmationCallback(callbackData: string): boolean {
  return callbackData.startsWith('confirm_payment_');
}

/**
 * Build callback data for amount selection
 */
export function buildAmountCallback(
  amount: number,
  isTest: boolean = false,
): string {
  return isTest ? `amount_${amount}_test` : `amount_${amount}`;
}

/**
 * Build callback data for payment confirmation
 */
export function buildPaymentCallback(amount: number): string {
  return `confirm_payment_${amount}`;
}
