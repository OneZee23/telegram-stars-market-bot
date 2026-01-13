import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ProxyAgent } from 'undici';
import { ProxyHealth } from '../types/proxy-health.interface';
import { logProxyExpiration } from '../utils/proxy-expiration.checker';
import { parseProxyExpirationDate } from '../utils/proxy-expiration.parser';
import { maskProxyUrl } from '../utils/proxy-url.masker';
import { isValidProxyUrl } from '../utils/proxy-url.validator';

/**
 * Proxy Manager Service
 * Manages multiple proxies with failover strategy
 */
@Injectable()
export class ProxyManagerService {
  private readonly logger = new Logger(ProxyManagerService.name);

  private proxies: string[] = [];

  private healthStatus: Map<string, ProxyHealth> = new Map();

  private readonly maxConsecutiveFailures = 3; // Mark as unhealthy after 3 failures

  private expiresAt: Date | null = null;

  private purchaseUrl: string | undefined;

  /**
   * Initialize proxy manager with proxy URLs and expiration date
   */
  initialize(
    proxyUrls: string[],
    purchaseUrl?: string,
    expiresAt?: string,
  ): void {
    this.logger.debug(
      `Initializing proxy manager with ${proxyUrls?.length || 0} proxy URL(s)`,
    );

    if (!proxyUrls || proxyUrls.length === 0) {
      this.logger.debug('No proxies configured, proxy manager disabled');
      this.proxies = [];
      return;
    }

    // Filter out empty strings and validate format
    this.proxies = proxyUrls
      .map((url) => url.trim())
      .filter((url) => {
        if (!url) {
          this.logger.debug('Skipping empty proxy URL');
          return false;
        }
        if (!isValidProxyUrl(url)) {
          this.logger.warn(
            `Invalid proxy URL format, skipping: ${maskProxyUrl(url)}`,
          );
          return false;
        }
        return true;
      });

    if (this.proxies.length === 0) {
      this.logger.warn(
        `No valid proxies found after filtering. Input: ${proxyUrls.map((url) => maskProxyUrl(url)).join(', ')}`,
      );
      return;
    }

    // Store purchase URL
    this.purchaseUrl = purchaseUrl;
    if (purchaseUrl) {
      this.logger.debug(`Proxy purchase URL configured: ${purchaseUrl}`);
    }

    // Parse expiration date if provided
    if (expiresAt) {
      this.logger.debug(
        `Parsing expiration date: "${expiresAt}" (length: ${expiresAt.length})`,
      );
      this.expiresAt = parseProxyExpirationDate(expiresAt);
      if (!this.expiresAt) {
        this.logger.warn(
          `Failed to parse expiration date: "${expiresAt}". Expected format: DD.MM.YY, HH:mm (e.g., "13.04.26, 08:01")`,
        );
      } else {
        this.logger.log(
          `Proxy expiration date parsed successfully: ${this.expiresAt.toISOString()}`,
        );
      }
    } else {
      this.logger.debug('No expiration date configured for proxies');
    }

    // Initialize health status for all proxies
    this.proxies.forEach((url) => {
      this.healthStatus.set(url, {
        url,
        isHealthy: true, // Assume healthy initially
        consecutiveFailures: 0,
      });
    });

    this.logger.log(
      `Proxy manager initialized with ${this.proxies.length} proxy(ies)`,
    );

    // Check expiration on initialization
    this.checkExpiration();
  }

  /**
   * Get first available (healthy) proxy
   * Returns null if no proxies are available
   */
  getNextProxy(): string | null {
    if (this.proxies.length === 0) {
      return null;
    }

    // Find first healthy proxy
    for (const proxy of this.proxies) {
      const health = this.healthStatus.get(proxy);
      if (health && health.isHealthy) {
        return proxy;
      }
    }

    // All proxies are unhealthy
    this.logger.error(
      `All ${this.proxies.length} proxy(ies) are unhealthy. No working proxy available.`,
    );
    return null;
  }

  /**
   * Mark proxy as failed (called when request fails)
   * After maxConsecutiveFailures, proxy is marked as unhealthy
   */
  markProxyFailed(proxyUrl: string, error?: string): void {
    const health = this.healthStatus.get(proxyUrl);
    if (!health) return;

    health.consecutiveFailures += 1;
    health.lastError = error;

    if (health.consecutiveFailures >= this.maxConsecutiveFailures) {
      health.isHealthy = false;
      this.logger.warn(
        `Proxy marked as unhealthy after ${health.consecutiveFailures} failures: ${maskProxyUrl(proxyUrl)}`,
      );
    } else {
      this.logger.debug(
        `Proxy failure ${health.consecutiveFailures}/${this.maxConsecutiveFailures}: ${maskProxyUrl(proxyUrl)}`,
      );
    }
  }

  /**
   * Mark proxy as successful (called when request succeeds)
   */
  markProxySuccess(proxyUrl: string): void {
    const health = this.healthStatus.get(proxyUrl);
    if (!health) return;

    if (!health.isHealthy || health.consecutiveFailures > 0) {
      this.logger.log(`Proxy recovered: ${maskProxyUrl(proxyUrl)}`);
    }

    health.isHealthy = true;
    health.consecutiveFailures = 0;
    health.lastError = undefined;
  }

  /**
   * Get ProxyAgent for a proxy URL
   */
  getProxyAgent(proxyUrl: string | null): ProxyAgent | undefined {
    if (!proxyUrl) {
      return undefined;
    }
    return new ProxyAgent(proxyUrl);
  }

  /**
   * Get all configured proxies
   */
  getProxies(): string[] {
    return [...this.proxies];
  }

  /**
   * Check if proxy manager is enabled
   */
  isEnabled(): boolean {
    return this.proxies.length > 0;
  }

  /**
   * Check proxy expiration and log warnings
   */
  private checkExpiration(): void {
    if (!this.expiresAt) {
      return;
    }

    logProxyExpiration(this.logger, this.expiresAt, this.purchaseUrl);
  }

  /**
   * Check proxy expiration daily at 00:00 UTC
   * Cron expression: 0 0 * * * (every day at midnight UTC)
   */
  @Cron('0 0 * * *')
  handleExpirationCheck(): void {
    if (this.expiresAt) {
      this.checkExpiration();
    }
  }
}
