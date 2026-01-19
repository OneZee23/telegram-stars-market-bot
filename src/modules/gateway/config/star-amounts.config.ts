/**
 * Configuration for available star amounts
 * Add new amounts here to make them available in the bot
 */
export interface StarAmountConfig {
  amount: number;
  isTestClaim: boolean; // If true, requires whitelist and can only be claimed once
}

/**
 * Available star amounts for purchase
 * Test claim amounts are available only for whitelisted users and can be claimed once
 */
export const AVAILABLE_STAR_AMOUNTS: StarAmountConfig[] = [
  { amount: 50, isTestClaim: true },
  // Add more amounts here as needed:
  // { amount: 100, isTestClaim: false },
  // { amount: 200, isTestClaim: false },
  // { amount: 500, isTestClaim: false },
  // { amount: 1000, isTestClaim: false },
];

/**
 * Get all test claim amounts (for whitelisted users)
 */
export function getTestClaimAmounts(): StarAmountConfig[] {
  return AVAILABLE_STAR_AMOUNTS.filter((config) => config.isTestClaim);
}

/**
 * Get all regular purchase amounts (not test claims)
 */
export function getRegularPurchaseAmounts(): StarAmountConfig[] {
  return AVAILABLE_STAR_AMOUNTS.filter((config) => !config.isTestClaim);
}

/**
 * Get all available amounts
 */
export function getAllAmounts(): StarAmountConfig[] {
  return AVAILABLE_STAR_AMOUNTS;
}

/**
 * Check if amount is available
 */
export function isAmountAvailable(amount: number): boolean {
  return AVAILABLE_STAR_AMOUNTS.some((config) => config.amount === amount);
}

/**
 * Get config for specific amount
 */
export function getAmountConfig(amount: number): StarAmountConfig | undefined {
  return AVAILABLE_STAR_AMOUNTS.find((config) => config.amount === amount);
}

/**
 * Check if amount is a test claim
 */
export function isTestClaimAmount(amount: number): boolean {
  const config = getAmountConfig(amount);
  return config?.isTestClaim ?? false;
}
