import { Injectable, Logger } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { YooKassaService } from './yookassa.service';
import { PurchaseOptionService } from './purchase-option.service';
import { DexSwapService } from '@modules/ton/services/dex-swap.service';
import { StarsPurchaseService } from '@modules/fragment/services/stars-purchase.service';
import { NotificationsService } from '@modules/notifications/notifications.service';
import { WalletService } from '@modules/ton/services/wallet.service';
import { PaymentEntity, PaymentStatus } from '../entities/payment.entity';
import { YooKassaPaymentEntity } from '../entities/yookassa-payment.entity';
import { YooKassaWebhookEvent } from '../interfaces/yookassa.interfaces';

export interface CreatePaymentResult {
  success: boolean;
  paymentId?: string;
  confirmationUrl?: string;
  error?: string;
}

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly yooKassaService: YooKassaService,
    private readonly purchaseOptionService: PurchaseOptionService,
    private readonly dexSwapService: DexSwapService,
    private readonly starsPurchaseService: StarsPurchaseService,
    private readonly notificationsService: NotificationsService,
    private readonly walletService: WalletService,
    @InjectEntityManager()
    private readonly em: EntityManager,
  ) {}

  /**
   * Create payment request
   * Checks balance, creates payment in YooKassa, returns confirmation URL
   */
  async createPaymentRequest(
    userId: string,
    starsAmount: number,
    recipientUsername: string,
  ): Promise<CreatePaymentResult> {
    const paymentRepo = this.em.getRepository(PaymentEntity);
    const yooKassaPaymentRepo =
      this.em.getRepository(YooKassaPaymentEntity);

    try {
      // 1. Get purchase option
      const option =
        this.purchaseOptionService.getOptionByStarsAmount(starsAmount);
      if (!option) {
        return {
          success: false,
          error: 'invalid_stars_amount',
        };
      }

      const finalPrice = this.purchaseOptionService.getFinalPrice(option);

      // 2. Check balance before creating payment
      this.logger.debug(
        `Checking balance for ${starsAmount} stars (${finalPrice} RUB)`,
      );

      const balanceCheck =
        await this.starsPurchaseService.checkBalanceBeforePurchase(
          starsAmount,
        );

      if (!balanceCheck.canPurchase) {
        // Get actual balances for notification
        const walletData = await this.walletService.initializeWallet();
        if (walletData) {
          const tonBalance = await this.dexSwapService.getTonBalance(
            walletData.address,
          );
          const usdtBalance = await this.dexSwapService.getUsdtBalance(
            walletData.address,
          );

          const estimatedTonPerStar = 0.001;
          const estimatedRequiredTon = starsAmount * estimatedTonPerStar;

          await this.notificationsService.notifyPaymentFailedInsufficientBalance(
            tonBalance,
            estimatedRequiredTon.toString(),
            usdtBalance,
            starsAmount,
          );
        }

        return {
          success: false,
          error: balanceCheck.error || 'insufficient_balance',
        };
      }

      // 3. Create payment record in DB
      const payment = paymentRepo.create({
        userId,
        starsAmount,
        priceRub: finalPrice,
        discountPercent: option.discountPercent,
        status: PaymentStatus.PENDING,
        recipientUsername: recipientUsername.replace('@', ''),
      });
      await paymentRepo.save(payment);

      // 4. Create payment in YooKassa
      const yooKassaPayment = await this.yooKassaService.createPayment(
        finalPrice,
        'RUB',
        {
          userId,
          starsAmount: starsAmount.toString(),
          recipientUsername: recipientUsername.replace('@', ''),
          paymentId: payment.id,
        },
        `Покупка ${starsAmount} Telegram Stars`,
      );

      // 5. Save YooKassa payment data
      const yooKassaPaymentEntity = yooKassaPaymentRepo.create({
        paymentId: yooKassaPayment.id,
        paymentEntityId: payment.id,
        confirmationUrl: yooKassaPayment.confirmation?.confirmation_url,
        metadata: yooKassaPayment.metadata as Record<string, unknown>,
        yookassaStatus: yooKassaPayment.status,
      });
      await yooKassaPaymentRepo.save(yooKassaPaymentEntity);

      this.logger.log(
        `Payment created: ${payment.id}, YooKassa ID: ${yooKassaPayment.id}`,
      );

      return {
        success: true,
        paymentId: payment.id,
        confirmationUrl: yooKassaPayment.confirmation?.confirmation_url,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to create payment: ${message}`);
      return {
        success: false,
        error: message,
      };
    }
  }

  /**
   * Handle webhook from YooKassa
   */
  async handlePaymentWebhook(
    webhookData: YooKassaWebhookEvent,
  ): Promise<void> {
    const paymentRepo = this.em.getRepository(PaymentEntity);
    const yooKassaPaymentRepo =
      this.em.getRepository(YooKassaPaymentEntity);

    try {
      const yooKassaPaymentId = webhookData.object.id;
      this.logger.log(
        `Received webhook for payment: ${yooKassaPaymentId}, status: ${webhookData.object.status}`,
      );

      // Find YooKassa payment
      const yooKassaPayment = await yooKassaPaymentRepo.findOne({
        where: { paymentId: yooKassaPaymentId },
        relations: ['payment'],
      });

      if (!yooKassaPayment || !yooKassaPayment.payment) {
        this.logger.warn(
          `Payment not found for YooKassa ID: ${yooKassaPaymentId}`,
        );
        return;
      }

      const payment = yooKassaPayment.payment;

      // Update YooKassa payment status
      yooKassaPayment.yookassaStatus = webhookData.object.status;
      await yooKassaPaymentRepo.save(yooKassaPayment);

      // Handle payment status
      if (webhookData.object.status === 'succeeded') {
        if (payment.status === PaymentStatus.PENDING) {
          // Update payment status to PAID
          payment.status = PaymentStatus.PAID;
          await paymentRepo.save(payment);

          // Start stars purchase
          payment.status = PaymentStatus.PROCESSING;
          await paymentRepo.save(payment);

          try {
            const purchaseResult =
              await this.starsPurchaseService.purchaseStars(
                payment.userId,
                payment.recipientUsername,
                payment.starsAmount,
                0, // hideSender
                false, // isTestPurchase
              );

            if (purchaseResult.success) {
              payment.status = PaymentStatus.COMPLETED;
              payment.starsPurchaseId = purchaseResult.requestId;
              await paymentRepo.save(payment);

              this.logger.log(
                `Payment completed successfully: ${payment.id}`,
              );
            } else {
              payment.status = PaymentStatus.FAILED;
              await paymentRepo.save(payment);

              this.logger.error(
                `Stars purchase failed for payment ${payment.id}: ${purchaseResult.error}`,
              );
            }
          } catch (error) {
            payment.status = PaymentStatus.FAILED;
            await paymentRepo.save(payment);

            const message =
              error instanceof Error ? error.message : String(error);
            this.logger.error(
              `Error processing payment ${payment.id}: ${message}`,
            );
          }
        }
      } else if (webhookData.object.status === 'canceled') {
        payment.status = PaymentStatus.CANCELLED;
        await paymentRepo.save(payment);
        this.logger.log(`Payment cancelled: ${payment.id}`);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Error handling webhook: ${message}`);
      throw error;
    }
  }

  /**
   * Get available purchase options
   */
  getAvailablePurchaseOptions() {
    return this.purchaseOptionService.getAllActiveOptions();
  }
}

