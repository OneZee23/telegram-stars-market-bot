import { TelegramBotConfig } from '@modules/telegram-core/telegram-bot.config';
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';

@Injectable()
export class TelegramBotWebhookGuard implements CanActivate {
  constructor(
    private readonly config: TelegramBotConfig,
    private readonly logger: Logger,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const request = http.getRequest();
    const apiKey = request.headers['x-telegram-bot-api-secret-token'];
    if (!apiKey) {
      this.logger.warn(`Received request without apikey`);
      throw new ForbiddenException('Missing apikey from telegram');
    }
    if (apiKey !== this.config.telegramWebhookApiKey) {
      this.logger.warn(`Received request with wrong apikey: ***`);
      throw new UnauthorizedException('Telegram apikey mismatched');
    }
    return true;
  }
}
