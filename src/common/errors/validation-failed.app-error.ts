import { ValidationError } from '@nestjs/common';
import { AppError } from './app-error';

function describe(errors: ValidationError[]): string {
  const fields = errors.map((e) => e.property).join(', ');
  return `Validation failed on fields ${fields}`;
}

export class ValidationFailedAppError extends AppError {
  constructor(errors: ValidationError[]) {
    super(describe(errors));
  }

  public readonly code = 'ERR_VALIDATION_FAILED';
}
