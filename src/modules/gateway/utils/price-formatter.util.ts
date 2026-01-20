/**
 * Форматирует цену в рубли в формате для отображения в кнопках
 * Формат: "179,00 RUB" (с запятой как разделителем, 2 знака после запятой)
 * @param priceRub Цена в рублях
 * @returns Отформатированная строка цены
 */
export function formatPriceForButton(priceRub: number): string {
  // Округляем до 2 знаков после запятой
  const rounded = Math.round(priceRub * 100) / 100;

  // Разделяем на целую и дробную части
  const parts = rounded.toFixed(2).split('.');
  const integerPart = parts[0];
  const decimalPart = parts[1];

  // Добавляем пробелы для разделения тысяч (например: 1 649,00)
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

  // Возвращаем в формате: "1 649,00 RUB"
  return `${formattedInteger},${decimalPart} RUB`;
}
