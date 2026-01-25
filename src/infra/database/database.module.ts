import { DatabaseConfig } from '@infra/database/database.config';
import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

/**
 * # Module, providing Typeorm database for the application.
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [
        {
          module: class DatabaseConfigModule {},
          providers: [DatabaseConfig],
          exports: [DatabaseConfig],
        },
      ],
      inject: [DatabaseConfig],
      useFactory: (config: DatabaseConfig) => ({
        type: 'postgres',
        database: config.database,
        username: config.username,
        password: config.password,
        host: config.host,
        port: config.port,
        entities: [`${__dirname}/../../**/*.entity.{js,ts}`],
        migrations: [`${__dirname}/../../migrations/*.{js,ts}`],
        migrationsRun: config.migrate,
        synchronize: config.sync,
        logging: config.log,
        ssl: config.cert
          ? {
              ca: config.cert,
              rejectUnauthorized: true,
              checkServerIdentity: () => undefined, // Disable hostname check for IP connections
            }
          : false,
        // Note: Ensure database user has proper permissions on schema 'public'
        // See docs/DATABASE_SETUP.md for setup instructions
      }),
    }),
  ],
})
export class DatabaseModule {}
