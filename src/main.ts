import 'reflect-metadata';
import { WebserverSetupService } from '@infra/webserver/webserver-setup.service';
import { NestFactory } from '@nestjs/core';
import { singleLineMessage } from '@common/errors/single-line-message';
import { registerError } from '@common/errors/registry';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

// TODO: remove this after testing
require('dotenv').config();

(async () => {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  await app.get(WebserverSetupService).setup(app);
})();

const logger = new Logger('Main');

process.on('uncaughtException', (err) => {
  if (err instanceof Error) {
    const reason = singleLineMessage(err);
    logger.error(`An uncaught exception: ${reason}`);
    registerError(err);
  } else {
    logger.error(`An uncaught exception: ${err}`);
  }
});

process.on('unhandledRejection', (err: unknown) => {
  if (err instanceof Error) {
    const reason = singleLineMessage(err);
    logger.error(`An unhandled rejection: ${reason}`);
    registerError(err);
  } else {
    logger.error(`An unhandled rejection: ${err}`);
  }
});
