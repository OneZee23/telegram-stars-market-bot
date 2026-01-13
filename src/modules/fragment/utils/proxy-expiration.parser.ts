/**
 * Parses proxy expiration date from string
 * Supports format: DD.MM.YY, HH:mm (e.g., "13.04.26, 08:01" or "13.04.26,08:01")
 * Falls back to standard Date parsing for other formats
 * Handles strings with or without quotes (important for GitHub Secrets)
 */
export function parseProxyExpirationDate(expiresAt: string): Date | null {
  if (!expiresAt || !expiresAt.trim()) {
    return null;
  }

  // Trim whitespace and remove quotes if present (GitHub Secrets might add quotes)
  const trimmed = expiresAt
    .trim()
    .replace(/^["']|["']$/g, '')
    .trim();

  try {
    // Try to parse custom format: DD.MM.YY, HH:mm
    // Allow flexible whitespace around comma (works with or without space after comma)
    const customFormatMatch = trimmed.match(
      /^(\d{2})\.(\d{2})\.(\d{2})\s*,\s*(\d{2}):(\d{2})$/,
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
    const date = new Date(trimmed);
    if (Number.isNaN(date.getTime())) {
      throw new Error('Invalid date format');
    }

    return date;
  } catch (error) {
    // Return null on any error - caller will log the details
    return null;
  }
}
