import { ConfigFragment } from '@common/config/config-fragment';
import { UseEnv } from '@common/config/use-env.decorator';
import { IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';

/**
 * Configuration for YooKassa payment integration
 */
export class YooKassaConfig extends ConfigFragment {
  /**
   * YooKassa shop ID
   */
  @IsString()
  @IsNotEmpty()
  @UseEnv('YOOKASSA_SHOP_ID')
  public readonly shopId: string;

  /**
   * YooKassa secret key
   */
  @IsString()
  @IsNotEmpty()
  @UseEnv('YOOKASSA_SECRET_KEY')
  public readonly secretKey: string;

  /**
   * Webhook URL for payment notifications
   * Optional: if not set, will be constructed from app URL
   */
  @IsString()
  @IsUrl()
  @IsOptional()
  @UseEnv('YOOKASSA_WEBHOOK_URL')
  public readonly webhookUrl?: string;

  /**
   * Whether to use test mode (sandbox)
   * Default: false
   */
  @IsString()
  @IsOptional()
  @UseEnv('YOOKASSA_TEST_MODE', (value?: string) =>
    value ? value.toLowerCase() === 'true' : false,
  )
  public readonly testMode?: boolean;
}
