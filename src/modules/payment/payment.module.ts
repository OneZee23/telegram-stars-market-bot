import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { YooKassaConfig } from './yookassa.config';
import { PurchaseOptionsConfig } from './purchase-options.config';
import { YooKassaService } from './services/yookassa.service';
import { PurchaseOptionService } from './services/purchase-option.service';
import { PaymentService } from './services/payment.service';
import { PaymentController } from './controllers/payment.controller';
import { PaymentEntity } from './entities/payment.entity';
import { YooKassaPaymentEntity } from './entities/yookassa-payment.entity';
import { FragmentModule } from '@modules/fragment/fragment.module';
import { TonModule } from '@modules/ton/ton.module';
import { NotificationsModule } from '@modules/notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PaymentEntity, YooKassaPaymentEntity]),
    FragmentModule,
    TonModule,
    NotificationsModule,
  ],
  providers: [
    YooKassaConfig,
    PurchaseOptionsConfig,
    YooKassaService,
    PurchaseOptionService,
    PaymentService,
  ],
  controllers: [PaymentController],
  exports: [PaymentService, PurchaseOptionService],
})
export class PaymentModule {}

