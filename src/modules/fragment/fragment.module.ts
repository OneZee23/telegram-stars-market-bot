import { NotificationsModule } from '@modules/notifications/notifications.module';
import { UserModule } from '@modules/user/user.module';
import { Module } from '@nestjs/common';
import { FragmentConfig } from './fragment.config';
import { FragmentApiClientService } from './services/fragment-api-client.service';
import { ProxyManagerService } from './services/proxy-manager.service';
import { StarsPurchaseService } from './services/stars-purchase.service';
import { StonfiSwapService } from './services/stonfi-swap.service';

@Module({
  imports: [UserModule, NotificationsModule],
  providers: [
    FragmentConfig,
    ProxyManagerService,
    FragmentApiClientService,
    StonfiSwapService,
    StarsPurchaseService,
  ],
  exports: [StarsPurchaseService],
})
export class FragmentModule {}
