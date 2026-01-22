import { StarsPurchaseService } from '@modules/fragment/services/stars-purchase.service';
import { WhitelistService } from '@modules/user/services/whitelist.service';
import { UserService } from '@modules/user/user.service';
import { YooKassaService } from '@modules/yookassa/services/yookassa.service';
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
import { formatPriceForButton } from '../utils/price-formatter.util';

@Injectable()
export class CallbackQueryHandler {
  private readonly logger = new Logger(CallbackQueryHandler.name);

  constructor(
    private readonly messageManagementService: MessageManagementService,
    private readonly userStateService: UserStateService,
    private readonly whitelistService: WhitelistService,
    private readonly starsPurchaseService: StarsPurchaseService,
    private readonly yooKassaService: YooKassaService,
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

      // Улучшенный приветливый текст инструкции
      const text = t.buyStars.selectAmount;

      // Формируем кнопки с ценой в формате как на скриншоте: "100 ⭐ (179,00 RUB)"
      const buttonRows: Array<Array<{ text: string; callback_data: string }>> =
        [];

      // Размещаем кнопки в 2 колонки
      for (let i = 0; i < testAmounts.length; i += 2) {
        const row: Array<{ text: string; callback_data: string }> = [];

        // Первая кнопка в ряду
        const config1 = testAmounts[i];
        if (config1) {
          const priceText = config1.pricing
            ? formatPriceForButton(config1.pricing.priceRub)
            : '';
          const buttonText = priceText
            ? `${config1.amount} ⭐ (${priceText})`
            : `${config1.amount} ⭐`;
          row.push({
            text: buttonText,
            callback_data: buildAmountCallback(config1.amount, true),
          });
        }

        // Вторая кнопка в ряду (если есть)
        const config2 = testAmounts[i + 1];
        if (config2) {
          const priceText = config2.pricing
            ? formatPriceForButton(config2.pricing.priceRub)
            : '';
          const buttonText = priceText
            ? `${config2.amount} ⭐ (${priceText})`
            : `${config2.amount} ⭐`;
          row.push({
            text: buttonText,
            callback_data: buildAmountCallback(config2.amount, true),
          });
        }

        if (row.length > 0) {
          buttonRows.push(row);
        }
      }

      const keyboard = KeyboardBuilder.createInlineKeyboard([
        ...buttonRows,
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

    // Check if user has email, if not - request it
    const user = await this.userService.getOrCreateUser(userId);
    if (!user.email) {
      // Request email
      this.userStateService.setState(userId, UserState.ENTERING_EMAIL, amount);
      const emailText = t.buyStars.emailRequired;
      const keyboard = KeyboardBuilder.createInlineKeyboard([
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
        emailText,
        keyboard,
      );
      return;
    }

    // User has email, proceed to payment confirmation
    await this.proceedToPayment(
      ctx,
      userId,
      t,
      userContext,
      amount,
      user.email,
    );
  }

  async proceedToPaymentAfterEmail(
    ctx: Context,
    userId: string,
    amount: number,
    email: string,
  ): Promise<void> {
    const userContext = await ContextExtractor.getUserContext(
      ctx,
      this.userService,
    );
    if (!userContext) return;

    const t = getTranslations(userContext.language);
    await this.proceedToPayment(ctx, userId, t, userContext, amount, email);
  }

  private async proceedToPayment(
    ctx: Context,
    userId: string,
    t: ReturnType<typeof getTranslations>,
    userContext: ReturnType<typeof ContextExtractor.extractUserContext>,
    amount: number,
    email: string,
  ): Promise<void> {
    // Get pricing for this amount
    const pricing = getAmountPricing(amount, this.pricingConfig);

    // Форматируем цену красиво
    const formattedPrice = pricing
      ? formatPriceForButton(pricing.priceRub)
      : '';

    // Show payment button - сразу создаем платеж и показываем ссылку
    const paymentText = `✨ Вы выбрали ${amount} ⭐\n\n${
      formattedPrice ? `💰 Сумма к оплате: ${formattedPrice}\n\n` : ''
    }Создаю платеж...`;

    await this.messageManagementService.editMessage(ctx, userId, paymentText);

    // Create payment immediately
    await this.handleConfirmPaymentWithEmail(
      ctx,
      userId,
      t,
      userContext,
      amount,
      email,
    );
  }

  private async handleConfirmPaymentWithEmail(
    ctx: Context,
    userId: string,
    t: ReturnType<typeof getTranslations>,
    userContext: ReturnType<typeof ContextExtractor.extractUserContext>,
    amount: number,
    email: string,
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

    // Get pricing for this amount
    const pricing = getAmountPricing(amount, this.pricingConfig);
    if (!pricing) {
      const errorText = t.buyStars.purchaseError.replace(
        '{error}',
        'Invalid amount',
      );
      await this.messageManagementService.editMessage(ctx, userId, errorText);
      return;
    }

    // Create payment in YooKassa (both test and regular purchases go through YooKassa)
    const isTestPurchase = isTestClaimAmount(amount, this.pricingConfig);

    this.logger.log(
      `User ${userId} (@${username}) creating ${isTestPurchase ? 'test' : 'regular'} payment for ${amount} stars, ${pricing.priceRub} RUB`,
    );

    // Create YooKassa payment with email
    const paymentResult = await this.yooKassaService.createPayment({
      userId,
      recipientUsername: username,
      starsAmount: amount,
      priceRub: pricing.priceRub,
      returnUrl: 'https://t.me/onezee_co',
      isTestPurchase,
      email,
    });

    if (!paymentResult.success || !paymentResult.confirmationUrl) {
      const errorText = t.buyStars.purchaseError.replace(
        '{error}',
        paymentResult.error || 'Failed to create payment',
      );
      await this.messageManagementService.editMessage(ctx, userId, errorText);
      return;
    }

    // Show payment link - сразу открываем ссылку или показываем кнопку
    const paymentText = t.buyStars.paymentCreated
      .replace('{amount}', amount.toString())
      .replace('{price}', formatPriceForButton(pricing.priceRub));

    const keyboard = KeyboardBuilder.createInlineKeyboard([
      [
        {
          text: '💳 Перейти к оплате',
          url: paymentResult.confirmationUrl,
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

    // Get user email from database
    const user = await this.userService.getOrCreateUser(userId);
    if (!user.email) {
      // Should not happen, but handle gracefully
      const errorText = t.buyStars.purchaseError.replace(
        '{error}',
        'Email not found. Please restart the purchase flow.',
      );
      await this.messageManagementService.editMessage(ctx, userId, errorText);
      return;
    }

    // Delegate to handleConfirmPaymentWithEmail
    await this.handleConfirmPaymentWithEmail(
      ctx,
      userId,
      t,
      userContext,
      amount,
      user.email,
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
      [
        {
          text: t.mainMenu.buyStars,
          callback_data: CallbackData.BUY_STARS,
        },
      ],
      [{ text: t.mainMenu.help, callback_data: CallbackData.HELP }],
    ]);

    await this.messageManagementService.editMessage(
      ctx,
      userId,
      t.mainMenu.title,
      keyboard,
    );
  }
}
