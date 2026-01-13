import { Injectable } from '@nestjs/common';
import { IsNotEmpty, IsString, validateSync } from 'class-validator';

@Injectable()
export class NotificationsConfig {
  @IsString()
  @IsNotEmpty()
  public readonly channelId = process.env.TELEGRAM_MONITORING_CHANNEL_ID;

  constructor() {
    this.validateSelf();
  }

  private validateSelf(): void {
    const errors = validateSync(this);
    if (errors.length > 0) throw new Error(JSON.stringify(errors));
  }
}
