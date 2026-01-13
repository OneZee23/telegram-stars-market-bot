/**
 * Parses proxy expiration date from string
 * Supports format: DD.MM.YY, HH:mm (e.g., "13.04.26, 08:01")
 * Falls back to standard Date parsing for other formats
 */
export function parseProxyExpirationDate(expiresAt: string): Date | null {
  try {
    // Try to parse custom format: DD.MM.YY, HH:mm
    const customFormatMatch = expiresAt.match(
      /^(\d{2})\.(\d{2})\.(\d{2}),\s*(\d{2}):(\d{2})$/,
    );

    if (customFormatMatch) {
      const [, day, month, year, hour, minute] = customFormatMatch;
      const fullYear = 2000 + parseInt(year, 10);
      const date = new Date(
        fullYear,
        parseInt(month, 10) - 1, // month is 0-indexed
        parseInt(day, 10),
        parseInt(hour, 10),
        parseInt(minute, 10),
      );

      if (Number.isNaN(date.getTime())) {
        throw new Error('Invalid date values');
      }

      return date;
    }

    // Fallback to standard Date parsing
    const date = new Date(expiresAt);
    if (Number.isNaN(date.getTime())) {
      throw new Error('Invalid date format');
    }

    return date;
  } catch {
    return null;
  }
}
