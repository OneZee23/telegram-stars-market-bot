import {
  Column,
  CreateDateColumn,
  DeepPartial,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum StarsPurchaseStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity({ name: 'stars_purchases' })
@Index(['userId'])
@Index(['fragmentRequestId'])
@Index(['status']) // For payment timeout service JOIN queries
export class StarsPurchaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Telegram user ID who initiated the purchase */
  @Column({ name: 'user_id', type: 'varchar' })
  userId: string;

  /** Telegram username of the recipient */
  @Column({ name: 'recipient_username', type: 'varchar' })
  recipientUsername: string;

  /** Amount of stars purchased */
  @Column({ name: 'stars_amount', type: 'int' })
  starsAmount: number;

  /** Fragment API request ID */
  @Column({ name: 'fragment_request_id', type: 'varchar', nullable: true })
  fragmentRequestId?: string;

  /** Transaction hash from blockchain */
  @Column({ name: 'tx_hash', type: 'varchar', nullable: true })
  txHash?: string;

  /** Status of the purchase */
  @Column({
    name: 'status',
    type: 'enum',
    enum: StarsPurchaseStatus,
    default: StarsPurchaseStatus.PENDING,
  })
  status: StarsPurchaseStatus;

  /** Error message if purchase failed */
  @Column({ name: 'error', type: 'text', nullable: true })
  error?: string;

  @CreateDateColumn({ name: 'created_at' })
  public readonly createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  public readonly updatedAt: Date;

  constructor(partial?: DeepPartial<StarsPurchaseEntity>) {
    if (partial) {
      Object.assign(this, partial);
    }
  }
}
