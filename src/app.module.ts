import { DatabaseModule } from '@infra/database/database.module';
import { WebserverModule } from '@infra/webserver/webserver.module';
import { TelegramBotModule } from '@modules/gateway/telegram-bot.module';
import { Module } from '@nestjs/common';

@Module({
  imports: [
    // Infra
    DatabaseModule,
    WebserverModule,

    // Features
    TelegramBotModule,
  ],
})
export class AppModule {}
