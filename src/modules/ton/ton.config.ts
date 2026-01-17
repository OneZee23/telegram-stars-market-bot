import { ConfigFragment } from '@common/config/config-fragment';
import { UseEnv } from '@common/config/use-env.decorator';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * Configuration for TON blockchain operations
 */
export class TonConfig extends ConfigFragment {
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
   * USDT jetton address on TON (mainnet)
   * Default: EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs
   */
  @IsString()
  @IsNotEmpty()
  @UseEnv(
    'USDT_JETTON_ADDRESS',
    (value?: string) =>
      value || 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs',
  )
  public readonly usdtJettonAddress: string;
}
