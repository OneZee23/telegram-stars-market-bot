import {
  applyDecorators,
  HttpCode,
  HttpStatus,
  Post,
  UseFilters,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { JsonRpcExceptionFilter } from '@common/json-rpc/json-rpc.exception-filter';
import { JsonRpcInterceptor } from '@common/json-rpc/json-rpc.interceptor';
import { ValidationFailedAppError } from '@common/errors/validation-failed.app-error';
import { RegisterErrorInterceptor } from '@common/errors/register-error.interceptor';

interface JsonRpcApiEntryConfig {
  readonly path: string;
}

const Validator = new ValidationPipe({
  transform: true,
  exceptionFactory: (errors) => new ValidationFailedAppError(errors),
});

export function JsonRpcApiEntry(
  config: JsonRpcApiEntryConfig,
): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    Post(config.path),
    HttpCode(HttpStatus.OK),
    UseFilters(JsonRpcExceptionFilter),
    UseInterceptors(RegisterErrorInterceptor, JsonRpcInterceptor),
    UsePipes(Validator),
  );
}
