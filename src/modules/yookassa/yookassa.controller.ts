import {
  StarsPurchaseEntity,
  StarsPurchaseStatus,
} from '@modules/fragment/entities/stars-purchase.entity';
import { StarsPurchaseService } from '@modules/fragment/services/stars-purchase.service';
import { LEGAL_INFO } from '@modules/gateway/constants/legal.constants';
import { getTranslations } from '@modules/gateway/i18n/translations';
import { MessageManagementService } from '@modules/gateway/services/message-management.service';
import { formatPriceForButton } from '@modules/gateway/utils/price-formatter.util';
import { UserService } from '@modules/user/user.service';
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
} from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { Telegraf } from 'telegraf';
import { EntityManager } from 'typeorm';
import { PaymentEntity, PaymentStatus } from './entities/payment.entity';
import { YooKassaService } from './services/yookassa.service';
import { YooKassaWebhookEvent } from './yookassa-webhook-events.enum';

@Controller('api/yookassa')
export class YooKassaController {
  private readonly logger = new Logger(YooKassaController.name);

  constructor(
    private readonly yooKassaService: YooKassaService,
    private readonly starsPurchaseService: StarsPurchaseService,
    @InjectEntityManager()
    private readonly em: EntityManager,
    private readonly messageManagementService: MessageManagementService,
    private readonly telegraf: Telegraf,
    private readonly userService: UserService,
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

      if (event === YooKassaWebhookEvent.PAYMENT_WAITING_FOR_CAPTURE) {
        await this.handlePaymentWaitingForCapture(payment);
        await this.yooKassaService.handleWebhook(body);
        return;
      }

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

      if (event === YooKassaWebhookEvent.REFUND_SUCCEEDED) {
        await this.handleRefundSucceeded(body.object);
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

    const dbPayment = await this.getPaymentByYooKassaId(payment.id);
    if (!dbPayment) {
      return;
    }

    // Update message based on purchase status
    if (dbPayment.starsPurchaseId) {
      this.logger.debug(
        `Stars purchase already exists for payment ${dbPayment.id}`,
        { starsPurchaseId: dbPayment.starsPurchaseId },
      );
      // Check purchase status and update message accordingly
      await this.updateMessageBasedOnPurchaseStatus(dbPayment);
      return;
    }

    // Update message to show payment success (purchase not started yet)
    await this.updatePaymentSuccessMessage(dbPayment);

    const purchaseResult = await this.createStarsPurchase(dbPayment);

    if (!purchaseResult.success || !purchaseResult.requestId) {
      if (!purchaseResult.success) {
        await this.savePaymentError(dbPayment, purchaseResult.error);
      }
      return;
    }

    const purchaseEntity = await this.findPurchaseByRequestId(
      purchaseResult.requestId,
      dbPayment.userId,
    );

    if (!purchaseEntity) {
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
    });
  }

  /**
   * Update message based on purchase status
   */
  private async updateMessageBasedOnPurchaseStatus(
    payment: PaymentEntity,
  ): Promise<void> {
    try {
      if (!payment.starsPurchaseId) {
        return;
      }

      const purchaseRepo = this.em.getRepository(StarsPurchaseEntity);
      const purchase = await purchaseRepo.findOne({
        where: { id: payment.starsPurchaseId },
      });

      if (!purchase) {
        this.logger.warn(
          `Purchase not found: ${payment.starsPurchaseId} for payment ${payment.id}`,
        );
        return;
      }

      const user = await this.userService.getOrCreateUser(payment.userId);
      const t = getTranslations(user.language);
      const formattedPrice = formatPriceForButton(payment.priceRub);

      let message: string;

      if (purchase.status === StarsPurchaseStatus.COMPLETED) {
        // Purchase completed - show success message with refund notice (ст. 26.1 ЗоЗПП)
        message = t.delivery.completed
          .replace('{amount}', payment.starsAmount.toString())
          .replace('{price}', formattedPrice)
          .replace('{supportTelegram}', LEGAL_INFO.SUPPORT_TELEGRAM);
      } else if (purchase.status === StarsPurchaseStatus.FAILED) {
        // Purchase failed - show error message
        message = t.buyStars.purchaseError.replace(
          '{error}',
          purchase.error || 'Unknown error',
        );
      } else {
        // Purchase still in progress - show processing message
        message = t.buyStars.paymentSuccess
          .replace('{amount}', payment.starsAmount.toString())
          .replace('{price}', formattedPrice);
      }

      await this.messageManagementService.editMessageByUserId(
        this.telegraf.telegram,
        payment.userId,
        message,
        undefined,
        { parse_mode: 'Markdown' },
      );
    } catch (error) {
      this.logger.warn(
        `Failed to update message based on purchase status for user ${payment.userId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Update message to show payment success and claiming in progress
   */
  private async updatePaymentSuccessMessage(
    payment: PaymentEntity,
  ): Promise<void> {
    try {
      const user = await this.userService.getOrCreateUser(payment.userId);
      const t = getTranslations(user.language);

      const formattedPrice = formatPriceForButton(payment.priceRub);
      const message = t.buyStars.paymentSuccess
        .replace('{amount}', payment.starsAmount.toString())
        .replace('{price}', formattedPrice);

      await this.messageManagementService.editMessageByUserId(
        this.telegraf.telegram,
        payment.userId,
        message,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to update payment success message for user ${payment.userId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Get payment by YooKassa payment ID or log warning
   */
  private async getPaymentByYooKassaId(
    yooKassaPaymentId: string,
  ): Promise<PaymentEntity | null> {
    const payment =
      await this.yooKassaService.getPaymentByYooKassaId(yooKassaPaymentId);

    if (!payment) {
      this.logger.warn(`Payment not found in database: ${yooKassaPaymentId}`);
      return null;
    }

    this.logger.debug('Found payment in database', {
      paymentId: payment.id,
      userId: payment.userId,
      starsAmount: payment.starsAmount,
      isTestPurchase: payment.isTestPurchase,
    });

    return payment;
  }

  /**
   * Create stars purchase based on payment type
   */
  private async createStarsPurchase(
    payment: PaymentEntity,
  ): Promise<{ success: boolean; requestId?: string; error?: string }> {
    this.logger.debug(
      `Creating ${payment.isTestPurchase ? 'test' : 'regular'} stars purchase`,
      {
        paymentId: payment.id,
        userId: payment.userId,
        recipientUsername: payment.recipientUsername,
        starsAmount: payment.starsAmount,
        isTestPurchase: payment.isTestPurchase,
      },
    );

    const purchaseResult = payment.isTestPurchase
      ? await this.starsPurchaseService.purchaseTestStars(
          payment.userId,
          payment.recipientUsername,
        )
      : await this.starsPurchaseService.purchaseStars(
          payment.userId,
          payment.recipientUsername,
          payment.starsAmount,
          0,
          false,
        );

    this.logger.debug('Purchase result', {
      success: purchaseResult.success,
      requestId: purchaseResult.requestId,
      txHash: purchaseResult.txHash,
      error: purchaseResult.error,
    });

    return purchaseResult;
  }

  /**
   * Save error to payment entity
   */
  private async savePaymentError(
    payment: PaymentEntity,
    error?: string,
  ): Promise<void> {
    this.logger.error(`Failed to create stars purchase: ${error}`, {
      paymentId: payment.id,
    });

    const paymentRepo = this.em.getRepository(PaymentEntity);
    const paymentEntity = await paymentRepo.findOne({
      where: { id: payment.id },
    });
    if (paymentEntity) {
      paymentEntity.error = error || 'Unknown error';
      await paymentRepo.save(paymentEntity);
    }
  }

  /**
   * Find purchase entity by request ID
   */
  private async findPurchaseByRequestId(
    requestId: string,
    userId: string,
  ): Promise<StarsPurchaseEntity | null> {
    const purchaseRepo = this.em.getRepository(StarsPurchaseEntity);
    const purchaseEntity = await purchaseRepo.findOne({
      where: {
        fragmentRequestId: requestId,
        userId,
      },
      order: {
        createdAt: 'DESC',
      },
    });

    if (!purchaseEntity) {
      this.logger.warn('Purchase entity not found after creation', {
        requestId,
        userId,
      });
    }

    return purchaseEntity;
  }

  /**
   * Handle payment waiting for capture
   */
  private async handlePaymentWaitingForCapture(payment: any): Promise<void> {
    this.logger.debug(`Payment waiting for capture: ${payment.id}`, {
      payment,
    });

    const dbPayment = await this.getPaymentByYooKassaId(payment.id);
    if (!dbPayment) {
      return;
    }

    await this.yooKassaService.updatePaymentStatus(
      dbPayment.id,
      PaymentStatus.WAITING_FOR_CAPTURE,
    );

    this.logger.debug('Payment status updated to WAITING_FOR_CAPTURE', {
      paymentId: dbPayment.id,
    });
  }

  /**
   * Handle canceled payment
   */
  private async handlePaymentCanceled(payment: any): Promise<void> {
    this.logger.debug(`Payment canceled: ${payment.id}`, { payment });

    const dbPayment = await this.getPaymentByYooKassaId(payment.id);
    if (!dbPayment) {
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

  /**
   * Handle refund succeeded
   *
   * IMPORTANT: We DO NOT initiate refunds programmatically because:
   * 1. Stars purchases are one-way transactions (cannot be reversed via Fragment API)
   * 2. Users cannot request refunds directly through YooKassa
   *
   * However, refunds CAN be initiated by:
   * - YooKassa support (if user contacts them)
   * - Bank chargeback (if user disputes the payment)
   * - Manual refund by us (if we decide to refund)
   *
   * This handler only processes webhook notifications about refunds that were
   * initiated externally. We log them for manual review and potential action.
   */
  private async handleRefundSucceeded(refund: any): Promise<void> {
    this.logger.warn(`Refund succeeded: ${refund.id}`, { refund });

    if (!refund.payment_id) {
      this.logger.warn('Refund missing payment_id', { refundId: refund.id });
      return;
    }

    const dbPayment = await this.getPaymentByYooKassaId(refund.payment_id);
    if (!dbPayment) {
      this.logger.warn(`Payment not found for refund: ${refund.payment_id}`, {
        refundId: refund.id,
      });
      return;
    }

    this.logger.warn('⚠️ EXTERNAL REFUND DETECTED - Manual review required', {
      paymentId: dbPayment.id,
      refundId: refund.id,
      starsPurchaseId: dbPayment.starsPurchaseId,
      userId: dbPayment.userId,
      starsAmount: dbPayment.starsAmount,
      refundAmount: refund.amount?.value,
      currency: refund.amount?.currency,
    });

    // Save refund information for manual review
    // Fragment API doesn't support refunding stars purchases,
    // so this requires manual intervention
    const paymentRepo = this.em.getRepository(PaymentEntity);
    const paymentEntity = await paymentRepo.findOne({
      where: { id: dbPayment.id },
    });
    if (paymentEntity) {
      paymentEntity.error = `EXTERNAL REFUND: ${refund.id}. Stars purchase ${dbPayment.starsPurchaseId || 'N/A'} cannot be automatically reversed. Manual review required.`;
      await paymentRepo.save(paymentEntity);
    }
  }
}
