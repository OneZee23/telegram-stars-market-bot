import { UserModule } from '@modules/user/user.module';
import { Module } from '@nestjs/common';
import { FragmentConfig } from './fragment.config';
import { FragmentApiClientService } from './services/fragment-api-client.service';
import { StarsPurchaseService } from './services/stars-purchase.service';

@Module({
  imports: [UserModule],
  providers: [FragmentConfig, FragmentApiClientService, StarsPurchaseService],
  exports: [StarsPurchaseService],
})
export class FragmentModule {}
