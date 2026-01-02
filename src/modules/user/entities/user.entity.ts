import {
  Column,
  CreateDateColumn,
  DeepPartial,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'user' })
@Index(['userId'])
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Telegram ID of the user who has registered in our gateway bot system */
  @Column({ name: 'user_id', type: 'varchar', unique: true })
  userId: string;

  /** Telegram username of the user */
  @Column({ name: 'username', type: 'varchar', nullable: true })
  username?: string;

  @Column({ name: 'language', type: 'varchar', default: 'en' })
  language: string;

  @Column({ name: 'in_white_list', type: 'boolean', default: false })
  inWhiteList: boolean;

  @Column({ name: 'test_claims', type: 'int', default: 0 })
  testClaims: number;

  @CreateDateColumn({ name: 'created_at' })
  public readonly createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  public readonly updatedAt: Date;

  constructor(partial?: DeepPartial<UserEntity>) {
    if (partial) {
      Object.assign(this, partial);
    }
  }
}
