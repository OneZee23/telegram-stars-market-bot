import { FragmentModule } from '@modules/fragment/fragment.module';
import { TelegramCoreModule } from '@modules/telegram-core/telegram-core.module';
import { UserModule } from '@modules/user/user.module';
import { Module } from '@nestjs/common';
import { YooKassaService } from './services/yookassa.service';
import { YooKassaConfig } from './yookassa.config';
import { YooKassaController } from './yookassa.controller';

@Module({
  imports: [FragmentModule, TelegramCoreModule, UserModule],
  providers: [YooKassaConfig, YooKassaService],
  exports: [YooKassaService],
  controllers: [YooKassaController],
})
export class YooKassaModule {}
