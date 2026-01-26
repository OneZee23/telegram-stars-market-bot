import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum ConsentType {
  PERSONAL_DATA = 'personal_data',
}

@Entity({ name: 'user_consent' })
@Index(['userId', 'consentType'])
export class UserConsentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Telegram ID of the user */
  @Column({ name: 'user_id', type: 'varchar' })
  userId: string;

  /** Telegram username at the time of consent */
  @Column({ name: 'username', type: 'varchar', nullable: true })
  username?: string;

  /** Type of consent (e.g., 'personal_data') */
  @Column({ name: 'consent_type', type: 'varchar' })
  consentType: string;

  /** Version of the consent document */
  @Column({ name: 'consent_version', type: 'varchar' })
  consentVersion: string;

  /** Whether consent is currently granted */
  @Column({ name: 'is_granted', type: 'boolean', default: false })
  isGranted: boolean;

  /** Timestamp when consent was granted */
  @Column({ name: 'granted_at', type: 'timestamp', nullable: true })
  grantedAt?: Date;

  /** Timestamp when consent was revoked */
  @Column({ name: 'revoked_at', type: 'timestamp', nullable: true })
  revokedAt?: Date;

  @CreateDateColumn({ name: 'created_at' })
  public readonly createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  public readonly updatedAt: Date;
}
