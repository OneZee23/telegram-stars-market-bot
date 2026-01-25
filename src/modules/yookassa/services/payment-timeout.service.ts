import {
  StarsPurchaseEntity,
  StarsPurchaseStatus,
} from '@modules/fragment/entities/stars-purchase.entity';
import { getTranslations } from '@modules/gateway/i18n/translations';
import { UserService } from '@modules/user/user.service';
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectEntityManager } from '@nestjs/typeorm';
import { Telegraf } from 'telegraf';
import { EntityManager } from 'typeorm';
import { PaymentEntity, PaymentStatus } from '../entities/payment.entity';

/**
 * Payment statuses that indicate successful payment
 * (payment was received, but stars purchase may still be processing)
 */
const SUCCESSFUL_PAYMENT_STATUSES = [
  PaymentStatus.SUCCEEDED,
  PaymentStatus.WAITING_FOR_CAPTURE,
];

@Injectable()
export class PaymentTimeoutService {
  private readonly logger = new Logger(PaymentTimeoutService.name);

  private readonly TIMEOUT_MINUTES = 5;

  // Track notifications to avoid duplicates (in-memory, resets on restart)
  private readonly notifiedPayments = new Set<string>();

  constructor(
    @InjectEntityManager()
    private readonly em: EntityManager,
    private readonly userService: UserService,
    private readonly telegraf: Telegraf,
  ) { }

  /**
   * Check for stuck payments every minute
   * Payments that succeeded more than 5 minutes ago but purchase is not completed
   * Works with any payment provider (YooKassa, etc.)
   */
  @Cron('* * * * *') // Every minute
  async checkStuckPayments(): Promise<void> {
    try {
      const timeoutDate = new Date();
      timeoutDate.setMinutes(timeoutDate.getMinutes() - this.TIMEOUT_MINUTES);

      // Find payments that:
      // 1. Status indicates successful payment (SUCCEEDED, WAITING_FOR_CAPTURE, etc.)
      // 2. Created more than 5 minutes ago
      // 3. Have starsPurchaseId (purchase was started)
      const stuckPayments = await this.em
        .createQueryBuilder(PaymentEntity, 'payment')
        .where('payment.status IN (:...statuses)', {
          statuses: SUCCESSFUL_PAYMENT_STATUSES,
        })
        .andWhere('payment.created_at < :timeoutDate', { timeoutDate })
        .andWhere('payment.stars_purchase_id IS NOT NULL')
        .getMany();

      if (stuckPayments.length === 0) {
        return;
      }

      this.logger.log(
        `Found ${stuckPayments.length} potentially stuck payment(s)`,
      );

      await Promise.all(
        stuckPayments.map((payment) => this.checkPaymentStatus(payment)),
      );
    } catch (error) {
      this.logger.error(
        `Error checking stuck payments: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  /**
   * Check individual payment status and notify user if stuck
   */
  private async checkPaymentStatus(payment: PaymentEntity): Promise<void> {
    try {
      if (!payment.starsPurchaseId) {
        return;
      }

      const purchase = await this.em.findOne(StarsPurchaseEntity, {
        where: { id: payment.starsPurchaseId },
      });

      if (!purchase) {
        this.logger.warn(
          `Purchase not found for payment ${payment.id}, purchaseId: ${payment.starsPurchaseId}`,
        );
        return;
      }

      // If purchase is completed or failed, skip
      if (
        purchase.status === StarsPurchaseStatus.COMPLETED ||
        purchase.status === StarsPurchaseStatus.FAILED
      ) {
        return;
      }

      // Purchase is still processing after timeout - notify user
      // Check if we already notified about this payment (avoid spam)
      if (this.notifiedPayments.has(payment.id)) {
        return;
      }

      this.logger.warn(
        `Payment ${payment.id} is stuck: purchase ${purchase.id} status is ${purchase.status} after ${this.TIMEOUT_MINUTES} minutes`,
      );

      await this.notifyUserAboutStuckPayment(payment);
      this.notifiedPayments.add(payment.id);
    } catch (error) {
      this.logger.error(
        `Error checking payment ${payment.id} status: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Send notification to user about stuck payment
   */
  private async notifyUserAboutStuckPayment(
    payment: PaymentEntity,
  ): Promise<void> {
    try {
      const user = await this.userService.getOrCreateUser(payment.userId);
      const t = getTranslations(user.language);

      const message = t.buyStars.purchaseProcessing
        .replace('{amount}', payment.starsAmount.toString())
        .replace('{price}', payment.priceRub.toFixed(2));

      await this.telegraf.telegram.sendMessage(
        parseInt(payment.userId, 10),
        message,
      );

      this.logger.log(
        `Sent stuck payment notification to user ${payment.userId} for payment ${payment.id}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to notify user ${payment.userId} about stuck payment: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
