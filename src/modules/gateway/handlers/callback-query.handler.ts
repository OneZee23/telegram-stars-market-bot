import { Injectable } from '@nestjs/common';
import { Context } from 'telegraf';
import { getTranslations } from '../i18n/translations';
import { MessageManagementService } from '../services/message-management.service';
import { UserState, UserStateService } from '../services/user-state.service';
import { ContextExtractor } from '../utils/context-extractor.util';
import { KeyboardBuilder } from '../utils/keyboard-builder.util';

@Injectable()
export class CallbackQueryHandler {
  constructor(
    private readonly messageManagementService: MessageManagementService,
    private readonly userStateService: UserStateService,
  ) {}

  async handleCallbackQuery(ctx: Context, callbackData: string): Promise<void> {
    const userContext = ContextExtractor.extractUserContext(ctx);
    if (!userContext) return;

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

    const text = t.buyStars.selectAmount;

    const keyboard = KeyboardBuilder.createInlineKeyboard([
      [
        { text: '500', callback_data: 'amount_500' },
        { text: '1000', callback_data: 'amount_1000' },
      ],
      [
        { text: '2000', callback_data: 'amount_2000' },
        { text: '3000', callback_data: 'amount_3000' },
      ],
      [{ text: '5000', callback_data: 'amount_5000' }],
      [{ text: t.buyStars.enterCustomAmount, callback_data: 'amount_custom' }],
      [{ text: t.mainMenu.back, callback_data: 'buy_stars' }],
    ]);

    await this.messageManagementService.editMessage(
      ctx,
      userId,
      text,
      keyboard,
    );
  }

  private async handleAmountSelected(
    ctx: Context,
    userId: string,
    t: ReturnType<typeof getTranslations>,
    callbackData: string,
  ): Promise<void> {
    this.userStateService.clearState(userId);
    const amount = callbackData.replace('amount_', '');
    const amountText = t.buyStars.selectedAmount.replace('{amount}', amount);
    const text = `${t.buyStars.soon}\n\n${amountText}`;

    await this.messageManagementService.editMessage(ctx, userId, text);
  }

  private async handleCustomAmount(
    ctx: Context,
    userId: string,
    t: ReturnType<typeof getTranslations>,
  ): Promise<void> {
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
