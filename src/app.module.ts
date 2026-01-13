import { DatabaseModule } from '@infra/database/database.module';
import { WebserverModule } from '@infra/webserver/webserver.module';
import { FragmentModule } from '@modules/fragment/fragment.module';
import { TelegramBotModule } from '@modules/gateway/telegram-bot.module';
import { NotificationsModule } from '@modules/notifications/notifications.module';
import { UserModule } from '@modules/user/user.module';
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    // Infra
    ScheduleModule.forRoot(),
    DatabaseModule,
    WebserverModule,

    // Features
    TelegramBotModule,
    UserModule,
    FragmentModule,
    NotificationsModule,
  ],
})
export class AppModule {}
