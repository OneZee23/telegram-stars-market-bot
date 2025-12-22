export function DecodeBase64(encoded?: string): string | undefined {
  if (!encoded) {
    return undefined;
  }

  return Buffer.from(encoded, 'base64').toString('utf-8');
}
