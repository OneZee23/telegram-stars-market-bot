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
  PAID = 'paid',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

@Entity({ name: 'payments' })
@Index(['userId'])
@Index(['status'])
export class PaymentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Telegram user ID who initiated the payment */
  @Column({ name: 'user_id', type: 'varchar' })
  userId: string;

  /** Amount of stars to purchase */
  @Column({ name: 'stars_amount', type: 'int' })
  starsAmount: number;

  /** Price in rubles (with discount applied at purchase time) */
  @Column({ name: 'price_rub', type: 'decimal', precision: 10, scale: 2 })
  priceRub: number;

  /** Applied discount percentage */
  @Column({
    name: 'discount_percent',
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  discountPercent?: number;

  /** Payment status */
  @Column({
    name: 'status',
    type: 'varchar',
    default: PaymentStatus.PENDING,
  })
  status: PaymentStatus;

  /** Recipient username (without @) */
  @Column({ name: 'recipient_username', type: 'varchar' })
  recipientUsername: string;

  /** Fragment request ID (if purchase was completed) */
  @Column({ name: 'stars_purchase_id', type: 'varchar', nullable: true })
  starsPurchaseId?: string;

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

