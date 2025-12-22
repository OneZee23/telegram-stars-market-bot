import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { TelegramBotConfig } from './telegram-bot.config';

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
      this.logger.warn(`Received request with wrong apikey: ${apiKey}`);
      throw new UnauthorizedException('Telegram apikey mismatched');
    }
    return true;
  }
}
