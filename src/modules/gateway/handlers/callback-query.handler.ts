import { ADMIN_USER_ID } from '@common/constants';
import { StarsPurchaseService } from '@modules/fragment/services/stars-purchase.service';
import { WhitelistService } from '@modules/user/services/whitelist.service';
import { UserService } from '@modules/user/user.service';
import { Injectable, Logger } from '@nestjs/common';
import { Context } from 'telegraf';
import { getTranslations } from '../i18n/translations';
import { MessageManagementService } from '../services/message-management.service';
import { UserState, UserStateService } from '../services/user-state.service';
import { ContextExtractor } from '../utils/context-extractor.util';
import { KeyboardBuilder } from '../utils/keyboard-builder.util';

@Injectable()
export class CallbackQueryHandler {
  private readonly logger = new Logger(CallbackQueryHandler.name);

  constructor(
    private readonly messageManagementService: MessageManagementService,
    private readonly userStateService: UserStateService,
    private readonly whitelistService: WhitelistService,
    private readonly starsPurchaseService: StarsPurchaseService,
    private readonly userService: UserService,
  ) {}

  async handleCallbackQuery(ctx: Context, callbackData: string): Promise<void> {
    const userContext = await ContextExtractor.getUserContext(
      ctx,
      this.userService,
    );
    if (!userContext) return;

    this.logger.log(
      `User ${userContext.userId} (@${userContext.username || 'unknown'}) clicked: ${callbackData}`,
    );

    const t = getTranslations(userContext.language);

    if (ctx.callbackQuery && 'answerCallbackQuery' in ctx) {
      await ctx.answerCbQuery();
    }

    switch (callbackData) {
      case 'help':
        await this.handleHelp(ctx, userContext.userId, t);
        break;
      case 'buy_stars':
        await this.handleBuyStars(ctx, userContext.userId, t);
        break;
      case 'buy_for_myself':
        await this.handleBuyForMyself(ctx, userContext.userId, t, userContext);
        break;
      case 'buy_for_other':
        if (ctx.callbackQuery && 'answerCallbackQuery' in ctx) {
          await ctx.answerCbQuery(
            t.buyStars.forOtherLocked.replace('🔒 ', ''),
            {
              show_alert: true,
            },
          );
        }
        break;
      case 'amount_50_test':
        await this.handleTestPurchase(ctx, userContext.userId, t, userContext);
        break;
      case 'amount_500':
      case 'amount_1000':
      case 'amount_2000':
      case 'amount_3000':
      case 'amount_5000':
        await this.handleAmountSelected(
          ctx,
          userContext.userId,
          t,
          callbackData,
        );
        break;
      case 'amount_custom':
        await this.handleCustomAmount(ctx, userContext.userId, t);
        break;
      case 'back_to_main':
        await this.handleBackToMain(ctx, userContext.userId, t);
        break;
      default:
        break;
    }
  }

  private async handleHelp(
    ctx: Context,
    userId: string,
    t: ReturnType<typeof getTranslations>,
  ): Promise<void> {
    const channelLink = 'https://t.me/onezee_co';
    const text = `${t.help.title}\n\n${t.help.description}\n\n${channelLink}`;

    const keyboard = KeyboardBuilder.createInlineKeyboard([
      [{ text: t.mainMenu.back, callback_data: 'back_to_main' }],
    ]);

    await this.messageManagementService.editMessage(
      ctx,
      userId,
      text,
      keyboard,
    );
  }

  private async handleBuyStars(
    ctx: Context,
    userId: string,
    t: ReturnType<typeof getTranslations>,
  ): Promise<void> {
    const text = t.buyStars.selectRecipient;

    const keyboard = KeyboardBuilder.createInlineKeyboard([
      [{ text: t.buyStars.forMyself, callback_data: 'buy_for_myself' }],
      [{ text: t.buyStars.forOtherLocked, callback_data: 'buy_for_other' }],
      [{ text: t.mainMenu.back, callback_data: 'back_to_main' }],
    ]);

    await this.messageManagementService.editMessage(
      ctx,
      userId,
      text,
      keyboard,
    );
  }

  private async handleBuyForMyself(
    ctx: Context,
    userId: string,
    t: ReturnType<typeof getTranslations>,
    userContext: ReturnType<typeof ContextExtractor.extractUserContext>,
  ): Promise<void> {
    let username = ctx.from?.username;

    if (!username && ctx.chat) {
      try {
        const chat = await ctx.telegram.getChat(ctx.chat.id);
        if ('username' in chat && chat.username) {
          username = chat.username;
        }
      } catch {
        username = userContext?.username;
      }
    }

    if (!username) {
      const errorText = t.errors.usernameRequired;
      await this.messageManagementService.editMessage(ctx, userId, errorText);
      return;
    }

    // Check if user is whitelisted for test purchases
    const isWhitelisted = await this.whitelistService.isUserWhitelisted(userId);
    const canClaim = await this.whitelistService.canClaimTestStars(userId, 1);

    // Admin can always claim, regardless of previous claims
    const isAdmin = userId === ADMIN_USER_ID;

    if (isWhitelisted && (canClaim || isAdmin)) {
      // For whitelisted users (or admin): show only 50 stars button
      const text = t.buyStars.testModeSelectAmount;

      const keyboard = KeyboardBuilder.createInlineKeyboard([
        [{ text: '50 ⭐', callback_data: 'amount_50_test' }],
        [{ text: t.mainMenu.back, callback_data: 'buy_stars' }],
      ]);

      await this.messageManagementService.editMessage(
        ctx,
        userId,
        text,
        keyboard,
      );
    } else if (isWhitelisted && !canClaim && !isAdmin) {
      // User already claimed test stars (but not admin)
      const message = t.buyStars.alreadyClaimed
        .replace('{channel}', 'https://t.me/onezee_co')
        .replace('{post}', 'https://t.me/onezee_co/49');
      await this.messageManagementService.editMessage(ctx, userId, message);
    } else {
      // For non-whitelisted users: show message about whitelist
      const message = t.buyStars.notInWhitelist
        .replace('{userId}', userId)
        .replace('{channel}', 'https://t.me/onezee_co')
        .replace('{post}', 'https://t.me/onezee_co/49');
      await this.messageManagementService.editMessage(ctx, userId, message);
    }
  }

  private async handleTestPurchase(
    ctx: Context,
    userId: string,
    t: ReturnType<typeof getTranslations>,
    userContext: ReturnType<typeof ContextExtractor.extractUserContext>,
  ): Promise<void> {
    const isWhitelisted = await this.whitelistService.isUserWhitelisted(userId);
    if (!isWhitelisted) {
      const message = t.buyStars.notInWhitelist
        .replace('{userId}', userId)
        .replace('{channel}', 'https://t.me/onezee_co')
        .replace('{post}', 'https://t.me/onezee_co/49');
      await this.messageManagementService.editMessage(ctx, userId, message);
      return;
    }

    let username = ctx.from?.username;

    if (!username && ctx.chat) {
      try {
        const chat = await ctx.telegram.getChat(ctx.chat.id);
        if ('username' in chat && chat.username) {
          username = chat.username;
        }
      } catch {
        username = userContext?.username;
      }
    }

    if (!username) {
      const errorText = t.errors.usernameRequired;
      await this.messageManagementService.editMessage(ctx, userId, errorText);
      return;
    }

    await this.messageManagementService.editMessage(
      ctx,
      userId,
      t.buyStars.checkingBalance,
    );

    const balanceCheck =
      await this.starsPurchaseService.checkBalanceBeforePurchase(50);
    if (!balanceCheck.canPurchase) {
      const errorText =
        balanceCheck.error === 'insufficient_balance'
          ? t.buyStars.insufficientBalance
          : t.buyStars.balanceCheckFailed;
      await this.messageManagementService.editMessage(ctx, userId, errorText);
      return;
    }

    await this.messageManagementService.editMessage(
      ctx,
      userId,
      t.buyStars.processing,
    );

    this.logger.log(
      `User ${userId} (@${username}) initiated test purchase of 50 stars`,
    );
    const result = await this.starsPurchaseService.purchaseTestStars(
      userId,
      username,
    );

    if (result.success) {
      const successText = t.buyStars.testPurchaseSuccess
        .replace('{channel}', 'https://t.me/onezee_co')
        .replace('{post}', 'https://t.me/onezee_co/49');

      await this.messageManagementService.editMessage(ctx, userId, successText);
    } else {
      let errorText: string;
      if (result.error === 'QUEUE_BUSY') {
        errorText = t.buyStars.queueBusy;
      } else if (
        result.error === 'insufficient_funds' ||
        result.error === 'swap_failed_insufficient_ton'
      ) {
        errorText = t.buyStars.purchaseFailedInsufficientFunds;
      } else if (result.error === 'confirmation_failed') {
        errorText = t.buyStars.purchaseFailedConfirmation;
      } else if (result.error === 'transaction_not_sent') {
        errorText = t.buyStars.purchaseFailedTransactionNotSent;
      } else {
        errorText = t.buyStars.purchaseError.replace(
          '{error}',
          result.error || 'Unknown error',
        );
      }
      await this.messageManagementService.editMessage(ctx, userId, errorText);
    }
  }

  private async handleAmountSelected(
    ctx: Context,
    userId: string,
    t: ReturnType<typeof getTranslations>,
    callbackData: string,
  ): Promise<void> {
    const isWhitelisted = await this.whitelistService.isUserWhitelisted(userId);
    if (!isWhitelisted) {
      const message = t.buyStars.notInWhitelist
        .replace('{userId}', userId)
        .replace('{channel}', 'https://t.me/onezee_co')
        .replace('{post}', 'https://t.me/onezee_co/49');
      await this.messageManagementService.editMessage(ctx, userId, message);
      return;
    }

    // Whitelist users can only purchase 50 stars
    this.logger.warn(
      `Whitelist user ${userId} attempted to select amount: ${callbackData}`,
    );
    await this.messageManagementService.editMessage(
      ctx,
      userId,
      t.buyStars.only50StarsAvailable,
    );
  }

  private async handleCustomAmount(
    ctx: Context,
    userId: string,
    t: ReturnType<typeof getTranslations>,
  ): Promise<void> {
    const isWhitelisted = await this.whitelistService.isUserWhitelisted(userId);
    if (isWhitelisted) {
      await this.messageManagementService.editMessage(
        ctx,
        userId,
        t.buyStars.only50StarsAvailable,
      );
      return;
    }

    this.userStateService.setState(userId, UserState.ENTERING_CUSTOM_AMOUNT);
    const text = t.buyStars.enterAmountPrompt;

    await this.messageManagementService.editMessage(ctx, userId, text);
  }

  private async handleBackToMain(
    ctx: Context,
    userId: string,
    t: ReturnType<typeof getTranslations>,
  ): Promise<void> {
    const keyboard = KeyboardBuilder.createInlineKeyboard([
      [{ text: t.mainMenu.help, callback_data: 'help' }],
      [{ text: t.mainMenu.buyStars, callback_data: 'buy_stars' }],
    ]);

    await this.messageManagementService.editMessage(
      ctx,
      userId,
      t.mainMenu.title,
      keyboard,
    );
  }
}
