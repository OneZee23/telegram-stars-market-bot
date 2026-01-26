import { UserEntity } from '@modules/user/entities/user.entity';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { UserMetadata } from './dto';

@Injectable()
export class UserService implements OnModuleInit {
  private readonly logger = new Logger(this.constructor.name);

  private readonly userCache = new Map<string, UserEntity>();

  constructor(
    @InjectEntityManager()
    private readonly db: EntityManager,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.loadAllUsers();
  }

  private async loadAllUsers(): Promise<void> {
    const userRepo = this.db.getRepository(UserEntity);
    const users = await userRepo.find();

    for (const user of users) {
      this.userCache.set(user.userId, user);
    }

    this.logger.log(`Loaded ${users.length} users into cache`);
  }

  public getUserFromCache(userId: string): UserEntity | undefined {
    return this.userCache.get(userId);
  }

  public async getOrCreateUser(
    userId: string,
    metadataToUpdate?: UserMetadata,
    transaction?: EntityManager,
  ): Promise<UserEntity> {
    const em = transaction ?? this.db;
    const userRepo = em.getRepository(UserEntity);

    const cachedUser = this.getUserFromCache(userId);
    if (cachedUser) {
      await this.updateMetadataIfNeeded(cachedUser, metadataToUpdate, em);
      await this.updateInteractionTime(cachedUser, em);
      return cachedUser;
    }

    let user = await userRepo.findOneBy({ userId });
    if (!user) {
      user = new UserEntity({
        userId,
        language: metadataToUpdate?.language,
        username: metadataToUpdate?.username,
      });
      await em.save(user);
    }

    this.userCache.set(userId, user);
    await this.updateMetadataIfNeeded(user, metadataToUpdate, em);
    await this.updateInteractionTime(user, em);
    return user;
  }

  public async markUserAsBlocked(
    userId: string,
    transaction?: EntityManager,
  ): Promise<void> {
    const em = transaction ?? this.db;
    const userRepo = em.getRepository(UserEntity);

    const user = await userRepo.findOneBy({ userId });
    if (!user) return;

    if (!user.isBlockedByUser) {
      user.isBlockedByUser = true;
      await em.save(user);
      this.userCache.set(userId, user);
    }
  }

  private async updateInteractionTime(
    user: UserEntity,
    em: EntityManager,
  ): Promise<void> {
    const now = new Date();
    const wasBlocked = user.isBlockedByUser;

    // Always update lastInteractionAt on interaction
    // If user was blocked, reset the flag (user unblocked the bot)
    // eslint-disable-next-line no-param-reassign
    if (wasBlocked) {
      // eslint-disable-next-line no-param-reassign
      user.isBlockedByUser = false;
    }
    // eslint-disable-next-line no-param-reassign
    user.lastInteractionAt = now;
    await em.save(user);
    this.userCache.set(user.userId, user);
  }

  private async updateMetadataIfNeeded(
    user: UserEntity,
    metadataToUpdate: UserMetadata | undefined,
    em: EntityManager,
  ): Promise<void> {
    if (!metadataToUpdate) return;

    const shouldUpdateLanguage =
      metadataToUpdate.language && user.language !== metadataToUpdate.language;
    const shouldUpdateUsername =
      metadataToUpdate.username !== undefined &&
      user.username !== metadataToUpdate.username;
    const shouldUpdateEmail =
      metadataToUpdate.email !== undefined &&
      user.email !== metadataToUpdate.email;

    if (!shouldUpdateLanguage && !shouldUpdateUsername && !shouldUpdateEmail)
      return;

    // eslint-disable-next-line no-param-reassign
    if (shouldUpdateLanguage) user.language = metadataToUpdate.language;
    // eslint-disable-next-line no-param-reassign
    if (shouldUpdateUsername) user.username = metadataToUpdate.username;
    // eslint-disable-next-line no-param-reassign
    if (shouldUpdateEmail) user.email = metadataToUpdate.email;

    await em.save(user);
    this.userCache.set(user.userId, user);
  }
}
