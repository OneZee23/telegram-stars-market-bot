import { TelegramBotModule } from '@modules/gateway/telegram-bot.module';
import { Module } from '@nestjs/common';
import { NotificationsConfig } from './notifications.config';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [TelegramBotModule],
  providers: [NotificationsConfig, NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
