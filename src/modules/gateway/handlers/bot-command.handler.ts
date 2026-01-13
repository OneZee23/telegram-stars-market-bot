import { UserService } from '@modules/user/user.service';
import { WhitelistService } from '@modules/user/services/whitelist.service';
import { Injectable, Logger } from '@nestjs/common';
import { Context } from 'telegraf';
import { getTranslations } from '../i18n/translations';
import { MessageManagementService } from '../services/message-management.service';
import { ContextExtractor } from '../utils/context-extractor.util';
import { KeyboardBuilder } from '../utils/keyboard-builder.util';

@Injectable()
export class BotCommandHandler {
  private readonly logger = new Logger(BotCommandHandler.name);

  constructor(
    private readonly messageManagementService: MessageManagementService,
    private readonly userService: UserService,
    private readonly whitelistService: WhitelistService,
  ) {}

  async handleStart(ctx: Context): Promise<void> {
    const userContext = await ContextExtractor.getUserContext(
      ctx,
      this.userService,
    );
    if (!userContext) return;

    this.logger.log(
      `User ${userContext.userId} (@${userContext.username || 'unknown'}) sent /start command`,
    );

    const t = getTranslations(userContext.language);

    const keyboard = KeyboardBuilder.createInlineKeyboard([
      [{ text: t.mainMenu.help, callback_data: 'help' }],
      [{ text: t.mainMenu.buyStars, callback_data: 'buy_stars' }],
    ]);

    await this.messageManagementService.sendMessage(
      ctx,
      userContext.userId,
      t.mainMenu.title,
      keyboard,
    );
  }

  async handleGetChannelId(ctx: Context): Promise<void> {
    const userContext = await ContextExtractor.getUserContext(
      ctx,
      this.userService,
    );
    if (!userContext) return;

    const isWhitelisted = await this.whitelistService.isUserWhitelisted(
      userContext.userId,
    );
    if (!isWhitelisted) {
      await ctx.reply('❌ Доступ запрещен. Эта команда доступна только для пользователей из whitelist.');
      this.logger.warn(
        `User ${userContext.userId} tried to use /get_channel_id but is not whitelisted`,
      );
      return;
    }

    try {
      const text = 'text' in ctx.message ? ctx.message.text : '';
      const args = text?.split(' ').slice(1);
      const channelUsername = args?.[0]?.replace('@', '') || 'fraggram_alerts';

      const chat = await ctx.telegram.getChat(`@${channelUsername}`);
      const chatId = chat.id.toString();

      await ctx.reply(
        `📢 Channel ID для @${channelUsername}:\n\n` +
        `\`${chatId}\`\n\n` +
        `Используй это значение для TELEGRAM_MONITORING_CHANNEL_ID`,
        { parse_mode: 'Markdown' },
      );

      this.logger.log(`Channel ID для @${channelUsername}: ${chatId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await ctx.reply(
        `❌ Ошибка получения ID канала:\n${errorMessage}\n\n` +
        `Попробуй: /get_channel_id @fraggram_alerts`,
      );
      this.logger.error(`Failed to get channel ID: ${errorMessage}`);
    }
  }
}
