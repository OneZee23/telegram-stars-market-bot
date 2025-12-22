import { DataSource } from 'typeorm';

export const connectionSource = new DataSource({
  type: 'postgres',
  host: process.env.TYPEORM_CLI_HOST,
  port: Number(process.env.TYPEORM_CLI_PORT),
  username: process.env.TYPEORM_CLI_USERNAME,
  password: process.env.TYPEORM_CLI_PASSWORD,
  database: process.env.TYPEORM_CLI_DATABASE,
  logging: true,
  synchronize: false,
  migrationsRun: false,
  entities: ['src/**/*.entity.ts'],
  migrations: ['src/migrations/*.ts'],
});
