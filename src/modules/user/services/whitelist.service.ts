import { ADMIN_USER_ID } from '@common/constants/admin.constants';
import { UserEntity } from '@modules/user/entities/user.entity';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { EntityManager, In } from 'typeorm';

/**
 * Service for managing whitelist from assets/whitelist.txt file
 *
 * Workflow:
 * 1. User adds their userId to whitelist.txt via PR
 * 2. PR is merged, server deploys and restarts
 * 3. On module init, syncWhitelistFromFile() is called
 * 4. Service reads whitelist.txt and updates database:
 *    - If user exists in DB: sets inWhiteList = true
 *    - If user doesn't exist in DB: creates new user record with inWhiteList = true
 *      (user is created "manually" from whitelist, not initialized through bot interaction)
 *      Username and language will be set when user first interacts with the bot
 */
@Injectable()
export class WhitelistService implements OnModuleInit {
  private readonly logger = new Logger(WhitelistService.name);

  private readonly whitelistFilePath = path.join(
    process.cwd(),
    'assets',
    'whitelist.txt',
  );

  constructor(
    @InjectEntityManager()
    private readonly db: EntityManager,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.syncWhitelistFromFile();
  }

  /**
   * Loads user IDs from whitelist.txt and updates database
   * Sets inWhiteList = true for users found in the file
   */
  async syncWhitelistFromFile(): Promise<void> {
    try {
      const userIds = await this.loadWhitelistFromFile();

      const isEmpty = userIds.length === 0;
      if (isEmpty) {
        this.logger.log('Whitelist file is empty or does not exist');
        return;
      }

      this.logger.log(`Found ${userIds.length} user IDs in whitelist file`);

      const userRepo = this.db.getRepository(UserEntity);

      // Load all existing users in one query
      const existingUsers = await userRepo.findBy({
        userId: In(userIds),
      });

      // Process users in parallel
      const processUser = async (
        userId: string,
      ): Promise<
        { type: 'skipped' } | { type: 'updated' } | { type: 'created' }
      > => {
        const existingUser = existingUsers.find((u) => u.userId === userId);
        const isAlreadyWhitelisted = existingUser?.inWhiteList === true;

        const skip = (): Promise<{ type: 'skipped' }> =>
          Promise.resolve({ type: 'skipped' as const });
        const update = (): Promise<{ type: 'updated' }> =>
          userRepo.save({ ...existingUser, inWhiteList: true }).then(() => {
            this.logger.debug(
              `Updated user ${userId}: added to whitelist (user already existed in DB)`,
            );
            return { type: 'updated' as const };
          });
        const create = (): Promise<{ type: 'created' }> =>
          userRepo
            .save(
              new UserEntity({
                userId,
                inWhiteList: true,
                // User created manually from whitelist.txt (not initialized through bot interaction)
                // Username and language will be set when user first interacts with the bot
              }),
            )
            .then(() => {
              this.logger.log(
                `Created user ${userId} from whitelist (user was not in DB, created manually)`,
              );
              // Note: UserService cache will be updated when user first interacts with bot
              // via getOrCreateUser() which checks DB if user is not in cache
              return { type: 'created' as const };
            });

        const handlers = [
          { condition: isAlreadyWhitelisted, action: skip },
          { condition: !!existingUser, action: update },
          { condition: true, action: create },
        ];

        const handler = handlers.find((h) => h.condition);
        return handler.action();
      };

      const results = await Promise.all(userIds.map(processUser));

      const stats = results.reduce(
        (acc, result) => {
          acc[result.type] = (acc[result.type] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      );

      this.logger.log(
        `Whitelist sync completed: ${stats.updated || 0} updated, ${stats.created || 0} created, ${stats.skipped || 0} skipped`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to sync whitelist from file: ${errorMessage}`);
    }
  }

  /**
   * Loads user IDs from whitelist.txt file
   * Filters out comments and empty lines
   */
  private async loadWhitelistFromFile(): Promise<string[]> {
    const fileExists = fs.existsSync(this.whitelistFilePath);
    if (!fileExists) {
      this.logger.warn(`Whitelist file not found at ${this.whitelistFilePath}`);
      return [];
    }

    const content = fs.readFileSync(this.whitelistFilePath, 'utf-8');

    const lines = content
      .split('\n')
      .map((line) => line.trim())
      .filter((trimmed) => trimmed && !trimmed.startsWith('#'));

    const userIds = lines
      .map((trimmed) => {
        const userId = trimmed.split(/\s+/)[0];
        const isValid = userId && /^\d+$/.test(userId);
        return isValid ? userId : null;
      })
      .filter((userId): userId is string => userId !== null);

    const invalidLines = lines.filter(
      (trimmed) => !/^\d+/.test(trimmed.split(/\s+/)[0] || ''),
    );
    invalidLines.forEach((line) =>
      this.logger.warn(`Invalid user ID format in whitelist: ${line}`),
    );

    return userIds;
  }

  /**
   * Checks if user is in whitelist
   */
  async isUserWhitelisted(userId: string): Promise<boolean> {
    const userRepo = this.db.getRepository(UserEntity);
    const user = await userRepo.findOneBy({ userId });
    return user?.inWhiteList === true;
  }

  /**
   * Checks if user can claim test stars (whitelisted and hasn't exceeded limit)
   * Admin can always claim regardless of limit
   */
  async canClaimTestStars(
    userId: string,
    maxTestClaims: number = 1,
  ): Promise<boolean> {
    // Admin can always claim
    if (userId === ADMIN_USER_ID) {
      return true;
    }

    const userRepo = this.db.getRepository(UserEntity);
    const user = await userRepo.findOneBy({ userId });

    return user?.inWhiteList === true && user.testClaims < maxTestClaims;
  }

  /**
   * Increments test claims counter for user
   */
  async incrementTestClaims(userId: string): Promise<void> {
    const userRepo = this.db.getRepository(UserEntity);
    const user = await userRepo.findOneBy({ userId });

    const targetUser =
      user ??
      (() => {
        throw new Error(`User not found: ${userId}`);
      })();

    targetUser.testClaims += 1;
    await userRepo.save(targetUser);
  }
}
