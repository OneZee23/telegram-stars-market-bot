import { NotificationsService } from '@modules/notifications/notifications.service';
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

/**
 * Global exception filter that catches all unhandled exceptions
 * and sends critical errors to alerts channel
 */
@Catch()
@Injectable()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  private lastCriticalErrorTime: number = 0;

  private readonly CRITICAL_ERROR_COOLDOWN_MS = 60000; // 1 minute

  constructor(private readonly notificationsService: NotificationsService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    // Log error
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const { message } = exception;
      this.logger.error(`HTTP ${status}: ${message}`);
    } else if (exception instanceof Error) {
      this.logger.error(
        `Unhandled error: ${exception.message}`,
        exception.stack,
      );
    } else {
      this.logger.error(`Unknown error: ${JSON.stringify(exception)}`);
    }

    // Send alert for all errors
    this.sendAlert();

    // Send response
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.message
        : 'Internal server error';

    response.status(status).json({
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
    });
  }

  private sendAlert(): void {
    const now = Date.now();

    // Rate limit: don't send more than one alert per minute
    if (now - this.lastCriticalErrorTime < this.CRITICAL_ERROR_COOLDOWN_MS) {
      return;
    }

    this.lastCriticalErrorTime = now;

    this.notificationsService
      .notifyCriticalError('System error', 'Произошла ошибка')
      .catch((err) => {
        this.logger.error(
          `Failed to send alert: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }
}
