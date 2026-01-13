import { Injectable } from '@nestjs/common';
import { IsNotEmpty, IsString, validateSync } from 'class-validator';

@Injectable()
export class TelegramBotConfig {
  @IsString()
  public readonly botToken = process.env.BOT_TOKEN;

  @IsString()
  @IsNotEmpty()
  public readonly telegramWebhookApiKey = process.env.TELEGRAM_WEBHOOK_API_KEY;

  @IsString()
  @IsNotEmpty()
  public readonly publicUrl = process.env.PUBLIC_URL;

  constructor() {
    this.validateSelf();
  }

  private validateSelf(): void {
    const errors = validateSync(this);
    if (errors.length > 0) throw new Error(JSON.stringify(errors));
  }
}
