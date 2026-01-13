/**
 * Sanitizes log messages by masking sensitive data:
 * - IP addresses
 * - Domains (except well-known public ones)
 * - URLs with domains
 * - Email addresses
 * - API keys and tokens
 */

const WELL_KNOWN_DOMAINS = [
  'telegram.org',
  'api.telegram.org',
  'fragment.com',
  'toncenter.com',
  'proxy6.net',
  'github.com',
  'google.com',
];

const IP_REGEX = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const DOMAIN_REGEX = /\b([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}\b/gi;
const URL_REGEX = /https?:\/\/[^\s"']+/gi;
const EMAIL_REGEX = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi;

function isWellKnownDomain(domain: string): boolean {
  const lowerDomain = domain.toLowerCase();
  return WELL_KNOWN_DOMAINS.some(
    (known) => lowerDomain === known || lowerDomain.endsWith(`.${known}`),
  );
}

function maskIP(ip: string): string {
  const parts = ip.split('.');
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.xxx.xxx`;
  }
  return 'xxx.xxx.xxx.xxx';
}

function maskDomain(domain: string): string {
  if (isWellKnownDomain(domain)) {
    return domain;
  }
  const parts = domain.split('.');
  if (parts.length >= 2) {
    return `${parts[0].substring(0, 2)}***.${parts[parts.length - 1]}`;
  }
  return '***';
}

function maskURL(url: string): string {
  try {
    const urlObj = new URL(url);
    const maskedHost = isWellKnownDomain(urlObj.hostname)
      ? urlObj.hostname
      : maskDomain(urlObj.hostname);
    return `${urlObj.protocol}//${maskedHost}${urlObj.pathname}${urlObj.search}`;
  } catch {
    return '***';
  }
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const maskedLocal = local.length > 2 ? `${local.substring(0, 2)}***` : '***';
  const maskedDomain = isWellKnownDomain(domain) ? domain : maskDomain(domain);
  return `${maskedLocal}@${maskedDomain}`;
}

/**
 * Sanitizes a log message by masking sensitive data
 */
export function sanitizeLogMessage(message: string): string {
  let sanitized = message;

  // Mask URLs first (they contain domains and IPs)
  sanitized = sanitized.replace(URL_REGEX, (match) => maskURL(match));

  // Mask IP addresses
  sanitized = sanitized.replace(IP_REGEX, (match) => maskIP(match));

  // Mask email addresses
  sanitized = sanitized.replace(EMAIL_REGEX, (match) => maskEmail(match));

  // Mask domains (but not if they're part of URLs, as those are already masked)
  sanitized = sanitized.replace(DOMAIN_REGEX, (match) => {
    // Skip if already masked or part of URL
    if (
      match.includes('://') ||
      match.includes('xxx') ||
      match.includes('***')
    ) {
      return match;
    }
    return maskDomain(match);
  });

  return sanitized;
}

/**
 * Sanitizes an object by recursively sanitizing string values
 */
export function sanitizeLogObject(obj: unknown): unknown {
  if (typeof obj === 'string') {
    return sanitizeLogMessage(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeLogObject(item));
  }

  if (obj && typeof obj === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      // Skip sensitive keys entirely
      if (
        key.toLowerCase().includes('password') ||
        key.toLowerCase().includes('secret') ||
        key.toLowerCase().includes('token') ||
        key.toLowerCase().includes('key') ||
        key.toLowerCase().includes('api') ||
        key.toLowerCase().includes('ip') ||
        key.toLowerCase().includes('address')
      ) {
        sanitized[key] = '***';
        continue;
      }

      sanitized[key] = sanitizeLogObject(value);
    }
    return sanitized;
  }

  return obj;
}
