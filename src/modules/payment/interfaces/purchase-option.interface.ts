/**
 * Purchase option interface
 * Represents a single purchase option with stars amount, price, and discount
 */
export interface PurchaseOption {
  /** Amount of stars in this option */
  starsAmount: number;

  /** Base price in rubles (without discount) */
  basePriceRub: number;

  /** Discount percentage (0-100) */
  discountPercent: number;

  /** Whether this option is active for purchase */
  isActive: boolean;

  /** Display order (lower number = shown first) */
  displayOrder: number;
}

