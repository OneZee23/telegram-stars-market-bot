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
    if (!cachedUser) {
      // Проверяем БД на случай если пользователь существует но не в кеше
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
      // Обновляем метаданные если нужно
      if (metadataToUpdate) {
        let needToUpdate = false;
        if (user.language !== metadataToUpdate.language) {
          user.language = metadataToUpdate.language;
          needToUpdate = true;
        }
        if (user.username !== metadataToUpdate.username) {
          user.username = metadataToUpdate.username;
          needToUpdate = true;
        }
        if (needToUpdate) {
          await em.save(user);
          this.userCache.set(userId, user);
        }
      }
      return user;
    }

    if (metadataToUpdate) {
      let needToUpdate = false;
      if (cachedUser.language !== metadataToUpdate.language) {
        cachedUser.language = metadataToUpdate.language;
        needToUpdate = true;
      }
      if (cachedUser.username !== metadataToUpdate.username) {
        cachedUser.username = metadataToUpdate.username;
        needToUpdate = true;
      }

      if (needToUpdate) {
        this.userCache.set(userId, cachedUser);
        await em.save(cachedUser);
      }
    }

    return cachedUser;
  }
}
