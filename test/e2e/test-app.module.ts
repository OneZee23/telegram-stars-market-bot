import { DatabaseModule } from '@infra/database/database.module';
import { WebserverModule } from '@infra/webserver/webserver.module';
import { Module } from '@nestjs/common';

/**
 * Test application module for e2e tests.
 * Excludes slow modules like TelegramBotModule to speed up test execution.
 *
 * To include additional modules for specific tests, use overrideModule or
 * create a custom test module that imports this one.
 */
@Module({
  imports: [
    // Infrastructure modules (required for most tests)
    DatabaseModule,
    WebserverModule,

    // Feature modules are excluded by default to speed up tests
    // Add them here or in specific test files if needed
  ],
})
export class TestAppModule {}
