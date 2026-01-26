import { ConsentService } from '@modules/user/services/consent.service';
import { UserService } from '@modules/user/user.service';
import { Injectable, Logger } from '@nestjs/common';
import { Context } from 'telegraf';
import { CallbackData } from '../constants/callback-data.constants';
import { LEGAL_INFO } from '../constants/legal.constants';
import { getTranslations, Translations } from '../i18n/translations';
import { MessageManagementService } from '../services/message-management.service';
import { ContextExtractor } from '../utils/context-extractor.util';
import { KeyboardBuilder } from '../utils/keyboard-builder.util';

@Injectable()
export class BotCommandHandler {
  private readonly logger = new Logger(BotCommandHandler.name);

  constructor(
    private readonly messageManagementService: MessageManagementService,
    private readonly userService: UserService,
    private readonly consentService: ConsentService,
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

    // Check if user has valid consent
    const hasConsent = await this.consentService.hasValidConsent(
      userContext.userId,
    );

    if (!hasConsent) {
      // Show consent screen
      await this.showConsentScreen(ctx, userContext.userId, t);
      return;
    }

    // User has consent - show main menu
    await this.showMainMenu(ctx, userContext.userId, t);
  }

  /**
   * Show main menu with buy stars and help buttons
   */
  async showMainMenu(
    ctx: Context,
    userId: string,
    t: Translations,
  ): Promise<void> {
    const keyboard = KeyboardBuilder.createInlineKeyboard([
      [
        {
          text: t.mainMenu.buyStars,
          callback_data: CallbackData.BUY_STARS,
        },
      ],
      [{ text: t.mainMenu.help, callback_data: CallbackData.HELP }],
    ]);

    await this.messageManagementService.sendMessage(
      ctx,
      userId,
      t.mainMenu.title,
      keyboard,
    );
  }

  /**
   * Show consent request screen for personal data processing
   */
  async showConsentScreen(
    ctx: Context,
    userId: string,
    t: Translations,
  ): Promise<void> {
    const keyboard = KeyboardBuilder.createInlineKeyboard([
      [
        {
          text: t.consent.readMore,
          url: LEGAL_INFO.PRIVACY_URL,
        },
      ],
      [
        {
          text: t.consent.accept,
          callback_data: CallbackData.CONSENT_GRANT,
        },
      ],
    ]);

    await this.messageManagementService.sendMessage(
      ctx,
      userId,
      t.consent.request,
      keyboard,
      { parse_mode: 'Markdown' },
    );
  }
}
