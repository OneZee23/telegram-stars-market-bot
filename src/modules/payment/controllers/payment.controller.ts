import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Headers,
} from '@nestjs/common';
import { PaymentService } from '../services/payment.service';
import { YooKassaService } from '../services/yookassa.service';
import { YooKassaWebhookDto } from '../dto/webhook.dto';
import { YooKassaWebhookEvent } from '../interfaces/yookassa.interfaces';

@Controller('api/payment')
export class PaymentController {
  constructor(
    private readonly paymentService: PaymentService,
    private readonly yooKassaService: YooKassaService,
  ) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Body() webhookData: YooKassaWebhookDto,
    @Headers('x-yookassa-signature') signature?: string,
  ): Promise<void> {
    // Validate webhook signature if configured
    const bodyString = JSON.stringify(webhookData);
    if (signature) {
      const isValid = this.yooKassaService.validateWebhookSignature(
        bodyString,
        signature,
      );
      if (!isValid) {
        throw new Error('Invalid webhook signature');
      }
    }

    // Process webhook
    await this.paymentService.handlePaymentWebhook(
      webhookData as YooKassaWebhookEvent,
    );
  }
}

