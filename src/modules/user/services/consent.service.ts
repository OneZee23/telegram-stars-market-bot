import { Injectable, Logger } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { ConsentType, UserConsentEntity } from '../entities/consent.entity';

@Injectable()
export class ConsentService {
  private readonly logger = new Logger(ConsentService.name);

  /** Current version of the personal data consent document */
  private readonly CURRENT_PD_VERSION = 'v1.0';

  constructor(
    @InjectEntityManager()
    private readonly em: EntityManager,
  ) {}

  /**
   * Check if user has valid consent for personal data processing
   * @param userId Telegram user ID
   * @returns true if user has valid consent
   */
  async hasValidConsent(userId: string): Promise<boolean> {
    const repo = this.em.getRepository(UserConsentEntity);

    const consent = await repo.findOne({
      where: {
        userId,
        consentType: ConsentType.PERSONAL_DATA,
        consentVersion: this.CURRENT_PD_VERSION,
        isGranted: true,
      },
    });

    return !!consent && !consent.revokedAt;
  }

  /**
   * Grant consent for personal data processing
   * @param userId Telegram user ID
   * @param username Telegram username (optional)
   * @returns Created consent entity
   */
  async grantConsent(
    userId: string,
    username?: string,
  ): Promise<UserConsentEntity> {
    const repo = this.em.getRepository(UserConsentEntity);

    // Revoke any existing consent of this type
    await repo.update(
      {
        userId,
        consentType: ConsentType.PERSONAL_DATA,
        isGranted: true,
      },
      {
        isGranted: false,
        revokedAt: new Date(),
      },
    );

    // Create new consent record
    const consent = repo.create({
      userId,
      username,
      consentType: ConsentType.PERSONAL_DATA,
      consentVersion: this.CURRENT_PD_VERSION,
      isGranted: true,
      grantedAt: new Date(),
    });

    const saved = await repo.save(consent);

    this.logger.log(
      `User ${userId} (@${username || 'unknown'}) granted consent v${this.CURRENT_PD_VERSION}`,
    );

    return saved;
  }

  /**
   * Revoke consent for personal data processing
   * @param userId Telegram user ID
   */
  async revokeConsent(userId: string): Promise<void> {
    const repo = this.em.getRepository(UserConsentEntity);

    await repo.update(
      {
        userId,
        consentType: ConsentType.PERSONAL_DATA,
        isGranted: true,
      },
      {
        isGranted: false,
        revokedAt: new Date(),
      },
    );

    this.logger.log(`User ${userId} revoked consent`);
  }

  /**
   * Get current version of personal data consent document
   */
  getCurrentVersion(): string {
    return this.CURRENT_PD_VERSION;
  }
}
