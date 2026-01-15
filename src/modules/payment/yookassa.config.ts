import { ConfigFragment } from '@common/config/config-fragment';
import { UseEnv } from '@common/config/use-env.decorator';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * Configuration for YooKassa payment integration
 * Contains shop ID, secret key, and webhook settings
 */
export class YooKassaConfig extends ConfigFragment {
  /**
   * YooKassa shop ID (test or production)
   */
  @IsString()
  @IsNotEmpty()
  @UseEnv('YOOKASSA_SHOP_ID')
  public readonly shopId: string;

  /**
   * YooKassa secret key (test or production)
   */
  @IsString()
  @IsNotEmpty()
  @UseEnv('YOOKASSA_SECRET_KEY')
  public readonly secretKey: string;

  /**
   * Webhook secret for validating webhook signatures (optional)
   */
  @IsString()
  @IsOptional()
  @UseEnv('YOOKASSA_WEBHOOK_SECRET')
  public readonly webhookSecret?: string;

  /**
   * Test mode flag (true for test environment)
   */
  @IsBoolean()
  @UseEnv('YOOKASSA_TEST_MODE', (value?: string) => {
    if (!value) return true; // Default to test mode
    return value.toLowerCase() === 'true';
  })
  public readonly testMode: boolean;
}

