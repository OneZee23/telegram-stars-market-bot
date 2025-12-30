import { UserModule } from '@modules/user/user.module';
import { Logger, Module } from '@nestjs/common';
import { Telegraf } from 'telegraf';
import { BotCommandHandler } from './handlers/bot-command.handler';
import { CallbackQueryHandler } from './handlers/callback-query.handler';
import { MessageHandler } from './handlers/message.handler';
import { MessageManagementService } from './services/message-management.service';
import { UserStateService } from './services/user-state.service';
import { TelegramBotConfig } from './telegram-bot.config';
import { TelegramBotController } from './telegram-bot.controller';
import { TelegramBotService } from './telegram-bot.service';

@Module({
  imports: [UserModule],
  providers: [
    TelegramBotConfig,
    TelegramBotService,
    MessageManagementService,
    UserStateService,
    BotCommandHandler,
    CallbackQueryHandler,
    MessageHandler,
    {
      provide: Telegraf,
      inject: [TelegramBotConfig],
      useFactory: (config: TelegramBotConfig) => new Telegraf(config.botToken),
    },
    {
      provide: Logger,
      useValue: new Logger('TelegramBot'),
    },
  ],
  controllers: [TelegramBotController],
  exports: [Telegraf, TelegramBotService],
})
export class TelegramBotModule {}
