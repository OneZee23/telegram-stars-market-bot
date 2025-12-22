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
    buttons: Array<Array<{ text: string; callback_data: string }>>,
  ): {
    inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
  } {
    return {
      inline_keyboard: buttons,
    };
  }
}
