import { ConfigFragment } from '@common/config/config-fragment';
import { PurchaseOption } from './interfaces/purchase-option.interface';

/**
 * Configuration for purchase options
 * Contains hardcoded purchase options (stars amount, prices, discounts)
 * In the future, can be overridden via environment variable or config.json
 */
export class PurchaseOptionsConfig extends ConfigFragment {
  /**
   * Default purchase options (hardcoded)
   * Price per star: 1.244 RUB
   */
  private readonly defaultOptions: PurchaseOption[] = [
    {
      starsAmount: 50,
      basePriceRub: 62.2, // 50 * 1.244
      discountPercent: 0,
      isActive: true,
      displayOrder: 1,
    },
    {
      starsAmount: 100,
      basePriceRub: 124.4, // 100 * 1.244
      discountPercent: 0,
      isActive: true,
      displayOrder: 2,
    },
    {
      starsAmount: 200,
      basePriceRub: 248.8, // 200 * 1.244
      discountPercent: 0,
      isActive: true,
      displayOrder: 3,
    },
    {
      starsAmount: 500,
      basePriceRub: 622.0, // 500 * 1.244
      discountPercent: 0,
      isActive: true,
      displayOrder: 4,
    },
    {
      starsAmount: 1000,
      basePriceRub: 1244.0, // 1000 * 1.244
      discountPercent: 0,
      isActive: true,
      displayOrder: 5,
    },
  ];

  /**
   * Get all purchase options
   * Returns default options (can be extended to read from env/config in future)
   */
  public getOptions(): PurchaseOption[] {
    return this.defaultOptions;
  }
}

