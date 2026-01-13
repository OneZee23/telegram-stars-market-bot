import { Logger } from '@nestjs/common';

interface ExpirationCheckResult {
  daysUntilExpiration: number;
  isExpired: boolean;
  severity: 'info' | 'warn' | 'error';
  message: string;
}

/**
 * Calculates expiration status and generates appropriate log message
 */
export function checkProxyExpiration(
  expiresAt: Date,
  purchaseUrl?: string,
): ExpirationCheckResult {
  const now = new Date();
  const timeUntilExpiration = expiresAt.getTime() - now.getTime();
  const daysUntilExpiration = Math.ceil(
    timeUntilExpiration / (1000 * 60 * 60 * 24),
  );

  const isExpired = timeUntilExpiration <= 0;
  const urlSuffix = purchaseUrl ? ` at: ${purchaseUrl}` : '';

  if (isExpired) {
    return {
      daysUntilExpiration: Math.abs(daysUntilExpiration),
      isExpired: true,
      severity: 'error',
      message: `⚠️ PROXY EXPIRED! Proxies expired ${Math.abs(daysUntilExpiration)} day(s) ago. Please renew your proxies${urlSuffix}`,
    };
  }

  if (daysUntilExpiration <= 7) {
    return {
      daysUntilExpiration,
      isExpired: false,
      severity: 'error',
      message: `⚠️ PROXY EXPIRES SOON! Proxies will expire in ${daysUntilExpiration} day(s). Please renew${urlSuffix}`,
    };
  }

  if (daysUntilExpiration <= 14) {
    return {
      daysUntilExpiration,
      isExpired: false,
      severity: 'warn',
      message: `⚠️ Proxy expiration warning: Proxies will expire in ${daysUntilExpiration} days. Consider renewing${urlSuffix}`,
    };
  }

  if (daysUntilExpiration <= 30) {
    return {
      daysUntilExpiration,
      isExpired: false,
      severity: 'info',
      message: `ℹ️ Proxy expiration notice: Proxies will expire in ${daysUntilExpiration} days. Renew${urlSuffix}`,
    };
  }

  // More than 30 days - no warning needed
  return {
    daysUntilExpiration,
    isExpired: false,
    severity: 'info',
    message: '',
  };
}

/**
 * Logs proxy expiration warning based on severity
 */
export function logProxyExpiration(
  logger: Logger,
  expiresAt: Date,
  purchaseUrl?: string,
): void {
  const result = checkProxyExpiration(expiresAt, purchaseUrl);

  if (!result.message) {
    return;
  }

  switch (result.severity) {
    case 'error':
      logger.error(result.message);
      break;
    case 'warn':
      logger.warn(result.message);
      break;
    case 'info':
      logger.log(result.message);
      break;
    default:
      // No action needed for other severities
      break;
  }
}
