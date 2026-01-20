import type { PricingConfig, StarPricing } from './pricing.config';
import { getPriceForAmount } from './pricing.config';

/**
 * Configuration for available star amounts
 * Add new amounts here to make them available in the bot
 *
 * NOTE: Currently all purchases are test claims (whitelist required, one-time only)
 * This is temporary until MVP release - remember to remove test claim logic later
 */
export interface StarAmountConfig {
  amount: number;
}

/**
 * Calculate price for specific amount
 */
function calculatePriceForAmount(
  amount: number,
  config: PricingConfig,
): StarPricing {
  return getPriceForAmount(amount, config);
}

/**
 * Get available star amounts configuration
 * Pricing is calculated dynamically based on PricingConfig
 * Amounts are read from PricingConfig.availableStarAmounts
 */
export function getAvailableStarAmounts(
  pricingConfig: PricingConfig,
): Array<StarAmountConfig & { pricing: StarPricing }> {
  const amounts: StarAmountConfig[] = pricingConfig.availableStarAmounts.map(
    (amount) => ({
      amount,
    }),
  );

  return amounts.map((config) => ({
    ...config,
    pricing: calculatePriceForAmount(config.amount, pricingConfig),
  }));
}

/**
 * Get all test claim amounts (for whitelisted users)
 * NOTE: Currently all amounts are test claims - this is temporary until MVP
 */
export function getTestClaimAmounts(
  pricingConfig: PricingConfig,
): Array<StarAmountConfig & { pricing: StarPricing }> {
  return getAvailableStarAmounts(pricingConfig);
}

/**
 * Get all regular purchase amounts (not test claims)
 * NOTE: Currently returns empty array - all amounts are test claims until MVP
 */
export function getRegularPurchaseAmounts(): Array<
  StarAmountConfig & { pricing: StarPricing }
> {
  return [];
}

/**
 * Get all available amounts
 */
export function getAllAmounts(
  pricingConfig: PricingConfig,
): Array<StarAmountConfig & { pricing: StarPricing }> {
  return getAvailableStarAmounts(pricingConfig);
}

/**
 * Check if amount is available
 */
export function isAmountAvailable(
  amount: number,
  pricingConfig: PricingConfig,
): boolean {
  return getAvailableStarAmounts(pricingConfig).some(
    (config) => config.amount === amount,
  );
}

/**
 * Get config for specific amount
 */
export function getAmountConfig(
  amount: number,
  pricingConfig: PricingConfig,
): (StarAmountConfig & { pricing: StarPricing }) | undefined {
  return getAvailableStarAmounts(pricingConfig).find(
    (config) => config.amount === amount,
  );
}

/**
 * Check if amount is a test claim
 * NOTE: Currently always returns true - all amounts are test claims until MVP
 */
export function isTestClaimAmount(
  amount: number,
  pricingConfig: PricingConfig,
): boolean {
  // All amounts are test claims until MVP release
  return isAmountAvailable(amount, pricingConfig);
}

/**
 * Get pricing for specific amount
 */
export function getAmountPricing(
  amount: number,
  pricingConfig: PricingConfig,
): StarPricing | undefined {
  const config = getAmountConfig(amount, pricingConfig);
  return config?.pricing;
}
