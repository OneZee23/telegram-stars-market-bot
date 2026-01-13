import { Injectable, Logger } from '@nestjs/common';
// eslint-disable-next-line import/no-extraneous-dependencies
import { fetch as undiciFetch } from 'undici';
import { FragmentConfig } from '../fragment.config';
import { ProxyManagerService } from './proxy-manager.service';

/**
 * Fragment API cookies structure
 */
export interface FragmentCookies {
  stel_ssid?: string;
  stel_ton_token?: string;
  stel_token?: string;
  stel_dt?: string;
}

interface FetchResponse<T> {
  data: T;
  headers: Headers;
  status: number;
}

// Type for response that works with both fetch and undici
type FetchResponseType = Awaited<ReturnType<typeof fetch>>;

/**
 * Fragment API client for interacting with fragment.com API
 */
@Injectable()
export class FragmentApiClientService {
  private readonly logger = new Logger(FragmentApiClientService.name);

  private readonly baseURL: string;

  private readonly FRAGMENT_HOSTNAME = 'fragment.com';

  private readonly USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  private cookies: FragmentCookies = {};

  private apiHash: string = '';

  private starsDataHash: number | null = null;

  constructor(
    private readonly config: FragmentConfig,
    private readonly proxyManager: ProxyManagerService,
  ) {
    this.baseURL = `https://${this.FRAGMENT_HOSTNAME}`;
    this.loadCookiesFromConfig();
    this.initializeProxyManager();
  }

  /**
   * Initialize proxy manager with configured proxies
   */
  private initializeProxyManager(): void {
    // Log raw config value for debugging
    const rawProxies = this.config.proxies;
    this.logger.debug(
      `FRAGMENT_PROXIES config value: ${rawProxies ? `"${rawProxies}" (length: ${rawProxies.length}, type: ${typeof rawProxies})` : 'undefined/null/empty'}`,
    );

    // Also check environment variable directly for debugging
    const envProxies = process.env.FRAGMENT_PROXIES;
    this.logger.debug(
      `process.env.FRAGMENT_PROXIES: ${envProxies ? `"${envProxies}" (length: ${envProxies.length})` : 'undefined/null/empty'}`,
    );

    // Parse proxy URLs from config
    if (!rawProxies) {
      this.logger.debug('FRAGMENT_PROXIES not configured in config object');
      this.proxyManager.initialize(
        [],
        this.config.proxyPurchaseUrl,
        this.config.proxiesExpiresAt,
      );
      return;
    }

    this.logger.debug(
      `Parsing proxies from config (length: ${rawProxies.length})`,
    );
    const proxyUrls = this.parseProxyUrls(rawProxies);
    this.logger.debug(
      `Parsed ${proxyUrls.length} proxy URL(s): ${proxyUrls.map((url) => this.maskProxyUrl(url)).join(', ')}`,
    );

    // Initialize proxy manager (always uses failover strategy)
    this.proxyManager.initialize(
      proxyUrls,
      this.config.proxyPurchaseUrl,
      this.config.proxiesExpiresAt,
    );
  }

  /**
   * Parse proxy URLs from string (supports comma and newline separators)
   */
  private parseProxyUrls(proxiesStr: string): string[] {
    if (!proxiesStr) {
      return [];
    }

    // Split by comma or newline
    return proxiesStr
      .split(/[,\n]/)
      .map((url) => url.trim())
      .filter((url) => url.length > 0);
  }

  /**
   * Mask proxy URL for logging (hide password)
   */
  private maskProxyUrl(url: string): string {
    return url.replace(/:[^:@]*@/, ':****@');
  }

  /**
   * Load cookies from configuration
   */
  private loadCookiesFromConfig(): void {
    try {
      const cookiesStr = this.config.cookies?.trim() || '';
      if (!cookiesStr) {
        throw new Error('FRAGMENT_COOKIES is empty');
      }
      this.cookies = JSON.parse(cookiesStr);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to parse FRAGMENT_COOKIES from config. Ensure it is valid JSON. Error: ${errorMessage}. Cookies value: ${this.config.cookies?.substring(0, 100)}...`,
      );
      throw new Error(`Invalid FRAGMENT_COOKIES format: ${errorMessage}`);
    }

    this.apiHash = this.config.apiHash;
  }

  /**
   * Set cookies manually
   */
  setCookies(cookies: FragmentCookies): void {
    this.cookies = { ...cookies };
  }

  /**
   * Set API hash
   */
  setApiHash(hash: string): void {
    this.apiHash = hash;
  }

  /**
   * Get current cookies
   */
  getCookies(): FragmentCookies {
    return { ...this.cookies };
  }

  /**
   * Get current API hash
   */
  getApiHash(): string {
    return this.apiHash;
  }

  /**
   * Get stars data hash
   */
  getStarsDataHash(): number | null {
    return this.starsDataHash;
  }

  /**
   * Parse cookies from Set-Cookie header
   */
  private parseCookies(setCookieHeaders: string[]): FragmentCookies {
    if (!setCookieHeaders || setCookieHeaders.length === 0) return {};
    return setCookieHeaders.reduce((acc, cookieString) => {
      // Take only the key=value part before the first semicolon
      const [cookiePart] = cookieString.split(';');
      const equalIndex = cookiePart.indexOf('=');
      if (equalIndex > 0) {
        const key = cookiePart.substring(0, equalIndex).trim();
        const value = cookiePart.substring(equalIndex + 1).trim();
        if (key && value) {
          // Only decode if it's URL encoded, otherwise use as is
          try {
            acc[decodeURIComponent(key) as keyof FragmentCookies] =
              decodeURIComponent(value);
          } catch {
            // If decoding fails, use raw values
            acc[key as keyof FragmentCookies] = value;
          }
        }
      }
      return acc;
    }, {} as FragmentCookies);
  }

  /**
   * Build Cookie header string
   */
  private getCookieHeader(): string {
    const parts: string[] = [];
    Object.entries(this.cookies).forEach(([key, value]) => {
      if (value) parts.push(`${key}=${value}`);
    });
    return parts.join('; ');
  }

  /**
   * Extract API hash from HTML
   */
  private extractApiHash(html: string): void {
    const match = html.match(/"apiUrl":"\\?\/api\?hash=([^"\\]+)"/);
    const [, hash] = match || [];
    if (hash) {
      const oldHash = this.apiHash;
      this.apiHash = hash;
      if (oldHash !== hash) {
        this.logger.debug(
          `API hash extracted: ${hash.substring(0, 10)}... (length: ${hash.length})`,
        );
      }
    } else {
      this.logger.warn('API hash not found in HTML (pattern not matched)');
    }
  }

  /**
   * Send request to Fragment API
   */
  async sendRequest<T>(
    url: string,
    config: {
      method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
      data?: string | Record<string, string>;
      isApi?: boolean;
    },
  ): Promise<FetchResponse<T>> {
    const headers: Record<string, string> = { 'User-Agent': this.USER_AGENT };

    const cookieHeader = this.getCookieHeader();
    if (cookieHeader) {
      headers.Cookie = cookieHeader;
      if (config.isApi) {
        this.logger.debug(
          `Cookie header: ${cookieHeader.substring(0, 100)}...`,
        );
      }
    } else {
      this.logger.warn('No cookies available for request');
    }

    // Add common headers for all requests
    headers.Accept = config.isApi
      ? 'application/json, text/javascript, */*; q=0.01'
      : 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8';
    headers['Accept-Language'] = 'en-US,en;q=0.9';
    headers['Accept-Encoding'] = 'gzip, deflate, br';
    headers['Sec-Fetch-Dest'] = config.isApi ? 'empty' : 'document';
    headers['Sec-Fetch-Mode'] = config.isApi ? 'cors' : 'navigate';
    headers['Sec-Fetch-Site'] = 'none';
    headers['Sec-Ch-Ua'] =
      '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"';
    headers['Sec-Ch-Ua-Mobile'] = '?0';
    headers['Sec-Ch-Ua-Platform'] = '"Windows"';

    if (config.isApi) {
      headers['Content-Type'] =
        'application/x-www-form-urlencoded; charset=UTF-8';
      headers['X-Requested-With'] = 'XMLHttpRequest';
      headers.Origin = `https://${this.FRAGMENT_HOSTNAME}`;
      headers.Referer = `https://${this.FRAGMENT_HOSTNAME}/stars/buy`;
      headers['Sec-Fetch-Site'] = 'same-origin';
    } else {
      // For GET requests, add referer
      headers.Referer = `https://${this.FRAGMENT_HOSTNAME}/`;
      headers['Upgrade-Insecure-Requests'] = '1';
    }

    let urlObj: URL;
    if (url.startsWith('http://') || url.startsWith('https://')) {
      urlObj = new URL(url);
    } else {
      // Clean URL - remove any existing query params before creating URL object
      const cleanUrl = url.split('?')[0];
      urlObj = new URL(cleanUrl, this.baseURL);
    }

    if (config.isApi && this.apiHash) {
      urlObj.searchParams.set('hash', this.apiHash);
    }

    let body: string | undefined;
    if (config.data) {
      body =
        typeof config.data === 'object'
          ? new URLSearchParams(
              config.data as Record<string, string>,
            ).toString()
          : config.data;
    }

    // Log API requests for debugging
    if (config.isApi) {
      const fullUrl = urlObj.toString();
      this.logger.debug(`API Request: ${config.method} ${fullUrl}`);
      if (body) {
        this.logger.debug(`Request body: ${body.substring(0, 200)}`);
      }
    }

    // Use proxy if configured
    // Node.js built-in fetch doesn't support proxy directly, so we use undici
    let response: FetchResponseType;

    if (this.proxyManager.isEnabled()) {
      // Try proxies one by one until we find a working one
      let lastError: Error | null = null;
      const triedProxies: string[] = [];

      while (true) {
        const proxyUrl = this.proxyManager.getNextProxy();

        if (!proxyUrl) {
          // No working proxy available
          this.logger.error(
            `All proxies are unavailable. Tried: ${triedProxies.map((url) => this.maskProxyUrl(url)).join(', ')}`,
          );
          throw lastError || new Error('No working proxy available');
        }

        // Skip if we already tried this proxy
        if (triedProxies.includes(proxyUrl)) {
          this.logger.error(
            `All proxies failed. Tried: ${triedProxies.map((url) => this.maskProxyUrl(url)).join(', ')}`,
          );
          throw lastError || new Error('All proxies failed');
        }

        triedProxies.push(proxyUrl);
        const maskedUrl = proxyUrl.replace(/:[^:@]*@/, ':****@');
        this.logger.debug(`Using proxy: ${maskedUrl}`);

        const proxyAgent = this.proxyManager.getProxyAgent(proxyUrl);

        try {
          const undiciResponse = await undiciFetch(urlObj.toString(), {
            method: config.method,
            headers,
            body: config.method === 'POST' ? body : undefined,
            dispatcher: proxyAgent,
          });
          // undici Response is compatible with fetch Response for our use case
          response = undiciResponse as unknown as FetchResponseType;

          // Mark proxy as successful (even if HTTP status is not 200, proxy itself worked)
          this.proxyManager.markProxySuccess(proxyUrl);
          break; // Success, exit retry loop
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          const errorMessage = lastError.message;

          // Check if it's a network error (not an HTTP error response)
          const isNetworkError =
            errorMessage.includes('ECONNREFUSED') ||
            errorMessage.includes('ETIMEDOUT') ||
            errorMessage.includes('ENOTFOUND') ||
            errorMessage.includes('ECONNRESET') ||
            errorMessage.includes('socket hang up') ||
            errorMessage.includes('timeout');

          if (isNetworkError) {
            // Mark proxy as failed (counts towards max failures)
            this.proxyManager.markProxyFailed(proxyUrl, errorMessage);
            this.logger.warn(
              `Network error with proxy ${maskedUrl}: ${errorMessage}. Trying next proxy...`,
            );
            // Continue loop to try next proxy (triedProxies will prevent retrying this one)
            continue; // Try next proxy
          } else {
            // For other errors, don't mark as failed (might be API issue), but still throw
            this.logger.debug(
              `Error with proxy ${maskedUrl} (not marking as failed): ${errorMessage}`,
            );
            throw error;
          }
        }
      }
    } else {
      // No proxy configured, use direct connection
      response = await fetch(urlObj.toString(), {
        method: config.method,
        headers,
        body: config.method === 'POST' ? body : undefined,
      });
    }

    // Update cookies from response
    // fetch API returns set-cookie as a single string with comma-separated values
    // or we can use getAll() if available
    let setCookieHeaders: string[] = [];
    try {
      // Try to get all set-cookie headers
      const allSetCookies = response.headers.getSetCookie?.() || [];
      if (allSetCookies.length > 0) {
        setCookieHeaders = allSetCookies;
      } else {
        // Fallback: get single header and split by comma (but be careful with dates)
        const setCookieHeader = response.headers.get('set-cookie');
        if (setCookieHeader) {
          // Split by comma, but preserve dates (which also contain commas)
          // Simple approach: split by ', ' pattern that appears between cookies
          setCookieHeaders = setCookieHeader.split(/,\s*(?=\w+=)/);
        }
      }
    } catch (e) {
      // Fallback for older Node.js versions
      const setCookieHeader = response.headers.get('set-cookie');
      if (setCookieHeader) {
        setCookieHeaders = [setCookieHeader];
      }
    }

    if (setCookieHeaders.length > 0) {
      const newCookies = this.parseCookies(setCookieHeaders);
      const cookiesUpdated = Object.keys(newCookies).length > 0;
      if (cookiesUpdated) {
        this.logger.debug(
          `Cookies updated from response: ${Object.keys(newCookies).join(', ')}`,
        );
      }
      Object.assign(this.cookies, newCookies);
    }

    // Parse response data
    const contentType = response.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    const data = isJson ? await response.json() : await response.text();

    // We don't extract API hash from HTML responses anymore
    // API hash must be provided via FRAGMENT_API_HASH environment variable
    // This avoids Cloudflare blocking GET requests to the website

    // Log API responses for debugging
    if (config.isApi) {
      this.logger.debug(
        `API Response: ${response.status} ${response.statusText}`,
      );
      if (response.status !== 200) {
        const responseText =
          typeof data === 'string'
            ? data.substring(0, 500)
            : JSON.stringify(data).substring(0, 500);
        this.logger.warn(
          `API Error Response (${response.status}): ${responseText}`,
        );
      }
    }

    return {
      data: data as T,
      headers: response.headers,
      status: response.status,
    };
  }

  /**
   * Initialize session - only validates that API hash is set
   * We don't make GET requests to the website to avoid Cloudflare blocking
   */
  async initializeSession(): Promise<void> {
    this.logger.debug('Initializing Fragment session...');

    // API hash must be provided via environment variable
    // We don't fetch it from HTML to avoid Cloudflare blocking
    if (!this.apiHash) {
      throw new Error(
        'API hash is not set. Please provide FRAGMENT_API_HASH in environment variables.',
      );
    }

    this.logger.debug(
      `API hash set from config: ${this.apiHash.substring(0, 10)}...`,
    );
    this.logger.debug('Session initialized successfully (API-only mode)');
  }

  /**
   * Check if cookies are valid
   */
  async checkCookiesValidity(): Promise<boolean> {
    this.logger.debug('Checking cookies validity...');

    if (!this.cookies.stel_ssid || !this.apiHash) {
      this.logger.warn(
        'Cookies validity check failed: missing stel_ssid or apiHash',
      );
      return false;
    }

    try {
      const response = await this.sendRequest<{
        ok?: boolean;
        error?: string;
        [key: string]: unknown;
      }>('/api', {
        method: 'POST',
        isApi: true,
        data: { method: 'updateStarsBuyState', mode: 'new', lv: 'false' },
      });

      // Check if we got a Cloudflare challenge page
      if (response.status === 403) {
        const responseData = response.data as any;
        if (
          typeof responseData === 'string' &&
          (responseData.includes('Just a moment') ||
            responseData.includes('cf-browser-verification'))
        ) {
          this.logger.error(
            'Cookies validity check failed: Cloudflare is blocking API requests. Please update FRAGMENT_COOKIES with fresh cookies.',
          );
          return false;
        }
      }

      const isValid = response.status === 200 && !response.data.error;
      if (!isValid) {
        this.logger.warn(
          `Cookies validity check failed: status ${response.status}, error: ${response.data.error || 'unknown error'}`,
        );
      }
      return isValid;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.warn(`Cookies validity check exception: ${errorMessage}`);
      return false;
    }
  }

  /**
   * Update stars buy state
   */
  async updateStarsBuyState(mode = 'new'): Promise<any> {
    const data: Record<string, string> = {
      mode,
      lv: 'false',
      method: 'updateStarsBuyState',
      dh: String(this.starsDataHash || 1),
    };

    const response = await this.sendRequest<any>('/api', {
      method: 'POST',
      isApi: true,
      data,
    });

    if (response.data.dh) {
      this.starsDataHash = response.data.dh;
    }

    return response.data;
  }

  /**
   * Search for stars recipient by username
   */
  async searchStarsRecipient(username: string): Promise<any> {
    const cleanUsername = username.replace(/^@/, '');
    return this.sendRequest<any>('/api', {
      method: 'POST',
      isApi: true,
      data: { query: cleanUsername, method: 'searchStarsRecipient' },
    }).then((r) => r.data);
  }

  /**
   * Update stars prices for given quantity
   */
  async updateStarsPrices(quantity: number): Promise<any> {
    const data: Record<string, string> = {
      stars: '',
      quantity: String(quantity),
      method: 'updateStarsPrices',
    };
    if (this.starsDataHash) {
      data.dh = String(this.starsDataHash);
    }

    const response = await this.sendRequest<any>('/api', {
      method: 'POST',
      isApi: true,
      data,
    });

    if (response.data.dh) {
      this.starsDataHash = response.data.dh;
    }

    return response.data;
  }

  /**
   * Initialize buy stars request
   */
  async initBuyStarsRequest(
    recipient: string,
    quantity: number,
  ): Promise<{ req_id: string; amount: string }> {
    const data: Record<string, string> = {
      recipient,
      quantity: String(quantity),
      method: 'initBuyStarsRequest',
    };
    if (this.starsDataHash) {
      data.dh = String(this.starsDataHash);
    }

    const response = await this.sendRequest<any>('/api', {
      method: 'POST',
      isApi: true,
      data,
    });

    if (response.data.error) {
      throw new Error(`initBuyStarsRequest error: ${response.data.error}`);
    }

    if (!response.data.req_id) {
      throw new Error(`No req_id received: ${JSON.stringify(response.data)}`);
    }

    return {
      req_id: response.data.req_id,
      amount: response.data.amount || String(quantity),
    };
  }

  /**
   * Get buy stars link with transaction details
   */
  async getBuyStarsLink(
    reqId: string,
    walletAddress: string,
    walletStateInit: string,
    publicKey: string,
    showSender = 0,
  ): Promise<{
    transaction: {
      validUntil: number;
      from: string;
      messages: Array<{
        address: string;
        amount: string;
        payload?: string;
      }>;
    };
    confirm_method: string;
    confirm_params: { id: string };
  }> {
    const account = this.buildAccountObject(
      walletAddress,
      walletStateInit,
      publicKey,
    );
    const device = this.buildDeviceObject();

    const requestData = `account=${encodeURIComponent(
      account,
    )}&device=${encodeURIComponent(
      device,
    )}&transaction=1&id=${reqId}&show_sender=${showSender}&method=getBuyStarsLink`;

    const response = await this.sendRequest<any>('/api', {
      method: 'POST',
      isApi: true,
      data: requestData,
    });

    if (response.data.error) {
      if (response.data.need_verify) {
        throw new Error(
          'KYC verification required. Visit https://fragment.com/kyc/account',
        );
      }
      throw new Error(`getBuyStarsLink error: ${response.data.error}`);
    }

    if (!response.data.ok || !response.data.transaction) {
      throw new Error(
        `Invalid getBuyStarsLink response: ${JSON.stringify(response.data)}`,
      );
    }

    return {
      transaction: response.data.transaction,
      confirm_method: response.data.confirm_method,
      confirm_params: response.data.confirm_params || { id: reqId },
    };
  }

  /**
   * Confirm request with signed BOC
   */
  async confirmReq(
    requestId: string,
    boc: string,
    walletAddress: string,
    walletStateInit: string,
    publicKey: string,
  ): Promise<boolean> {
    const account = this.buildAccountObject(
      walletAddress,
      walletStateInit,
      publicKey,
    );
    const device = this.buildDeviceObject();

    const response = await this.sendRequest<{
      ok?: boolean;
      error?: string;
    }>('/api', {
      method: 'POST',
      isApi: true,
      data: `boc=${encodeURIComponent(
        boc,
      )}&id=${requestId}&account=${encodeURIComponent(
        account,
      )}&device=${encodeURIComponent(device)}&method=confirmReq`,
    });

    if (response.data.error) {
      throw new Error(`confirmReq failed: ${response.data.error}`);
    }

    return response.data.ok === true;
  }

  /**
   * Build account object for Fragment API
   */
  private buildAccountObject(
    walletAddress: string,
    walletStateInit: string,
    publicKey: string,
  ): string {
    // This will be implemented when we add tonweb dependency
    // For now, return a placeholder structure
    return JSON.stringify({
      address: walletAddress,
      chain: '-239',
      walletStateInit,
      publicKey,
    });
  }

  /**
   * Build device object for Fragment API
   */
  private buildDeviceObject(): string {
    return JSON.stringify({
      appName: 'TelegramStarsMarketBot',
      platform: 'nodejs',
      maxProtocolVersion: 2,
      appVersion: '1.0.0',
      features: [
        'SendTransaction',
        { name: 'SendTransaction', maxMessages: 4 },
        { name: 'SignData', types: ['text', 'binary', 'cell'] },
      ],
    });
  }
}
