import { ConfigFragment } from '@common/config/config-fragment';
import { UseEnv } from '@common/config/use-env.decorator';
import { Injectable } from '@nestjs/common';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

@Injectable()
export class NotificationsConfig extends ConfigFragment {
  @IsString()
  @IsNotEmpty()
  @UseEnv('TELEGRAM_MONITORING_CHANNEL_ID')
  public readonly channelId: string;

  @IsBoolean()
  @IsOptional()
  @UseEnv('DISABLE_ALERTS', (value?: string) => value === 'true')
  public readonly disableAlerts?: boolean;
}
