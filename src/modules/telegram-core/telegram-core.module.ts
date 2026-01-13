import { Module } from '@nestjs/common';
import { Telegraf } from 'telegraf';
import { TelegramBotConfig } from './telegram-bot.config';

@Module({
  providers: [
    TelegramBotConfig,
    {
      provide: Telegraf,
      inject: [TelegramBotConfig],
      useFactory: (config: TelegramBotConfig) => new Telegraf(config.botToken),
    },
  ],
  exports: [Telegraf, TelegramBotConfig],
})
export class TelegramCoreModule {}
