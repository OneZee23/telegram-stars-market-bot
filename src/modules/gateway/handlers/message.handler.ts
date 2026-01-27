import { WhitelistService } from '@modules/user/services/whitelist.service';
import { UserService } from '@modules/user/user.service';
import { Injectable, Logger } from '@nestjs/common';
import { Context } from 'telegraf';
import { getTranslations } from '../i18n/translations';
import { MessageManagementService } from '../services/message-management.service';
import { UserState, UserStateService } from '../services/user-state.service';
import { ContextExtractor } from '../utils/context-extractor.util';
import { CallbackQueryHandler } from './callback-query.handler';

@Injectable()
export class MessageHandler {
  private readonly logger = new Logger(MessageHandler.name);

  constructor(
    private readonly messageManagementService: MessageManagementService,
    private readonly userStateService: UserStateService,
    private readonly whitelistService: WhitelistService,
    private readonly userService: UserService,
    private readonly callbackQueryHandler: CallbackQueryHandler,
  ) { }

  async handleTextMessage(ctx: Context, text: string): Promise<void> {
    const userContext = await ContextExtractor.getUserContext(
      ctx,
      this.userService,
    );
    if (!userContext) return;

    this.logger.log(
      `User ${userContext.userId} (@${userContext.username || 'unknown'}) sent text message: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`,
    );

    const state = this.userStateService.getState(userContext.userId);
    const t = getTranslations(userContext.language);

    if (state === UserState.ENTERING_CUSTOM_AMOUNT) {
      await this.handleCustomAmountInput(ctx, userContext.userId, text, t);
    } else if (state === UserState.ENTERING_EMAIL) {
      await this.handleEmailInput(ctx, userContext.userId, text, t);
    }
  }

  private async handleCustomAmountInput(
    ctx: Context,
    userId: string,
    text: string,
    t: ReturnType<typeof getTranslations>,
  ): Promise<void> {
    // Check if user is whitelisted
    const isWhitelisted = await this.whitelistService.isUserWhitelisted(userId);
    if (!isWhitelisted) {
      const message = t.buyStars.notInWhitelist
        .replace('{userId}', userId)
        .replace('{channel}', 'https://t.me/onezee_co')
        .replace('{post}', 'https://t.me/onezee_co/49');
      await this.messageManagementService.sendNewMessage(ctx, userId, message);
      this.userStateService.clearState(userId);
      return;
    }

    const amount = parseInt(text.trim(), 10);

    if (Number.isNaN(amount) || amount < 500 || amount > 200000) {
      const errorText = t.buyStars.invalidAmount;
      await this.messageManagementService.sendNewMessage(
        ctx,
        userId,
        errorText,
      );
      return;
    }

    this.userStateService.clearState(userId);
    const amountText = t.buyStars.selectedAmount.replace(
      '{amount}',
      amount.toString(),
    );
    const responseText = `${t.buyStars.soon}\n\n${amountText}`;

    await this.messageManagementService.sendNewMessage(
      ctx,
      userId,
      responseText,
    );
  }

  private async handleEmailInput(
    ctx: Context,
    userId: string,
    text: string,
    t: ReturnType<typeof getTranslations>,
  ): Promise<void> {
    const email = text.trim().toLowerCase();

    // Simple email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      const errorText = t.buyStars.invalidEmail;
      await this.messageManagementService.sendNewMessage(
        ctx,
        userId,
        errorText,
        undefined,
        { parse_mode: 'Markdown' },
      );
      return;
    }

    // Get amount from state
    const amount = this.userStateService.getAmount(userId);
    if (!amount) {
      const errorText = t.buyStars.purchaseError.replace(
        '{error}',
        'Amount not found. Please restart the purchase flow.',
      );
      await this.messageManagementService.sendNewMessage(
        ctx,
        userId,
        errorText,
      );
      this.userStateService.clearState(userId);
      return;
    }

    // Save email to user
    await this.userService.getOrCreateUser(userId, { email });

    // Clear state
    this.userStateService.clearState(userId);

    // Proceed to payment creation
    await this.callbackQueryHandler.proceedToPaymentAfterEmail(
      ctx,
      userId,
      amount,
      email,
    );
  }
}
