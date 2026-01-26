import { GlobalExceptionFilter } from '@common/errors/global-exception.filter';
import { WebserverSetupService } from '@infra/webserver/webserver-setup.service';
import { WebserverConfig } from '@infra/webserver/webserver.config';
import { NotificationsModule } from '@modules/notifications/notifications.module';
import { Global, Module } from '@nestjs/common';
import { HealthController } from './health.controller';

@Global()
@Module({
  imports: [NotificationsModule],
  providers: [WebserverConfig, WebserverSetupService, GlobalExceptionFilter],
  exports: [WebserverSetupService],
  controllers: [HealthController],
})
export class WebserverModule {}
