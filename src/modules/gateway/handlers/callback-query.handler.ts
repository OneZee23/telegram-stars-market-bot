import { StarsPurchaseService } from '@modules/fragment/services/stars-purchase.service';
import { WhitelistService } from '@modules/user/services/whitelist.service';
import { UserService } from '@modules/user/user.service';
import { Injectable, Logger } from '@nestjs/common';
import { Context } from 'telegraf';
import { PricingConfig } from '../config/pricing.config';
import {
  getAmountPricing,
  getTestClaimAmounts,
  isAmountAvailable,
  isTestClaimAmount,
} from '../config/star-amounts.config';
import {
  buildAmountCallback,
  buildPaymentCallback,
  CallbackData,
} from '../constants/callback-data.constants';
import { getTranslations } from '../i18n/translations';
import { MessageManagementService } from '../services/message-management.service';
import { UserState, UserStateService } from '../services/user-state.service';
import {
  isAmountCallback,
  isPaymentConfirmationCallback,
  parseAmountFromCallback,
} from '../utils/callback-data.util';
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
    private readonly pricingConfig: PricingConfig,
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

    // Check if callback is for amount selection (amount_XXX or amount_XXX_test)
    const amount = parseAmountFromCallback(callbackData);
    if (amount !== null && isAmountCallback(callbackData)) {
      await this.handleAmountSelected(
        ctx,
        userContext.userId,
        t,
        userContext,
        amount,
      );
      return;
    }

    // Check if callback is for payment confirmation (confirm_payment_XXX)
    if (isPaymentConfirmationCallback(callbackData)) {
      const paymentAmount = parseAmountFromCallback(callbackData);
      if (paymentAmount !== null) {
        await this.handleConfirmPayment(
          ctx,
          userContext.userId,
          t,
          userContext,
          paymentAmount,
        );
        return;
      }
    }

    switch (callbackData) {
      case CallbackData.HELP:
        await this.handleHelp(ctx, userContext.userId, t);
        break;
      case CallbackData.BUY_STARS:
        await this.handleBuyStars(ctx, userContext.userId, t);
        break;
      case CallbackData.BUY_FOR_MYSELF:
        await this.handleBuyForMyself(ctx, userContext.userId, t, userContext);
        break;
      case CallbackData.BUY_FOR_OTHER:
        if (ctx.callbackQuery && 'answerCallbackQuery' in ctx) {
          await ctx.answerCbQuery(
            t.buyStars.forOtherLocked.replace('🔒 ', ''),
            {
              show_alert: true,
            },
          );
        }
        break;
      case CallbackData.AMOUNT_CUSTOM:
        await this.handleCustomAmount(ctx, userContext.userId, t);
        break;
      case CallbackData.BACK_TO_MAIN:
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
      [{ text: t.mainMenu.back, callback_data: CallbackData.BACK_TO_MAIN }],
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
      [
        {
          text: t.buyStars.forMyself,
          callback_data: CallbackData.BUY_FOR_MYSELF,
        },
      ],
      [
        {
          text: t.buyStars.forOtherLocked,
          callback_data: CallbackData.BUY_FOR_OTHER,
        },
      ],
      [{ text: t.mainMenu.back, callback_data: CallbackData.BACK_TO_MAIN }],
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

    if (isWhitelisted && canClaim) {
      // For whitelisted users: show available test claim amounts
      const testAmounts = getTestClaimAmounts(this.pricingConfig);
      const text = t.buyStars.testModeSelectAmount;

      const buttons = testAmounts.map((config) => {
        const { pricing } = config;
        const priceText = pricing ? ` — ${pricing.priceRub} ₽` : '';
        return [
          {
            text: `${config.amount} ⭐${priceText}`,
            callback_data: buildAmountCallback(config.amount, true),
          },
        ];
      });

      const keyboard = KeyboardBuilder.createInlineKeyboard([
        ...buttons,
        [{ text: t.mainMenu.back, callback_data: CallbackData.BUY_STARS }],
      ]);

      await this.messageManagementService.editMessage(
        ctx,
        userId,
        text,
        keyboard,
      );
    } else if (isWhitelisted && !canClaim) {
      // User already claimed test stars
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

  private async handleAmountSelected(
    ctx: Context,
    userId: string,
    t: ReturnType<typeof getTranslations>,
    userContext: ReturnType<typeof ContextExtractor.extractUserContext>,
    amount: number,
  ): Promise<void> {
    // Check if amount is available
    if (!isAmountAvailable(amount, this.pricingConfig)) {
      const errorText = t.buyStars.only50StarsAvailable;
      await this.messageManagementService.editMessage(ctx, userId, errorText);
      return;
    }

    // Check if user is whitelisted
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

    // For test claim amounts, check if user can claim
    if (isTestClaimAmount(amount, this.pricingConfig)) {
      const canClaim = await this.whitelistService.canClaimTestStars(userId, 1);
      if (!canClaim) {
        const message = t.buyStars.alreadyClaimed
          .replace('{channel}', 'https://t.me/onezee_co')
          .replace('{post}', 'https://t.me/onezee_co/49');
        await this.messageManagementService.editMessage(ctx, userId, message);
        return;
      }
    }

    // Check USDT balance
    const balanceCheck =
      await this.starsPurchaseService.checkUsdtBalanceForPurchase(amount);

    if (!balanceCheck.sufficient) {
      const errorText = t.buyStars.insufficientBalance;
      await this.messageManagementService.editMessage(ctx, userId, errorText);
      return;
    }

    // Get pricing for this amount
    const pricing = getAmountPricing(amount, this.pricingConfig);
    const priceText = pricing
      ? `\n💰 Цена: ${pricing.priceRub} ₽ (${pricing.pricePerStar.toFixed(2)} ₽/⭐)`
      : '';

    // Show payment button (mock YooKassa payment)
    const paymentText =
      t.buyStars.paymentRequired.replace('{amount}', amount.toString()) +
      priceText;
    const keyboard = KeyboardBuilder.createInlineKeyboard([
      [
        {
          text: t.buyStars.payButton,
          callback_data: buildPaymentCallback(amount),
        },
      ],
      [
        {
          text: t.mainMenu.back,
          callback_data: CallbackData.BUY_FOR_MYSELF,
        },
      ],
    ]);

    await this.messageManagementService.editMessage(
      ctx,
      userId,
      paymentText,
      keyboard,
    );
  }

  private async handleConfirmPayment(
    ctx: Context,
    userId: string,
    t: ReturnType<typeof getTranslations>,
    userContext: ReturnType<typeof ContextExtractor.extractUserContext>,
    amount: number,
  ): Promise<void> {
    // Check if amount is available
    if (!isAmountAvailable(amount, this.pricingConfig)) {
      const errorText = t.buyStars.only50StarsAvailable;
      await this.messageManagementService.editMessage(ctx, userId, errorText);
      return;
    }

    // Check if user is whitelisted
    const isWhitelisted = await this.whitelistService.isUserWhitelisted(userId);
    if (!isWhitelisted) {
      const message = t.buyStars.notInWhitelist
        .replace('{userId}', userId)
        .replace('{channel}', 'https://t.me/onezee_co')
        .replace('{post}', 'https://t.me/onezee_co/49');
      await this.messageManagementService.editMessage(ctx, userId, message);
      return;
    }

    // For test claim amounts, check if user can claim
    if (isTestClaimAmount(amount, this.pricingConfig)) {
      const canClaim = await this.whitelistService.canClaimTestStars(userId, 1);
      if (!canClaim) {
        const message = t.buyStars.alreadyClaimed
          .replace('{channel}', 'https://t.me/onezee_co')
          .replace('{post}', 'https://t.me/onezee_co/49');
        await this.messageManagementService.editMessage(ctx, userId, message);
        return;
      }
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

    // Show processing message with timeout info
    const processingText = t.buyStars.purchaseProcessing;
    await this.messageManagementService.editMessage(
      ctx,
      userId,
      processingText,
    );

    // Purchase stars
    this.logger.log(
      `User ${userId} (@${username}) confirmed payment for ${amount} stars`,
    );

    const result = isTestClaimAmount(amount, this.pricingConfig)
      ? await this.starsPurchaseService.purchaseTestStars(userId, username)
      : await this.starsPurchaseService.purchaseStars(userId, username, amount);

    if (!result.success) {
      const errorText =
        result.error === 'QUEUE_BUSY'
          ? t.buyStars.queueBusy
          : t.buyStars.purchaseError.replace(
              '{error}',
              result.error || 'Unknown error',
            );
      await this.messageManagementService.editMessage(ctx, userId, errorText);
      return;
    }

    // Success message with instructions
    const successText = t.buyStars.testPurchaseSuccess
      .replace('{channel}', 'https://t.me/onezee_co')
      .replace('{post}', 'https://t.me/onezee_co/49');

    await this.messageManagementService.editMessage(ctx, userId, successText);
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
      [{ text: t.mainMenu.help, callback_data: CallbackData.HELP }],
      [
        {
          text: t.mainMenu.buyStars,
          callback_data: CallbackData.BUY_STARS,
        },
      ],
    ]);

    await this.messageManagementService.editMessage(
      ctx,
      userId,
      t.mainMenu.title,
      keyboard,
    );
  }
}
