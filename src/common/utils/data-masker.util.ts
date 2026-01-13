export function maskUsername(username: string): string {
  if (!username) return '@***';
  const clean = username.replace('@', '');
  if (clean.length <= 2) return `@${clean[0]}***`;
  return `@${clean.substring(0, 2)}***`;
}

export function maskUserId(userId: string | number): string {
  const str = userId.toString();
  if (str.length <= 3) return `${str[0]}***`;
  return `${str.substring(0, 3)}***`;
}
