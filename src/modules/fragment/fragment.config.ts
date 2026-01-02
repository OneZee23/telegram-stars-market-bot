import { ConfigFragment } from '@common/config/config-fragment';
import { UseEnv } from '@common/config/use-env.decorator';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * Configuration for Fragment API integration
 * Contains sensitive data: cookies, mnemonic, API keys
 */
export class FragmentConfig extends ConfigFragment {
  /**
   * Fragment session cookies (stel_ssid, stel_ton_token, etc.)
   * Format: JSON string with cookie key-value pairs
   */
  @IsString()
  @IsNotEmpty()
  @UseEnv('FRAGMENT_COOKIES')
  public readonly cookies: string;

  /**
   * Fragment API hash extracted from page source
   */
  @IsString()
  @IsNotEmpty()
  @UseEnv('FRAGMENT_API_HASH')
  public readonly apiHash: string;

  /**
   * TON wallet mnemonic (24 words)
   * Used for signing transactions
   */
  @IsString()
  @IsNotEmpty()
  @UseEnv('FRAGMENT_MNEMONIC')
  public readonly mnemonic: string;

  /**
   * TON Center RPC URL
   * Default: https://toncenter.com/api/v2/jsonRPC
   */
  @IsString()
  @IsOptional()
  @UseEnv('TONCENTER_RPC_URL')
  public readonly toncenterRpcUrl?: string;

  /**
   * TON Center API key
   */
  @IsString()
  @IsOptional()
  @UseEnv('TONCENTER_RPC_API_KEY')
  public readonly toncenterApiKey?: string;

  /**
   * HTTP/HTTPS proxy for Fragment API requests
   * Format: http://user:pass@host:port or http://host:port
   * Optional: if not set, requests go directly
   */
  @IsString()
  @IsOptional()
  @UseEnv('FRAGMENT_PROXY')
  public readonly proxy?: string;
}
