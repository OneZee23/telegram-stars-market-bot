import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import { Request } from 'express';
import { JsonRpc } from '@common/json-rpc/json-rpc';
import { AppError } from '@common/errors/app-error';
import { singleLineMessage } from '@common/errors/single-line-message';

function display(request: Request): string {
  const uid = request.header('x-uid');
  const user = uid ? `#${uid}` : 'anonymous';
  return `${request.method} ${request.path} called by ${user}`;
}

@Catch()
export class JsonRpcExceptionFilter implements ExceptionFilter {
  private readonly logger: Logger;

  constructor() {
    this.logger = new Logger('ExceptionFilter');
  }

  catch(thrown: unknown, context: ArgumentsHost): void {
    try {
      this.catchUnsafe(thrown, context);
    } catch (error) {
      this.onCatchFailed(error);
    }
  }

  private catchUnsafe(thrown: unknown, context: ArgumentsHost): void {
    this.display(thrown, context);
    this.respond(thrown, context);
  }

  private respond(thrown: unknown, ctx: ArgumentsHost): void {
    const jsonToSend = this.responseFor(thrown);
    ctx.switchToHttp().getResponse().status(200).json(jsonToSend);
  }

  // eslint-disable-next-line class-methods-use-this
  private responseFor(thrown: unknown): JsonRpc.FailedResponse {
    if (thrown instanceof AppError) {
      return {
        status: 'error',
        code: thrown.code,
        message: thrown.message,
        payload: thrown.payload(),
      } as JsonRpc.FailedResponseDetailed;
    }

    return {
      status: 'error',
      code: 'UNKNOWN_SERVER_ERROR',
      message: 'Something went wrong',
    } as JsonRpc.FailedResponse;
  }

  private display(thrown: unknown, context: ArgumentsHost): void {
    if (thrown instanceof AppError) {
      if (thrown.shouldBeLogged()) this.displayException(thrown, context);
    } else if (thrown instanceof Error) {
      this.displayError(thrown, context);
    } else {
      throw new Error(`Thrown ${JSON.stringify(thrown)} is not an Error`);
    }
  }

  private displayException(exception: AppError, context: ArgumentsHost): void {
    const requestText = display(context.switchToHttp().getRequest());
    const reason = `${exception.code}: ${exception.devMessage()}`;
    this.logger.warn(`${requestText} failed with ${reason}`);
  }

  private displayError(error: Error, context: ArgumentsHost): void {
    const requestText = display(context.switchToHttp().getRequest());
    const message = singleLineMessage(error);
    this.logger.error(`Unexpected error on ${requestText}: ${message}`);
  }

  private onCatchFailed(reason: Error): void {
    const message = singleLineMessage(reason);
    this.logger.error(`Failed to catch an error: ${message}`);
  }
}
