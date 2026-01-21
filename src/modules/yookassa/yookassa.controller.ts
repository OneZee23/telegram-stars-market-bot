import { StarsPurchaseEntity } from '@modules/fragment/entities/stars-purchase.entity';
import { StarsPurchaseService } from '@modules/fragment/services/stars-purchase.service';
import { PricingConfig } from '@modules/gateway/config/pricing.config';
import { NotificationsService } from '@modules/notifications/notifications.service';
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
} from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { PaymentStatus } from './entities/payment.entity';
import { YooKassaService } from './services/yookassa.service';
import { YooKassaWebhookEvent } from './yookassa-webhook-events.enum';

@Controller('api/yookassa')
export class YooKassaController {
  private readonly logger = new Logger(YooKassaController.name);

  constructor(
    private readonly yooKassaService: YooKassaService,
    private readonly starsPurchaseService: StarsPurchaseService,
    private readonly notificationsService: NotificationsService,
    private readonly pricingConfig: PricingConfig,
    @InjectEntityManager()
    private readonly em: EntityManager,
  ) {}

  /**
   * Webhook endpoint for YooKassa payment notifications
   * @param body Webhook payload from YooKassa
   */
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(@Body() body: any): Promise<void> {
    this.logger.debug('Received YooKassa webhook', { body });

    try {
      const { event } = body;
      const payment = body.object;

      this.logger.debug('Processing webhook event', {
        event,
        paymentId: payment?.id,
      });

      if (event === YooKassaWebhookEvent.PAYMENT_SUCCEEDED) {
        await this.handlePaymentSucceeded(payment);
        await this.yooKassaService.handleWebhook(body);
        return;
      }

      if (event === YooKassaWebhookEvent.PAYMENT_CANCELED) {
        await this.handlePaymentCanceled(payment);
        await this.yooKassaService.handleWebhook(body);
        return;
      }

      this.logger.debug(`Unhandled webhook event: ${event}`);
      await this.yooKassaService.handleWebhook(body);
    } catch (error) {
      this.logger.error(
        `Error processing YooKassa webhook: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  /**
   * Handle successful payment
   */
  private async handlePaymentSucceeded(payment: any): Promise<void> {
    this.logger.debug(`Payment succeeded: ${payment.id}`, { payment });

    const dbPayment = await this.yooKassaService.getPaymentByYooKassaId(
      payment.id,
    );

    if (!dbPayment) {
      this.logger.warn(`Payment not found in database: ${payment.id}`);
      return;
    }

    this.logger.debug('Found payment in database', {
      paymentId: dbPayment.id,
      userId: dbPayment.userId,
      starsAmount: dbPayment.starsAmount,
      isTestPurchase: dbPayment.isTestPurchase,
    });

    if (dbPayment.starsPurchaseId) {
      this.logger.debug(
        `Stars purchase already exists for payment ${dbPayment.id}`,
        { starsPurchaseId: dbPayment.starsPurchaseId },
      );
      return;
    }

    this.logger.debug(
      `Creating ${dbPayment.isTestPurchase ? 'test' : 'regular'} stars purchase`,
      {
        paymentId: dbPayment.id,
        userId: dbPayment.userId,
        recipientUsername: dbPayment.recipientUsername,
        starsAmount: dbPayment.starsAmount,
        isTestPurchase: dbPayment.isTestPurchase,
      },
    );

    const purchaseResult = dbPayment.isTestPurchase
      ? await this.starsPurchaseService.purchaseTestStars(
          dbPayment.userId,
          dbPayment.recipientUsername,
        )
      : await this.starsPurchaseService.purchaseStars(
          dbPayment.userId,
          dbPayment.recipientUsername,
          dbPayment.starsAmount,
          0,
          false,
        );

    this.logger.debug('Purchase result', {
      success: purchaseResult.success,
      requestId: purchaseResult.requestId,
      txHash: purchaseResult.txHash,
      error: purchaseResult.error,
    });

    if (!purchaseResult.success) {
      this.logger.error(
        `Failed to create stars purchase: ${purchaseResult.error}`,
        { paymentId: dbPayment.id },
      );
      const { PaymentEntity } = await import('./entities/payment.entity');
      const paymentRepo = this.em.getRepository(PaymentEntity);
      const paymentEntity = await paymentRepo.findOne({
        where: { id: dbPayment.id },
      });
      if (paymentEntity) {
        paymentEntity.error = purchaseResult.error || 'Unknown error';
        await paymentRepo.save(paymentEntity);
      }
      return;
    }

    if (!purchaseResult.requestId) {
      this.logger.warn('Purchase succeeded but no requestId returned', {
        paymentId: dbPayment.id,
      });
      return;
    }

    const purchaseRepo = this.em.getRepository(StarsPurchaseEntity);
    const purchaseEntity = await purchaseRepo.findOne({
      where: {
        fragmentRequestId: purchaseResult.requestId,
        userId: dbPayment.userId,
      },
      order: {
        createdAt: 'DESC',
      },
    });

    if (!purchaseEntity) {
      this.logger.warn('Purchase entity not found after creation', {
        requestId: purchaseResult.requestId,
        userId: dbPayment.userId,
      });
      return;
    }

    await this.yooKassaService.linkPaymentToPurchase(
      dbPayment.id,
      purchaseEntity.id,
    );

    this.logger.debug('Linked payment to purchase', {
      paymentId: dbPayment.id,
      purchaseId: purchaseEntity.id,
      requestId: purchaseResult.requestId,
      txHash: purchaseResult.txHash,
    });
  }

  /**
   * Handle canceled payment
   */
  private async handlePaymentCanceled(payment: any): Promise<void> {
    this.logger.debug(`Payment canceled: ${payment.id}`, { payment });

    const dbPayment = await this.yooKassaService.getPaymentByYooKassaId(
      payment.id,
    );

    if (!dbPayment) {
      this.logger.warn(`Payment not found in database: ${payment.id}`);
      return;
    }

    await this.yooKassaService.updatePaymentStatus(
      dbPayment.id,
      PaymentStatus.CANCELED,
    );

    this.logger.debug('Payment status updated to CANCELED', {
      paymentId: dbPayment.id,
    });
  }
}
