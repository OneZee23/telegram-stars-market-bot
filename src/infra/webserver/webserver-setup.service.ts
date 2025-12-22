import { INestApplication, Injectable, Logger } from '@nestjs/common';
import { WebserverConfig } from '@infra/webserver/webserver.config';
import { getAppName } from '@common/env';

@Injectable()
export class WebserverSetupService {
  constructor(private readonly config: WebserverConfig) {}

  public async setup(app: INestApplication): Promise<void> {
    await app.listen(this.config.port);

    const msg = `Serving ${getAppName()} on ${this.config.publicUrl}`;
    new Logger('Webserver').log(msg);
  }
}
