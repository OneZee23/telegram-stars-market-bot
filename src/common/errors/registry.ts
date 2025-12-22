import { createHash } from 'crypto';

let memory = new Set<string>();
let errors = [] as IdentifiedError[];

export interface IdentifiedError extends Error {
  id: string;
  stack: string;
}

function identify(e: Error): IdentifiedError {
  if (!e.stack) throw new Error('No error stack');
  if (typeof e.stack !== 'string') throw new Error('Broken error stack');
  const calls = e.stack.split('\n').slice(1);
  const checksum = calls.map((call) => call.trim()).join('\n');
  const id = createHash('sha1').update(checksum).digest('base64url');

  (e as IdentifiedError).id = id;
  return e as IdentifiedError;
}

export function registerError(e: Error): void {
  if (!(e instanceof Error)) throw new Error('Not an error');
  const error = identify(e);
  if (memory.has(error.id)) return;
  memory.add(error.id);
  errors.push(error);
}

export function listErrors(): IdentifiedError[] {
  return errors.slice();
}

export function flushErrors(): void {
  errors = [];
}

export function forgetErrors(): void {
  memory = new Set<string>();
}
