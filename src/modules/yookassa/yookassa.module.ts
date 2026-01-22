import { StarsPurchaseEntity } from '@modules/fragment/entities/stars-purchase.entity';
import { FragmentModule } from '@modules/fragment/fragment.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentEntity } from './entities/payment.entity';
import { YooKassaService } from './services/yookassa.service';
import { YooKassaConfig } from './yookassa.config';
import { YooKassaController } from './yookassa.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([PaymentEntity, StarsPurchaseEntity]),
    FragmentModule,
  ],
  providers: [YooKassaConfig, YooKassaService],
  exports: [YooKassaService],
  controllers: [YooKassaController],
})
export class YooKassaModule {}
