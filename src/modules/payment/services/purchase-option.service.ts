import { Injectable } from '@nestjs/common';
import { PurchaseOptionsConfig } from '../purchase-options.config';
import { PurchaseOption } from '../interfaces/purchase-option.interface';

@Injectable()
export class PurchaseOptionService {
  constructor(private readonly config: PurchaseOptionsConfig) {}

  /**
   * Get all active purchase options, sorted by display order
   */
  getAllActiveOptions(): PurchaseOption[] {
    const options = this.config.getOptions();
    return options
      .filter((option) => option.isActive)
      .sort((a, b) => a.displayOrder - b.displayOrder);
  }

  /**
   * Get purchase option by stars amount
   */
  getOptionByStarsAmount(starsAmount: number): PurchaseOption | null {
    const options = this.config.getOptions();
    return (
      options.find(
        (option) =>
          option.starsAmount === starsAmount && option.isActive,
      ) || null
    );
  }

  /**
   * Calculate final price with discount applied
   */
  calculateFinalPrice(
    basePrice: number,
    discountPercent: number,
  ): number {
    return basePrice * (1 - discountPercent / 100);
  }

  /**
   * Get final price for an option
   */
  getFinalPrice(option: PurchaseOption): number {
    return this.calculateFinalPrice(
      option.basePriceRub,
      option.discountPercent,
    );
  }
}

