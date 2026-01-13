import { FragmentModule } from '@modules/fragment/fragment.module';
import { TelegramCoreModule } from '@modules/telegram-core/telegram-core.module';
import { UserModule } from '@modules/user/user.module';
import { Logger, Module } from '@nestjs/common';
import { BotCommandHandler } from './handlers/bot-command.handler';
import { CallbackQueryHandler } from './handlers/callback-query.handler';
import { MessageHandler } from './handlers/message.handler';
import { MessageManagementService } from './services/message-management.service';
import { UserStateService } from './services/user-state.service';
import { TelegramBotWebhookGuard } from './telegram-bot-webhook.guard';
import { TelegramBotController } from './telegram-bot.controller';
import { TelegramBotService } from './telegram-bot.service';

@Module({
  imports: [TelegramCoreModule, UserModule, FragmentModule],
  providers: [
    TelegramBotService,
    MessageManagementService,
    UserStateService,
    BotCommandHandler,
    CallbackQueryHandler,
    MessageHandler,
    TelegramBotWebhookGuard,
    {
      provide: Logger,
      useValue: new Logger('TelegramBot'),
    },
  ],
  controllers: [TelegramBotController],
  exports: [TelegramBotService],
})
export class TelegramBotModule {}
