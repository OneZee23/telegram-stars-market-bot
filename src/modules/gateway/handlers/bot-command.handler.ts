import { UserService } from '@modules/user/user.service';
import { Injectable, Logger } from '@nestjs/common';
import { Context } from 'telegraf';
import { CallbackData } from '../constants/callback-data.constants';
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
      [{ text: t.mainMenu.help, callback_data: CallbackData.HELP }],
      [
        {
          text: t.mainMenu.buyStars,
          callback_data: CallbackData.BUY_STARS,
        },
      ],
    ]);

    await this.messageManagementService.sendMessage(
      ctx,
      userContext.userId,
      t.mainMenu.title,
      keyboard,
    );
  }
}
