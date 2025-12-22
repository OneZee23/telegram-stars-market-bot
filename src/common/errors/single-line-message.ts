export function singleLineMessage(e: Error): string {
  return (e.stack ?? e.message ?? e.name ?? 'undefined').replace(/\s+/g, ' ');
}
