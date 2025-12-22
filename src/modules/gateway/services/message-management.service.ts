import { Injectable } from '@nestjs/common';
import { Context } from 'telegraf';

export interface StoredMessage {
  messageId: number;
  chatId: number;
  timestamp: number;
}

@Injectable()
export class MessageManagementService {
  private readonly userMessages = new Map<string, StoredMessage>();

  async sendMessage(
    ctx: Context,
    userId: string,
    text: string,
    keyboard?: { inline_keyboard?: any[]; keyboard?: any[] },
  ): Promise<number | null> {
    const options: any = {};
    if (keyboard?.inline_keyboard) {
      options.reply_markup = { inline_keyboard: keyboard.inline_keyboard };
    } else if (keyboard?.keyboard) {
      options.reply_markup = keyboard;
    }

    const sentMessage = await ctx.reply(text, options);

    if (sentMessage && 'message_id' in sentMessage) {
      this.userMessages.set(userId, {
        messageId: sentMessage.message_id,
        chatId: ctx.chat?.id || 0,
        timestamp: Date.now(),
      });
      return sentMessage.message_id;
    }

    return null;
  }

  async editMessage(
    ctx: Context,
    userId: string,
    text: string,
    keyboard?: { inline_keyboard?: any[] },
  ): Promise<boolean> {
    const storedMessage = this.userMessages.get(userId);
    if (!storedMessage) {
      return false;
    }

    try {
      const options: any = {};
      if (keyboard?.inline_keyboard) {
        options.reply_markup = { inline_keyboard: keyboard.inline_keyboard };
      }

      await ctx.telegram.editMessageText(
        storedMessage.chatId,
        storedMessage.messageId,
        undefined,
        text,
        options,
      );
      return true;
    } catch {
      return false;
    }
  }

  async deleteMessage(ctx: Context, userId: string): Promise<boolean> {
    const storedMessage = this.userMessages.get(userId);
    if (!storedMessage) {
      return false;
    }

    try {
      await ctx.telegram.deleteMessage(
        storedMessage.chatId,
        storedMessage.messageId,
      );
      this.userMessages.delete(userId);
      return true;
    } catch {
      this.userMessages.delete(userId);
      return false;
    }
  }

  async sendNewMessage(
    ctx: Context,
    userId: string,
    text: string,
    keyboard?: { inline_keyboard?: any[]; keyboard?: any[] },
  ): Promise<number | null> {
    await this.deleteMessage(ctx, userId);
    return this.sendMessage(ctx, userId, text, keyboard);
  }

  hasStoredMessage(userId: string): boolean {
    return this.userMessages.has(userId);
  }

  getStoredMessage(userId: string): StoredMessage | undefined {
    return this.userMessages.get(userId);
  }

  clearStoredMessage(userId: string): void {
    this.userMessages.delete(userId);
  }
}
