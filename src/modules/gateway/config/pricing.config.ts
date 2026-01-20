import { ConfigFragment } from '@common/config/config-fragment';
import { UseEnv } from '@common/config/use-env.decorator';
import { IsArray, IsInt, IsNumber, Min } from 'class-validator';

/**
 * Конфигурация параметров ценообразования
 */
export class PricingConfig extends ConfigFragment {
  /**
   * Курс USD/RUB
   * По умолчанию: 78
   */
  @IsNumber()
  @Min(1)
  @UseEnv('USD_RUB_RATE', (value?: string) => (value ? parseFloat(value) : 78))
  public readonly usdRubRate: number;

  /**
   * Цена за 50 звезд на Fragment (в USD)
   * По умолчанию: 0.75
   */
  @IsNumber()
  @Min(0.01)
  @UseEnv('PRICE_50_STARS_USD', (value?: string) =>
    value ? parseFloat(value) : 0.75,
  )
  public readonly price50StarsUsd: number;

  /**
   * Множитель резерва USDT
   * По умолчанию: 1.133 (0.85 / 0.75)
   */
  @IsNumber()
  @Min(1)
  @UseEnv('USDT_RESERVE_MULTIPLIER', (value?: string) =>
    value ? parseFloat(value) : 1.133,
  )
  public readonly usdtReserveMultiplier: number;

  /**
   * Комиссия эквайринга (в процентах)
   * По умолчанию: 3
   */
  @IsNumber()
  @Min(0)
  @UseEnv('ACQUIRER_FEE_PERCENT', (value?: string) =>
    value ? parseFloat(value) : 3,
  )
  public readonly acquirerFeePercent: number;

  /**
   * Доступные суммы звезд для покупки (через запятую)
   * Формат: "50,100,200,500,1000"
   * По умолчанию: [50]
   */
  @IsArray()
  @IsInt({ each: true })
  @Min(50, { each: true })
  @UseEnv('AVAILABLE_STAR_AMOUNTS', (value?: string) => {
    if (!value) return [50];
    return value
      .split(',')
      .map((v) => v.trim())
      .filter((v) => v.length > 0)
      .map((v) => parseInt(v, 10))
      .filter((v) => !Number.isNaN(v) && v >= 50);
  })
  public readonly availableStarAmounts: number[];
}

/**
 * Интерфейс для наценки по объему
 */
export interface VolumeMarkup {
  minAmount: number; // Минимальное количество звезд для этого уровня
  markupPercent: number; // Наценка в процентах (без учета эквайринга)
}

/**
 * Каскадная система наценок
 * Чем больше объем, тем меньше наценка
 */
const VOLUME_MARKUPS: VolumeMarkup[] = [
  { minAmount: 50, markupPercent: 20 }, // 50-99: 20% + 3% = 23%
  { minAmount: 100, markupPercent: 18 }, // 100-199: 18% + 3% = 21%
  { minAmount: 200, markupPercent: 16 }, // 200-499: 16% + 3% = 19%
  { minAmount: 500, markupPercent: 14 }, // 500-999: 14% + 3% = 17%
  { minAmount: 1000, markupPercent: 12 }, // 1000-2499: 12% + 3% = 15%
  { minAmount: 2500, markupPercent: 10 }, // 2500-4999: 10% + 3% = 13%
  { minAmount: 5000, markupPercent: 8 }, // 5000-9999: 8% + 3% = 11%
  { minAmount: 10000, markupPercent: 6 }, // 10000+: 6% + 3% = 9%
];

/**
 * Получить наценку для указанного количества звезд
 */
function getMarkupForAmount(amount: number): number {
  // Находим максимальную наценку, которая подходит для этого объема
  let selectedMarkup = VOLUME_MARKUPS[0];

  for (const markup of VOLUME_MARKUPS) {
    if (amount >= markup.minAmount) {
      selectedMarkup = markup;
    } else {
      break;
    }
  }

  return selectedMarkup.markupPercent;
}

/**
 * Интерфейс цены на звезды
 */
export interface StarPricing {
  amount: number;
  priceRub: number;
  pricePerStar: number;
  baseCostRub: number; // Себестоимость (без наценки)
  markupPercent: number; // Наценка (без эквайринга)
  totalMarkupPercent: number; // Общая наценка (с эквайрингом)
}

/**
 * Округляет цену до "красивого" значения, заканчивающегося на 9
 * Примеры: 71.96 -> 79, 78.88 -> 79, 82.00 -> 89, 152 -> 159, 1208 -> 1299, 11258 -> 11999
 * @param price Исходная цена
 * @returns Округленная цена без копеек, заканчивающаяся на 9
 */
function roundToCharmPrice(price: number): number {
  const roundedUp = Math.ceil(price);

  if (roundedUp % 10 === 9 && roundedUp >= price) {
    return roundedUp;
  }

  if (roundedUp < 100) {
    const tens = Math.ceil(roundedUp / 10) * 10;
    return tens - 1;
  }

  if (roundedUp < 1000) {
    const lastDigit = roundedUp % 10;
    if (lastDigit === 9) {
      return roundedUp;
    }
    return roundedUp - lastDigit + 9;
  }

  if (roundedUp < 10000) {
    const lastTwoDigits = roundedUp % 100;
    if (lastTwoDigits === 99) {
      return roundedUp;
    }
    return roundedUp - lastTwoDigits + 99;
  }

  if (roundedUp < 100000) {
    const lastThreeDigits = roundedUp % 1000;
    if (lastThreeDigits === 999) {
      return roundedUp;
    }
    return roundedUp - lastThreeDigits + 999;
  }

  const lastFourDigits = roundedUp % 10000;
  if (lastFourDigits === 9999) {
    return roundedUp;
  }
  return roundedUp - lastFourDigits + 9999;
}

/**
 * Рассчитать цену для указанного количества звезд
 * @param amount Количество звезд
 * @param config Конфигурация ценообразования
 */
export function calculatePrice(
  amount: number,
  config: PricingConfig,
): StarPricing {
  const basePricePerStarUsd = config.price50StarsUsd / 50;
  const baseCostUsd = amount * basePricePerStarUsd;
  const baseCostRub = baseCostUsd * config.usdRubRate;
  const markupPercent = getMarkupForAmount(amount);
  const totalMarkupPercent = markupPercent + config.acquirerFeePercent;
  const priceRubRaw = baseCostRub * (1 + totalMarkupPercent / 100);
  const priceRub = roundToCharmPrice(priceRubRaw);
  const pricePerStar = priceRub / amount;

  return {
    amount,
    priceRub,
    pricePerStar: Math.round(pricePerStar * 10000) / 10000,
    baseCostRub: Math.round(baseCostRub * 100) / 100,
    markupPercent,
    totalMarkupPercent,
  };
}

/**
 * Получить цену для указанного количества звезд
 * @param amount Количество звезд
 * @param config Конфигурация ценообразования
 */
export function getPriceForAmount(
  amount: number,
  config: PricingConfig,
): StarPricing {
  return calculatePrice(amount, config);
}

/**
 * Получить цену за звезду для указанного количества
 * @param amount Количество звезд
 * @param config Конфигурация ценообразования
 */
export function getPricePerStar(amount: number, config: PricingConfig): number {
  const pricing = getPriceForAmount(amount, config);
  return pricing.pricePerStar;
}

/**
 * Получить общую цену для указанного количества звезд
 * @param amount Количество звезд
 * @param config Конфигурация ценообразования
 */
export function getTotalPrice(amount: number, config: PricingConfig): number {
  const pricing = getPriceForAmount(amount, config);
  return pricing.priceRub;
}
