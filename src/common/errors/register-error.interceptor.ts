import { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { catchError, Observable } from 'rxjs';
import { AppError } from './app-error';
import { registerError } from './registry';

export class RegisterErrorInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler<any>): Observable<any> {
    return next.handle().pipe(
      catchError((thrown: any) => {
        if (thrown instanceof Error && !(thrown instanceof AppError))
          registerError(thrown);

        throw thrown;
      }),
    );
  }
}
