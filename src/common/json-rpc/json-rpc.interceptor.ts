import { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { map, Observable } from 'rxjs';
import { JsonRpc } from '@common/json-rpc/json-rpc';

/**
 * # Interceptor for JSON RPC Api
 *
 * ## Description
 * Transforms API responses to JSON RPC standard
 *
 * ## Usage
 * ```typescript
 * @Controller()
 * export class CatsController() {
 *   @Get('cats')
 *   @UseInterceptors(JsonRpcInterceptor)
 *   public getCats(): CatDto[] {
 *     return [...];
 *   }
 * }
 * ```
 */
export class JsonRpcInterceptor implements NestInterceptor {
  // eslint-disable-next-line class-methods-use-this
  intercept<TPayload>(
    context: ExecutionContext,
    next: CallHandler<TPayload>,
  ): Observable<any> {
    return next.handle().pipe(
      map(
        (payload): JsonRpc.SuccessfulResponse<TPayload> => ({
          status: 'ok',
          payload,
        }),
      ),
    );
  }
}
