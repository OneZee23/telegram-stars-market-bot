import { AppError } from '@common/errors/app-error';

export class JsonRpcError extends AppError {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
