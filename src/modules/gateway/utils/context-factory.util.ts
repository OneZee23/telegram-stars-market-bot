import { Context, Telegraf } from 'telegraf';
import { CallbackQuery, Message, Update } from 'telegraf/types';

export class ContextFactory {
  static createFromMessage(
    message: Message,
    updateId: number,
    telegram: Telegraf['telegram'],
    botInfo?: Telegraf['botInfo'],
  ): Context<Update> {
    const update: Update = {
      message,
      update_id: updateId,
    } as Update;

    return new Context(update, telegram, botInfo);
  }

  static createFromCallbackQuery(
    callbackQuery: CallbackQuery,
    updateId: number,
    telegram: Telegraf['telegram'],
    botInfo?: Telegraf['botInfo'],
  ): Context<Update> {
    const update: Update = {
      callback_query: callbackQuery,
      update_id: updateId,
    } as Update;

    return new Context(update, telegram, botInfo);
  }
}
