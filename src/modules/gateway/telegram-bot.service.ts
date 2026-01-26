import {
  sanitizeLogMessage,
  sanitizeLogObject,
} from '@common/utils/log-sanitizer.util';
import { NotificationsService } from '@modules/notifications/notifications.service';
import { TelegramBotConfig } from '@modules/telegram-core/telegram-bot.config';
import { UserService } from '@modules/user/user.service';
import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleInit,
} from '@nestjs/common';
import { EventEmitter } from 'node:events';
import { Telegraf } from 'telegraf';
import { BotCommand, CallbackQuery, Message, Update } from 'telegraf/types';
import { BotCommandHandler } from './handlers/bot-command.handler';
import { CallbackQueryHandler } from './handlers/callback-query.handler';
import { MessageHandler } from './handlers/message.handler';
import { ContextFactory } from './utils/context-factory.util';

@Injectable()
export class TelegramBotService
  extends EventEmitter
  implements OnModuleInit, OnApplicationBootstrap {
  constructor(
    private readonly config: TelegramBotConfig,
    private readonly telegraf: Telegraf,
    private readonly logger: Logger,
    private readonly botCommandHandler: BotCommandHandler,
    private readonly callbackQueryHandler: CallbackQueryHandler,
    private readonly messageHandler: MessageHandler,
    private readonly notificationsService: NotificationsService,
    private readonly userService: UserService,
  ) {
    super({ captureRejections: true });
    this.on('error', (err) => this.logger.warn(`Error: ${err}`));
    this.username = 'test_bot';
  }

  getUsername(): string {
    return this.username;
  }

  private username: string;

  private async loadBotUsername(): Promise<void> {
    try {
      const me = await this.telegraf.telegram.getMe();
      this.username = me.username || 'test_bot';
    } catch (error) {
      this.logger.warn(`Failed to load bot username: ${error}`);
      this.username = 'test_bot';
    }
  }

  async handleUpdate(update: Update): Promise<void> {
    const sanitizedUpdate = sanitizeLogObject(update);
    this.logger.log(`Incoming update: ${JSON.stringify(sanitizedUpdate)}`);

    try {
      if ('message' in update) {
        this.emit('message', update.message);
        await this.handleMessage(update.message, update.update_id);
      } else if ('callback_query' in update) {
        await this.handleCallbackQuery(update.callback_query, update.update_id);
      } else {
        const type = Object.keys(update)
          .filter((k) => k !== 'update_id')
          .pop();
        this.logger.warn(`Unknown update type: ${type}`);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // Handle "bot was blocked by the user" error - don't log as ERROR
      if (this.isBotBlockedError(error)) {
        const userContext = this.extractUserIdFromUpdate(update);
        if (userContext) {
          await this.userService.markUserAsBlocked(userContext.userId);
          this.logger.debug(
            `User ${userContext.userId} blocked the bot, flag set in database`,
          );
        }
        return;
      }

      this.logger.error(
        `Error handling update: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );

      // Send alert for all errors
      this.notificationsService
        .notifyCriticalError('Telegram bot', 'Произошла ошибка')
        .catch((err) => {
          this.logger.error(
            `Failed to send alert: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
    }
  }

  private async handleMessage(
    message: Message,
    updateId: number,
  ): Promise<void> {
    const ctx = ContextFactory.createFromMessage(
      message,
      updateId,
      this.telegraf.telegram,
      this.telegraf.botInfo,
    );

    if ('text' in message && message.text) {
      const text = message.text.trim();

      if (text.startsWith('/start')) {
        await this.botCommandHandler.handleStart(ctx);
        return;
      }

      await this.messageHandler.handleTextMessage(ctx, text);
    }
  }

  private async handleCallbackQuery(
    callbackQuery: CallbackQuery,
    updateId: number,
  ): Promise<void> {
    const ctx = ContextFactory.createFromCallbackQuery(
      callbackQuery,
      updateId,
      this.telegraf.telegram,
      this.telegraf.botInfo,
    );

    if ('data' in callbackQuery && callbackQuery.data) {
      await this.callbackQueryHandler.handleCallbackQuery(
        ctx,
        callbackQuery.data,
      );
    }
  }

  private readonly myCommands = [
    { command: '/start', description: 'Start working with the bot' },
  ] as BotCommand[];

  public async onModuleInit(): Promise<void> {
    await this.loadBotUsername();
  }

  public async onApplicationBootstrap(): Promise<void> {
    await this.registerCommands();
    await this.registerWebhook();

    const botLink = `https://t.me/${this.username}`;
    this.logger.log(`🤖 Bot started: @${this.username}`);
    this.logger.log(`🔗 Bot link: ${botLink}`);
  }

  private async registerCommands(): Promise<void> {
    await this.telegraf.telegram.setMyCommands(this.myCommands);
  }

  private async registerWebhook(): Promise<void> {
    const url = new URL(this.config.publicUrl);
    url.pathname += TelegramBotService.webhookPath;
    const webhookUrl = url.href;
    this.logger.log(`Setting webhook to: ${sanitizeLogMessage(webhookUrl)}`);
    try {
      await this.telegraf.telegram.setWebhook(webhookUrl, {
        secret_token: this.config.telegramWebhookApiKey,
        allowed_updates: ['message', 'callback_query'],
      });
      const webhookInfo = await this.telegraf.telegram.getWebhookInfo();

      // Log basic webhook info (sanitize URL)
      const sanitizedUrl = sanitizeLogMessage(webhookInfo.url || '');
      this.logger.log(
        `Webhook set successfully. URL: ${sanitizedUrl}, Pending updates: ${webhookInfo.pending_update_count}`,
      );

      // Warn if there were previous errors
      if (webhookInfo.last_error_message) {
        const errorDate = webhookInfo.last_error_date
          ? new Date(webhookInfo.last_error_date * 1000).toISOString()
          : 'unknown';
        const sanitizedError = sanitizeLogMessage(
          webhookInfo.last_error_message,
        );
        this.logger.warn(
          `Previous webhook error detected: ${sanitizedError} (at ${errorDate})`,
        );
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to set webhook: ${sanitizeLogMessage(errorMessage)}`,
      );
      throw error;
    }
  }

  public static readonly webhookPath = 'telegram/webhook';

  private isBotBlockedError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    const errorMessage = error.message.toLowerCase();
    return (
      errorMessage.includes('bot was blocked by the user') ||
      errorMessage.includes('forbidden: bot was blocked')
    );
  }

  private extractUserIdFromUpdate(update: Update): { userId: string } | null {
    if ('message' in update && update.message?.from) {
      return { userId: update.message.from.id.toString() };
    }

    if ('callback_query' in update && update.callback_query?.from) {
      return { userId: update.callback_query.from.id.toString() };
    }

    return null;
  }
}
