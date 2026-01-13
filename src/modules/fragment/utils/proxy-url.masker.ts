/**
 * Masks proxy URL for logging (hides password)
 */
export function maskProxyUrl(url: string): string {
  return url.replace(/:[^:@]*@/, ':****@');
}
