import { Injectable } from '@nestjs/common';
import { Context } from 'telegraf';
import { getTranslations } from '../i18n/translations';
import { MessageManagementService } from '../services/message-management.service';
import { UserState, UserStateService } from '../services/user-state.service';
import { ContextExtractor } from '../utils/context-extractor.util';

@Injectable()
export class MessageHandler {
  constructor(
    private readonly messageManagementService: MessageManagementService,
    private readonly userStateService: UserStateService,
  ) {}

  async handleTextMessage(ctx: Context, text: string): Promise<void> {
    const userContext = ContextExtractor.extractUserContext(ctx);
    if (!userContext) return;

    const state = this.userStateService.getState(userContext.userId);
    const t = getTranslations(userContext.language);

    if (state === UserState.ENTERING_CUSTOM_AMOUNT) {
      await this.handleCustomAmountInput(ctx, userContext.userId, text, t);
    }
  }

  private async handleCustomAmountInput(
    ctx: Context,
    userId: string,
    text: string,
    t: ReturnType<typeof getTranslations>,
  ): Promise<void> {
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
}
