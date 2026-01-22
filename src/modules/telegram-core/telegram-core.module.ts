import { MessageManagementService } from '@modules/gateway/services/message-management.service';
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
    MessageManagementService,
  ],
  exports: [Telegraf, TelegramBotConfig, MessageManagementService],
})
export class TelegramCoreModule { }
