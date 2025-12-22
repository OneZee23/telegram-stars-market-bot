import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Update } from 'telegraf/types';
import { TelegramBotWebhookGuard } from './telegram-bot-webhook.guard';
import { TelegramBotService } from './telegram-bot.service';

@Controller()
export class TelegramBotController {
  constructor(private readonly telegramBotService: TelegramBotService) {}

  @Post(TelegramBotService.webhookPath)
  @UseGuards(TelegramBotWebhookGuard)
  @HttpCode(HttpStatus.OK)
  async onWebhookArrived(@Body() update: Update): Promise<void> {
    await this.telegramBotService.handleUpdate(update);
  }
}
