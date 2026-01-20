/**
 * Форматирует цену в рубли в формате для отображения в кнопках
 * Формат: "179 RUB" (без копеек, так как цены округляются до целых чисел, заканчивающихся на 9)
 * @param priceRub Цена в рублях (целое число)
 * @returns Отформатированная строка цены
 */
export function formatPriceForButton(priceRub: number): string {
  const rounded = Math.round(priceRub);
  const formattedInteger = rounded
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${formattedInteger} RUB`;
}
