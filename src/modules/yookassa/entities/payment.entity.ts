import {
  Column,
  CreateDateColumn,
  DeepPartial,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum PaymentStatus {
  PENDING = 'pending',
  WAITING_FOR_CAPTURE = 'waiting_for_capture',
  SUCCEEDED = 'succeeded',
  CANCELED = 'canceled',
}

@Entity({ name: 'payments' })
@Index(['userId'])
@Index(['yooKassaPaymentId'])
@Index(['starsPurchaseId'])
export class PaymentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Telegram user ID who initiated the payment */
  @Column({ name: 'user_id', type: 'varchar' })
  userId: string;

  /** Telegram username of the recipient */
  @Column({ name: 'recipient_username', type: 'varchar' })
  recipientUsername: string;

  /** Amount of stars to purchase */
  @Column({ name: 'stars_amount', type: 'int' })
  starsAmount: number;

  /** Price in RUB */
  @Column({ name: 'price_rub', type: 'decimal', precision: 10, scale: 2 })
  priceRub: number;

  /** YooKassa payment ID */
  @Column({
    name: 'yookassa_payment_id',
    type: 'varchar',
    nullable: true,
    unique: true,
  })
  yooKassaPaymentId?: string;

  /** YooKassa payment status */
  @Column({
    name: 'status',
    type: 'enum',
    enum: PaymentStatus,
    default: PaymentStatus.PENDING,
  })
  status: PaymentStatus;

  /** Payment confirmation URL from YooKassa */
  @Column({ name: 'confirmation_url', type: 'text', nullable: true })
  confirmationUrl?: string;

  /** Link to stars purchase entity */
  @Column({ name: 'stars_purchase_id', type: 'uuid', nullable: true })
  starsPurchaseId?: string;

  /** Whether this is a test purchase (for whitelisted users) */
  @Column({ name: 'is_test_purchase', type: 'boolean', default: false })
  isTestPurchase: boolean;

  /** Error message if payment failed */
  @Column({ name: 'error', type: 'text', nullable: true })
  error?: string;

  @CreateDateColumn({ name: 'created_at' })
  public readonly createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  public readonly updatedAt: Date;

  constructor(partial?: DeepPartial<PaymentEntity>) {
    if (partial) {
      Object.assign(this, partial);
    }
  }
}
