import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleInit,
} from '@nestjs/common';
import { EventEmitter } from 'node:events';
import { Telegraf } from 'telegraf';
import { BotCommand, Update } from 'telegraf/types';
import { TelegramBotConfig } from './telegram-bot.config';

@Injectable()
export class TelegramBotService
  extends EventEmitter
  implements OnModuleInit, OnApplicationBootstrap
{
  constructor(
    private readonly config: TelegramBotConfig,
    private readonly telegraf: Telegraf,
    private readonly logger: Logger,
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
    this.logger.log(`Incoming update: ${JSON.stringify(update)}`);

    if ('message' in update) {
      this.emit('message', update.message);
      await this.telegraf.handleUpdate(update);
    } else if ('callback_query' in update) {
      await this.telegraf.handleUpdate(update);
    } else {
      const type = Object.keys(update)
        .filter((k) => k !== 'update_id')
        .pop();
      this.logger.warn(`Unknown update type: ${type}`);
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
    await this.telegraf.telegram.setWebhook(url.href, {
      secret_token: this.config.telegramWebhookApiKey,
      allowed_updates: ['message', 'callback_query'],
    });
  }

  public static readonly webhookPath = 'telegram/webhook';
}
