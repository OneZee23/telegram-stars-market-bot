import { Injectable } from '@nestjs/common';
import { Context } from 'telegraf';
import { getTranslations } from '../i18n/translations';
import { MessageManagementService } from '../services/message-management.service';
import { ContextExtractor } from '../utils/context-extractor.util';
import { KeyboardBuilder } from '../utils/keyboard-builder.util';

@Injectable()
export class BotCommandHandler {
  constructor(
    private readonly messageManagementService: MessageManagementService,
  ) {}

  async handleStart(ctx: Context): Promise<void> {
    const userContext = ContextExtractor.extractUserContext(ctx);
    if (!userContext) return;

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
}
