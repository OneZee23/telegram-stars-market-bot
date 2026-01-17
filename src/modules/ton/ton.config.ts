import { ConfigFragment } from '@common/config/config-fragment';
import { UseEnv } from '@common/config/use-env.decorator';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class TonConfig extends ConfigFragment {
  @IsString()
  @IsNotEmpty()
  @UseEnv('FRAGMENT_MNEMONIC')
  public readonly mnemonic: string;

  @IsString()
  @IsOptional()
  @UseEnv('TONCENTER_RPC_URL')
  public readonly toncenterRpcUrl?: string;

  @IsString()
  @IsOptional()
  @UseEnv('TONCENTER_RPC_API_KEY')
  public readonly toncenterApiKey?: string;

  @IsString()
  @IsOptional()
  @UseEnv('DEX_PROVIDER')
  public readonly dexProvider?: string;

  @IsString()
  @IsOptional()
  @UseEnv('USDT_JETTON_ADDRESS')
  public readonly usdtJettonAddress?: string;

  @IsString()
  @IsOptional()
  @UseEnv('SWAP_SLIPPAGE_TOLERANCE')
  public readonly swapSlippageTolerance?: string;

  @IsString()
  @IsOptional()
  @UseEnv('SWAP_RESERVE_PERCENT')
  public readonly swapReservePercent?: string;

  @IsString()
  @IsOptional()
  @UseEnv('MIN_TON_FOR_FEES')
  public readonly minTonForFees?: string;
}
