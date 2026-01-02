import { DatabaseModule } from '@infra/database/database.module';
import { WebserverModule } from '@infra/webserver/webserver.module';
import { FragmentModule } from '@modules/fragment/fragment.module';
import { TelegramBotModule } from '@modules/gateway/telegram-bot.module';
import { UserModule } from '@modules/user/user.module';
import { Module } from '@nestjs/common';

@Module({
  imports: [
    // Infra
    DatabaseModule,
    WebserverModule,

    // Features
    TelegramBotModule,
    UserModule,
    FragmentModule,
  ],
})
export class AppModule {}
