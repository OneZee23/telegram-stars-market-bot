/**
 * Proxy health status
 */
export interface ProxyHealth {
  url: string;
  isHealthy: boolean;
  consecutiveFailures: number;
  lastError?: string;
}
