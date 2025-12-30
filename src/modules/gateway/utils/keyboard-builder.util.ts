import { InlineKeyboardButton } from 'telegraf/types';
import { InlineKeyboard } from '../types/keyboard.types';

export class KeyboardBuilder {
  static createReplyKeyboard(buttons: string[][]): {
    keyboard: Array<Array<{ text: string }>>;
    resize_keyboard: boolean;
    one_time_keyboard: boolean;
  } {
    return {
      keyboard: buttons.map((row) => row.map((text) => ({ text }))),
      resize_keyboard: true,
      one_time_keyboard: false,
    };
  }

  static createInlineKeyboard(
    buttons: InlineKeyboardButton[][],
  ): InlineKeyboard {
    return {
      inline_keyboard: buttons,
    };
  }

  static createInlineKeyboardWithBack(
    buttons: InlineKeyboardButton[][],
    backText: string,
    backCallbackData: string,
  ): InlineKeyboard {
    return {
      inline_keyboard: [
        ...buttons,
        [{ text: backText, callback_data: backCallbackData }],
      ],
    };
  }
}
