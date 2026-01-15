import {
  Column,
  CreateDateColumn,
  DeepPartial,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PaymentEntity } from './payment.entity';

@Entity({ name: 'yookassa_payments' })
@Index(['paymentId'])
@Index(['paymentEntityId'])
export class YooKassaPaymentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** YooKassa payment ID */
  @Column({ name: 'payment_id', type: 'varchar', unique: true })
  paymentId: string;

  /** Link to PaymentEntity */
  @Column({ name: 'payment_entity_id', type: 'uuid' })
  paymentEntityId: string;

  @ManyToOne(() => PaymentEntity)
  @JoinColumn({ name: 'payment_entity_id' })
  payment?: PaymentEntity;

  /** Confirmation URL for payment */
  @Column({ name: 'confirmation_url', type: 'text', nullable: true })
  confirmationUrl?: string;

  /** Payment metadata (JSON) */
  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown>;

  /** YooKassa payment status */
  @Column({ name: 'yookassa_status', type: 'varchar' })
  yookassaStatus: string;

  @CreateDateColumn({ name: 'created_at' })
  public readonly createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  public readonly updatedAt: Date;

  constructor(partial?: DeepPartial<YooKassaPaymentEntity>) {
    if (partial) {
      Object.assign(this, partial);
    }
  }
}

