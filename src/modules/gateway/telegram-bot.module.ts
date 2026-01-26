import { FragmentModule } from '@modules/fragment/fragment.module';
import { NotificationsModule } from '@modules/notifications/notifications.module';
import { TelegramCoreModule } from '@modules/telegram-core/telegram-core.module';
import { UserModule } from '@modules/user/user.module';
import { YooKassaModule } from '@modules/yookassa/yookassa.module';
import { Logger, Module } from '@nestjs/common';
import { PricingConfig } from './config/pricing.config';
import { BotCommandHandler } from './handlers/bot-command.handler';
import { CallbackQueryHandler } from './handlers/callback-query.handler';
import { MessageHandler } from './handlers/message.handler';
import { UserStateService } from './services/user-state.service';
import { TelegramBotWebhookGuard } from './telegram-bot-webhook.guard';
import { TelegramBotController } from './telegram-bot.controller';
import { TelegramBotService } from './telegram-bot.service';

@Module({
  imports: [
    TelegramCoreModule,
    UserModule,
    FragmentModule,
    YooKassaModule,
    NotificationsModule,
  ],
  providers: [
    PricingConfig,
    TelegramBotService,
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
  exports: [TelegramBotService, PricingConfig, UserStateService],
})
export class TelegramBotModule {}
