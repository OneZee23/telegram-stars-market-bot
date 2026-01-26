import {
  StarsPurchaseEntity,
  StarsPurchaseStatus,
} from '@modules/fragment/entities/stars-purchase.entity';
import { getTranslations } from '@modules/gateway/i18n/translations';
import { NotificationsService } from '@modules/notifications/notifications.service';
import { UserService } from '@modules/user/user.service';
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectEntityManager } from '@nestjs/typeorm';
import { Telegraf } from 'telegraf';
import { EntityManager } from 'typeorm';
import { PaymentEntity, PaymentStatus } from '../entities/payment.entity';

enum StuckPaymentReason {
  PENDING = 'pending',
  PROCESSING = 'processing',
}

const SUCCESSFUL_PAYMENT_STATUSES: PaymentStatus[] = [
  PaymentStatus.SUCCEEDED,
  PaymentStatus.WAITING_FOR_CAPTURE,
];

@Injectable()
export class PaymentTimeoutService {
  private readonly logger = new Logger(PaymentTimeoutService.name);

  private readonly TIMEOUT_MINUTES = 15;

  constructor(
    @InjectEntityManager()
    private readonly em: EntityManager,
    private readonly userService: UserService,
    private readonly telegraf: Telegraf,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Check for stuck payments every minute
   * 1. Payments with PENDING status created more than 15 minutes ago (webhook didn't arrive)
   * 2. Payments that succeeded more than 15 minutes ago but purchase is not completed
   * Works with any payment provider (YooKassa, etc.)
   */
  @Cron('* * * * *') // Every minute
  async checkStuckPayments(): Promise<void> {
    this.logger.debug('Checking for stuck payments...');
    try {
      // Use transaction for consistent read snapshot
      await this.em.transaction(async (transactionalEm) => {
        const timeoutDate = new Date();
        timeoutDate.setMinutes(timeoutDate.getMinutes() - this.TIMEOUT_MINUTES);

        // Case 1: Find payments that are still PENDING (webhook didn't arrive):
        // 1. Status is PENDING
        // 2. Created more than 15 minutes ago
        // 3. Don't have starsPurchaseId (webhook never arrived, purchase never started)
        // 4. Notification not sent yet
        const pendingStuckPayments = await transactionalEm
          .createQueryBuilder(PaymentEntity, 'payment')
          .where('payment.status = :pendingStatus', {
            pendingStatus: PaymentStatus.PENDING,
          })
          .andWhere('payment.created_at < :timeoutDate', { timeoutDate })
          .andWhere('payment.stars_purchase_id IS NULL')
          .andWhere('payment.stuck_notification_sent = :notSent', {
            notSent: false,
          })
          .getMany();

        // Case 2: Find payments that succeeded but purchase is stuck:
        // 1. Status indicates successful payment (SUCCEEDED, WAITING_FOR_CAPTURE)
        // 2. Updated more than 15 minutes ago (when payment became SUCCEEDED)
        // 3. Have starsPurchaseId (purchase was started)
        // 4. Purchase status is not COMPLETED and not FAILED
        // 5. Notification not sent yet
        const succeededStuckPayments = await transactionalEm
          .createQueryBuilder(PaymentEntity, 'payment')
          .innerJoin(
            StarsPurchaseEntity,
            'purchase',
            'purchase.id = payment.stars_purchase_id',
          )
          .where('payment.status IN (:...statuses)', {
            statuses: SUCCESSFUL_PAYMENT_STATUSES,
          })
          .andWhere('payment.updated_at < :timeoutDate', { timeoutDate })
          .andWhere('payment.stars_purchase_id IS NOT NULL')
          .andWhere('payment.stuck_notification_sent = :notSent', {
            notSent: false,
          })
          .andWhere('purchase.status NOT IN (:...completedStatuses)', {
            completedStatuses: [
              StarsPurchaseStatus.COMPLETED,
              StarsPurchaseStatus.FAILED,
            ],
          })
          .select('payment')
          .getMany();

        const allStuckPayments = [
          ...pendingStuckPayments,
          ...succeededStuckPayments,
        ];

        if (allStuckPayments.length === 0) {
          this.logger.debug('No stuck payments found');
          return;
        }

        this.logger.log(
          `Found ${allStuckPayments.length} potentially stuck payment(s) (${pendingStuckPayments.length} pending, ${succeededStuckPayments.length} succeeded but purchase stuck)`,
        );

        // Process payments outside transaction to avoid long-running transaction
        await Promise.all(
          allStuckPayments.map((payment) => this.checkPaymentStatus(payment)),
        );
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Error checking stuck payments: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );

      // Send alert for all errors
      this.notificationsService
        .notifyCriticalError('Payment timeout service', 'Произошла ошибка')
        .catch((err) => {
          this.logger.error(
            `Failed to send alert: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
    }
  }

  /**
   * Check individual payment status and notify user if stuck
   */
  private async checkPaymentStatus(payment: PaymentEntity): Promise<void> {
    try {
      if (payment.stuckNotificationSent) {
        return;
      }

      if (
        payment.status === PaymentStatus.PENDING &&
        !payment.starsPurchaseId
      ) {
        this.logger.warn(
          `Payment ${payment.id} is stuck: still PENDING after ${this.TIMEOUT_MINUTES} minutes, webhook never arrived`,
        );
        await this.notifyUserAboutStuckPayment(
          payment,
          StuckPaymentReason.PENDING,
        );
        return;
      }

      if (
        !SUCCESSFUL_PAYMENT_STATUSES.includes(payment.status) ||
        !payment.starsPurchaseId
      ) {
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

      if (
        purchase.status === StarsPurchaseStatus.COMPLETED ||
        purchase.status === StarsPurchaseStatus.FAILED
      ) {
        return;
      }

      this.logger.warn(
        `Payment ${payment.id} is stuck: purchase ${purchase.id} status is ${purchase.status} after ${this.TIMEOUT_MINUTES} minutes since payment succeeded`,
      );

      await this.notifyUserAboutStuckPayment(
        payment,
        StuckPaymentReason.PROCESSING,
      );
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
    reason: StuckPaymentReason,
  ): Promise<void> {
    try {
      const user = await this.userService.getOrCreateUser(payment.userId);
      const t = getTranslations(user.language);

      const message =
        reason === StuckPaymentReason.PENDING
          ? t.buyStars.paymentStuck
          : t.buyStars.purchaseProcessing
              .replace('{amount}', payment.starsAmount.toString())
              .replace('{price}', payment.priceRub.toFixed(2));

      await this.telegraf.telegram.sendMessage(
        parseInt(payment.userId, 10),
        message,
      );

      // Mark notification as sent in database
      await this.em.update(
        PaymentEntity,
        { id: payment.id },
        { stuckNotificationSent: true },
      );

      this.logger.log(
        `Sent stuck payment notification to user ${payment.userId} for payment ${payment.id} (reason: ${reason})`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to notify user ${payment.userId} about stuck payment: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
