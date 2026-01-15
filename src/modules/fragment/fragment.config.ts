import { ConfigFragment } from '@common/config/config-fragment';
import { UseEnv } from '@common/config/use-env.decorator';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * Configuration for Fragment API integration
 * Contains sensitive data: cookies, mnemonic, API keys
 */
export class FragmentConfig extends ConfigFragment {
  /**
   * Fragment session cookies (stel_ssid, stel_ton_token, etc.)
   * Format: JSON string with cookie key-value pairs
   */
  @IsString()
  @IsNotEmpty()
  @UseEnv('FRAGMENT_COOKIES')
  public readonly cookies: string;

  /**
   * Fragment API hash extracted from page source
   */
  @IsString()
  @IsNotEmpty()
  @UseEnv('FRAGMENT_API_HASH')
  public readonly apiHash: string;

  /**
   * HTTP/HTTPS proxy(ies) for Fragment API requests
   * Format: http://user:pass@host:port or http://host:port
   * For multiple proxies, separate with comma or newline
   * Example: "http://proxy1.com:8080,http://proxy2.com:8080"
   * Strategy: uses first working proxy, switches to next on failure
   * Optional: if not set, requests go directly
   */
  @IsString()
  @IsOptional()
  @UseEnv('FRAGMENT_PROXIES')
  public readonly proxies?: string;

  /**
   * Proxy expiration date (format: DD.MM.YY, HH:mm)
   * Used for expiration warnings in logs
   * Example: "13.04.26, 08:01" (13 апреля 2026, 08:01)
   * Optional: if not set, expiration warnings are disabled
   */
  @IsString()
  @IsOptional()
  @UseEnv('FRAGMENT_PROXIES_EXPIRES_AT')
  public readonly proxiesExpiresAt?: string;

  /**
   * Proxy purchase URL for expiration warnings
   * Used in expiration warning messages
   * Optional: if not set, URL will not be included in warnings
   */
  @IsString()
  @IsOptional()
  @UseEnv('FRAGMENT_PROXY_PURCHASE_URL')
  public readonly proxyPurchaseUrl?: string;
}
