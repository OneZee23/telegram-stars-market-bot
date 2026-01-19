import { ConfigFragment } from '@common/config/config-fragment';
import { UseEnv } from '@common/config/use-env.decorator';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

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

  /**
   * Slippage tolerance for swap operations (percentage)
   * Default: 1%
   */
  @IsInt()
  @Min(0)
  @UseEnv('SWAP_SLIPPAGE_TOLERANCE', (value?: string) =>
    value ? parseInt(value, 10) : 1,
  )
  public readonly swapSlippageTolerance: number;

  /**
   * Reserve percent for fees when swapping (percentage)
   * Default: 5%
   */
  @IsInt()
  @Min(0)
  @UseEnv('SWAP_RESERVE_PERCENT', (value?: string) =>
    value ? parseInt(value, 10) : 5,
  )
  public readonly swapReservePercent: number;

  /**
   * Minimum TON amount reserved for fees (in nano)
   * Default: 100000000 (0.1 TON)
   */
  @IsString()
  @IsNotEmpty()
  @UseEnv('MIN_TON_FOR_FEES', (value?: string) => value || '100000000')
  public readonly minTonForFees: string;
}
