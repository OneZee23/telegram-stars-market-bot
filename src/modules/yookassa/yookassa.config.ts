import { ConfigFragment } from '@common/config/config-fragment';
import { UseEnv } from '@common/config/use-env.decorator';
import { IsNotEmpty, IsString } from 'class-validator';

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
}
