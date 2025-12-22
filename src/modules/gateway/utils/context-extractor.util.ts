import { UserService } from '@modules/user/user.service';
import { Context } from 'telegraf';
import { CallbackQuery, Message } from 'telegraf/types';

export interface UserContext {
  userId: string;
  language: string;
  username?: string;
}

export class ContextExtractor {
  static extractUserContext(ctx: Context): UserContext | null {
    if (ctx.from) {
      return {
        userId: ctx.from.id.toString(),
        language: ctx.from.language_code || 'en',
        username: ctx.from.username || undefined,
      };
    }

    const callbackQuery = ctx.callbackQuery as CallbackQuery;
    if (callbackQuery && 'from' in callbackQuery) {
      return {
        userId: callbackQuery.from.id.toString(),
        language: callbackQuery.from.language_code || 'en',
        username: callbackQuery.from.username || undefined,
      };
    }

    const message = ctx.message as Message;
    if (!message?.from) return null;

    return {
      userId: message.from.id.toString(),
      language: message.from.language_code || 'en',
      username: message.from.username || undefined,
    };
  }

  static async getUserContext(
    ctx: Context,
    userService: UserService,
  ): Promise<UserContext | null> {
    const userContext = this.extractUserContext(ctx);
    if (!userContext) return null;

    await userService.getOrCreateUser(userContext.userId, {
      language: userContext.language,
      username: userContext.username,
    });

    return userContext;
  }

  static extractText(ctx: Context): string {
    const message = ctx.message as Message;
    return 'text' in message ? message.text || '' : '';
  }
}
