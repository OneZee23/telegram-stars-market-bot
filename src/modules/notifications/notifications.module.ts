import { TelegramCoreModule } from '@modules/telegram-core/telegram-core.module';
import { Module } from '@nestjs/common';
import { NotificationsConfig } from './notifications.config';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [TelegramCoreModule],
  providers: [NotificationsConfig, NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
