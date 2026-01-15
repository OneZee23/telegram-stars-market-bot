import { maskUserId, maskUsername } from '@common/utils/data-masker.util';
import { Injectable, Logger } from '@nestjs/common';
import { Telegraf } from 'telegraf';
import { NotificationsConfig } from './notifications.config';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  private purchaseCountToday = 0;

  private purchaseCountResetTime = this.getNextMidnight();

  constructor(
    private readonly telegraf: Telegraf,
    private readonly config: NotificationsConfig,
  ) {
    this.resetPurchaseCountIfNeeded();
  }

  async notifyPurchaseSuccess(
    userId: string,
    username: string,
    starsAmount: number,
    priceRub: number,
    pricePerStar: number,
    processingTimeMs: number,
    isSelfPurchase: boolean,
    isTestPurchase: boolean = false,
  ): Promise<void> {
    this.incrementPurchaseCount();
    const maskedUser = maskUsername(username);
    const maskedId = maskUserId(userId);
    const processingTime = (processingTimeMs / 1000).toFixed(1);
    const purchaseCount = this.purchaseCountToday;

    const title = isTestPurchase
      ? `🎁 Бесплатный тестовый клейм!`
      : `🎉 Новая покупка!`;

    const message =
      `${title}\n\n` +
      `⭐ Количество: ${starsAmount.toLocaleString()} Stars\n` +
      `💰 Сумма: ${priceRub.toLocaleString('ru-RU')} ₽\n` +
      `💵 Курс: ${pricePerStar.toFixed(3)} ₽/⭐ (временно захардкожен)\n` +
      `👤 Получатель: ${maskedUser} ${isSelfPurchase ? '(себе)' : ''}\n` +
      `🆔 Пользователь: ${maskedId}\n` +
      `⏱ Время обработки: ${processingTime} сек\n` +
      `📅 Время: ${new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}\n\n` +
      `${purchaseCount === 1 ? 'Первая покупка за сегодня!' : `Это ${purchaseCount}-я покупка за сегодня`}`;

    await this.sendMessage(message);
  }

  async notifyError(
    errorType: string,
    details: string,
    attempt?: number,
    maxAttempts?: number,
  ): Promise<void> {
    const time = new Date().toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    let message = `🚨 Ошибка ${errorType}\n\n`;
    message += `❌ Тип: ${errorType}\n`;
    message += `⏱ Время: ${time}\n`;

    if (attempt && maxAttempts) {
      message += `🔄 Попытка: ${attempt}/${maxAttempts}\n`;
    }

    message += `📝 Детали: ${details}\n\n`;

    if (attempt && maxAttempts && attempt < maxAttempts) {
      message += `Автоматический retry через 5 сек...`;
    }

    await this.sendMessage(message);
  }

  async notifySuspiciousActivity(
    requestCount: number,
    timeWindowMinutes: number,
    ip?: string,
  ): Promise<void> {
    const time = new Date().toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    let message = `⚠️ Подозрительная активность\n\n`;
    message += `🔢 Запросов: ${requestCount} за ${timeWindowMinutes} мин\n`;

    if (ip) {
      const parts = ip.split('.');
      const maskedIp =
        parts.length === 4
          ? `${parts[0]}.${parts[1]}.xxx.xxx`
          : 'xxx.xxx.xxx.xxx';
      message += `🌐 IP: ${maskedIp}\n`;
    }

    message += `⏱ Период: ${time}\n`;
    message += `🛡 Действие: Rate limit активирован\n\n`;
    message += `Мониторим ситуацию...`;

    await this.sendMessage(message);
  }

  async notifyLowBalance(
    currentBalance: string,
    requiredBalance: string,
    pendingOrders: number,
  ): Promise<void> {
    const message =
      `🚨 Критично: Недостаточно TON\n\n` +
      `💰 Текущий баланс: ${currentBalance} TON\n` +
      `💵 Требуется: ${requiredBalance} TON\n` +
      `📊 Ожидающих заказов: ${pendingOrders}\n\n` +
      `Требуется пополнение кошелька!`;

    await this.sendMessage(message);
  }

  async notifyInsufficientBalance(
    tonBalance: string,
    requiredTon: string,
    usdtBalance: string,
  ): Promise<void> {
    const message =
      `🚨 Критично: Недостаточно средств для покупки\n\n` +
      `💰 TON баланс: ${tonBalance} TON\n` +
      `💵 Требуется: ${requiredTon} TON\n` +
      `💲 USDT баланс: ${usdtBalance} USDT\n\n` +
      `Недостаточно TON и USDT для выполнения свопа!\n` +
      `Требуется пополнение кошелька.`;

    await this.sendMessage(message);
  }

  async notifySwapError(
    usdtAmount: string,
    expectedTon: string,
    error: string,
  ): Promise<void> {
    const time = new Date().toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const message =
      `⚠️ Ошибка свопа USDT → TON\n\n` +
      `💲 Сумма USDT: ${usdtAmount} USDT\n` +
      `💰 Ожидалось TON: ${expectedTon} TON\n` +
      `❌ Ошибка: ${error}\n` +
      `⏱ Время: ${time}\n\n` +
      `Проверьте баланс и настройки DEX.`;

    await this.sendMessage(message);
  }

  async notifySwapFailedUsingTonDirectly(
    usdtAmount: string,
    tonBalance: string,
    requiredTon: string,
    error: string,
  ): Promise<void> {
    const time = new Date().toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const message =
      `⚠️ Своп USDT → TON не удался, используется TON напрямую\n\n` +
      `💲 Попытка свопа USDT: ${usdtAmount} USDT\n` +
      `💰 Текущий баланс TON: ${tonBalance} TON\n` +
      `📊 Требуется TON: ${requiredTon} TON\n` +
      `❌ Ошибка свопа: ${error}\n` +
      `✅ Используется TON напрямую (баланс достаточен)\n` +
      `⏱ Время: ${time}\n\n` +
      `Рекомендуется проверить настройки DEX и ликвидность.`;

    await this.sendMessage(message);
  }

  private async sendMessage(text: string): Promise<void> {
    if (!this.config.channelId) {
      this.logger.warn('TELEGRAM_MONITORING_CHANNEL_ID not configured');
      return;
    }

    try {
      await this.telegraf.telegram.sendMessage(this.config.channelId, text);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to send notification: ${errorMessage}`);
    }
  }

  private incrementPurchaseCount(): void {
    this.resetPurchaseCountIfNeeded();
    this.purchaseCountToday += 1;
  }

  private resetPurchaseCountIfNeeded(): void {
    const now = Date.now();
    if (now >= this.purchaseCountResetTime) {
      this.purchaseCountToday = 0;
      this.purchaseCountResetTime = this.getNextMidnight();
    }
  }

  private getNextMidnight(): number {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return tomorrow.getTime();
  }
}
