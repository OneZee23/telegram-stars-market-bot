import { JsonRpcInterceptor } from '@common/json-rpc/json-rpc.interceptor';
import { ExecutionContext } from '@nestjs/common';
import { firstValueFrom, Observable, of } from 'rxjs';
import { JsonRpc } from '@common/json-rpc/json-rpc';

describe('JsonRPC Interceptor', () => {
  it('Should correctly transform successful answer', async () => {
    const interceptor = new JsonRpcInterceptor();
    const response = { cats: [{ name: 'Tracy' }] };

    const intercepted = interceptor.intercept(
      undefined as unknown as ExecutionContext,
      {
        handle(): Observable<any> {
          return of(response);
        },
      },
    );

    const realResponse: JsonRpc.Response<typeof response> =
      await firstValueFrom(intercepted);

    expect(realResponse.status).toBe('ok');

    if (realResponse.status === 'ok') {
      expect(realResponse.payload).toEqual(response);
    }
  });
});
