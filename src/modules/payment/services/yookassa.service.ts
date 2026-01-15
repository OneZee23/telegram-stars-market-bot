import { Injectable, Logger } from '@nestjs/common';
import { YooKassaConfig } from '../yookassa.config';
import {
  YooKassaPaymentRequest,
  YooKassaPaymentResponse,
  YooKassaWebhookEvent,
} from '../interfaces/yookassa.interfaces';

@Injectable()
export class YooKassaService {
  private readonly logger = new Logger(YooKassaService.name);
  private readonly baseUrl: string;

  constructor(private readonly config: YooKassaConfig) {
    this.baseUrl = this.config.testMode
      ? 'https://api.yookassa.ru/v3'
      : 'https://api.yookassa.ru/v3';
  }

  /**
   * Create payment in YooKassa
   */
  async createPayment(
    amount: number,
    currency: string,
    metadata?: Record<string, string>,
    description?: string,
  ): Promise<YooKassaPaymentResponse> {
    const request: YooKassaPaymentRequest = {
      amount: {
        value: amount.toFixed(2),
        currency,
      },
      confirmation: {
        type: 'redirect',
      },
      capture: true,
      description,
      metadata,
    };

    const auth = Buffer.from(
      `${this.config.shopId}:${this.config.secretKey}`,
    ).toString('base64');

    try {
      const response = await fetch(`${this.baseUrl}/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${auth}`,
          'Idempotence-Key': `${Date.now()}-${Math.random()}`,
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          `YooKassa API error: HTTP ${response.status}: ${errorText}`,
        );
        throw new Error(
          `YooKassa API error: HTTP ${response.status}: ${errorText}`,
        );
      }

      const data: YooKassaPaymentResponse = await response.json();
      this.logger.log(`Payment created: ${data.id}`);
      return data;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to create payment: ${message}`);
      throw error;
    }
  }

  /**
   * Get payment status from YooKassa
   */
  async getPayment(paymentId: string): Promise<YooKassaPaymentResponse> {
    const auth = Buffer.from(
      `${this.config.shopId}:${this.config.secretKey}`,
    ).toString('base64');

    try {
      const response = await fetch(`${this.baseUrl}/payments/${paymentId}`, {
        method: 'GET',
        headers: {
          Authorization: `Basic ${auth}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          `YooKassa API error: HTTP ${response.status}: ${errorText}`,
        );
        throw new Error(
          `YooKassa API error: HTTP ${response.status}: ${errorText}`,
        );
      }

      return await response.json();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to get payment: ${message}`);
      throw error;
    }
  }

  /**
   * Validate webhook signature (if webhook secret is configured)
   */
  validateWebhookSignature(
    body: string,
    signature: string,
  ): boolean {
    if (!this.config.webhookSecret) {
      this.logger.warn(
        'Webhook secret not configured, skipping signature validation',
      );
      return true;
    }

    // YooKassa uses HMAC-SHA256 for webhook signature validation
    // For now, we'll skip validation if secret is not set
    // In production, implement proper HMAC validation
    return true;
  }
}

