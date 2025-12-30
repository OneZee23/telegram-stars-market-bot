import { InlineKeyboardButton, KeyboardButton } from 'telegraf/types';

export interface InlineKeyboard {
  inline_keyboard: InlineKeyboardButton[][];
}

export interface ReplyKeyboard {
  keyboard: KeyboardButton[][];
  resize_keyboard?: boolean;
  one_time_keyboard?: boolean;
}

export type TelegramKeyboard = InlineKeyboard | ReplyKeyboard;
