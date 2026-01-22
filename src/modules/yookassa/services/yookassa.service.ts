// eslint-disable-next-line import/no-extraneous-dependencies
import { ICreatePayment, YooCheckout } from '@a2seven/yoo-checkout';
import { Injectable, Logger } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { PaymentEntity, PaymentStatus } from '../entities/payment.entity';
import { YooKassaConfig } from '../yookassa.config';

export interface CreatePaymentParams {
  userId: string;
  recipientUsername: string;
  starsAmount: number;
  priceRub: number;
  returnUrl?: string;
  isTestPurchase?: boolean;
}

export interface CreatePaymentResult {
  success: boolean;
  paymentId?: string;
  confirmationUrl?: string;
  error?: string;
}

@Injectable()
export class YooKassaService {
  private readonly logger = new Logger(YooKassaService.name);

  private readonly checkout: YooCheckout;

  constructor(
    private readonly config: YooKassaConfig,
    @InjectEntityManager()
    private readonly em: EntityManager,
  ) {
    this.checkout = new YooCheckout({
      shopId: config.shopId,
      secretKey: config.secretKey,
    });
  }

  /**
   * Create a payment in YooKassa
   * @param params Payment parameters
   * @returns Payment creation result
   */
  async createPayment(
    params: CreatePaymentParams,
  ): Promise<CreatePaymentResult> {
    try {
      // Create payment entity first
      const payment = this.em.create(PaymentEntity, {
        userId: params.userId,
        recipientUsername: params.recipientUsername,
        starsAmount: params.starsAmount,
        priceRub: params.priceRub,
        status: PaymentStatus.PENDING,
        isTestPurchase: params.isTestPurchase || false,
      });

      await this.em.save(payment);

      this.logger.log(
        `Creating YooKassa payment for user ${params.userId}, ${params.starsAmount} stars, ${params.priceRub} RUB`,
      );

      // Prepare payment data for YooKassa
      const paymentData: ICreatePayment = {
        amount: {
          value: params.priceRub.toFixed(2),
          currency: 'RUB',
        },
        confirmation: {
          type: 'redirect',
          return_url: params.returnUrl || 'https://t.me/onezee_co',
        },
        capture: true, // Auto-capture payment
        description: `Покупка ${params.starsAmount} Telegram Stars`,
        metadata: {
          userId: params.userId,
          recipientUsername: params.recipientUsername,
          starsAmount: params.starsAmount.toString(),
          paymentId: payment.id,
          isTestPurchase: params.isTestPurchase ? 'true' : 'false',
        },
      };

      this.logger.debug('Sending payment request to YooKassa', {
        shopId: this.config.shopId,
        amount: paymentData.amount,
        description: paymentData.description,
        metadata: paymentData.metadata,
      });

      // Create payment in YooKassa
      const yooKassaPayment = await this.checkout.createPayment(paymentData);

      // Update payment entity with YooKassa payment ID and confirmation URL
      payment.yooKassaPaymentId = yooKassaPayment.id;
      payment.confirmationUrl = yooKassaPayment.confirmation?.confirmation_url;
      payment.status =
        (yooKassaPayment.status as PaymentStatus) || PaymentStatus.PENDING;

      await this.em.save(payment);

      this.logger.log(
        `YooKassa payment created: ${yooKassaPayment.id}, confirmation URL: ${payment.confirmationUrl}`,
      );

      return {
        success: true,
        paymentId: payment.id,
        confirmationUrl: payment.confirmationUrl,
      };
    } catch (error) {
      let errorMessage: string;
      let errorDetails: string | undefined;

      if (error instanceof Error) {
        errorMessage = error.message;
        errorDetails = error.stack;
      } else if (typeof error === 'object' && error !== null) {
        errorMessage = JSON.stringify(error);
        errorDetails = JSON.stringify(error, null, 2);
      } else {
        errorMessage = String(error);
      }

      this.logger.error(
        `Failed to create YooKassa payment for user ${params.userId}, ${params.starsAmount} stars, ${params.priceRub} RUB: ${errorMessage}`,
        errorDetails,
      );

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Get payment by ID
   */
  async getPayment(paymentId: string): Promise<PaymentEntity | null> {
    return this.em.findOne(PaymentEntity, {
      where: { id: paymentId },
    });
  }

  /**
   * Get payment by YooKassa payment ID
   */
  async getPaymentByYooKassaId(
    yooKassaPaymentId: string,
  ): Promise<PaymentEntity | null> {
    return this.em.findOne(PaymentEntity, {
      where: { yooKassaPaymentId },
    });
  }

  /**
   * Update payment status
   */
  async updatePaymentStatus(
    paymentId: string,
    status: PaymentStatus,
  ): Promise<void> {
    const payment = await this.getPayment(paymentId);
    if (!payment) {
      throw new Error(`Payment ${paymentId} not found`);
    }

    payment.status = status;
    await this.em.save(payment);
  }

  /**
   * Link payment to stars purchase
   */
  async linkPaymentToPurchase(
    paymentId: string,
    starsPurchaseId: string,
  ): Promise<void> {
    const payment = await this.getPayment(paymentId);
    if (!payment) {
      throw new Error(`Payment ${paymentId} not found`);
    }

    payment.starsPurchaseId = starsPurchaseId;
    await this.em.save(payment);
  }

  /**
   * Handle webhook notification from YooKassa
   * @param event Webhook event data
   */
  async handleWebhook(event: any): Promise<void> {
    try {
      const paymentId = event.object?.id;
      if (!paymentId) {
        this.logger.warn('Webhook event missing payment ID');
        return;
      }

      const payment = await this.getPaymentByYooKassaId(paymentId);
      if (!payment) {
        this.logger.warn(
          `Payment not found for YooKassa payment ID: ${paymentId}`,
        );
        return;
      }

      const status = event.object?.status;
      if (status) {
        payment.status = status as PaymentStatus;
        await this.em.save(payment);

        this.logger.log(
          `Payment ${payment.id} status updated to ${status} via webhook`,
        );
      }
    } catch (error) {
      let errorMessage: string;
      let errorDetails: string | undefined;

      if (error instanceof Error) {
        errorMessage = error.message;
        errorDetails = error.stack;
      } else if (typeof error === 'object' && error !== null) {
        errorMessage = JSON.stringify(error);
        errorDetails = JSON.stringify(error, null, 2);
      } else {
        errorMessage = String(error);
      }

      this.logger.error(
        `Error handling YooKassa webhook: ${errorMessage}`,
        errorDetails,
      );
      throw error;
    }
  }
}
