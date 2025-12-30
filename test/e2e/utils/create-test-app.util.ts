import { INestApplication } from '@nestjs/common';
// eslint-disable-next-line import/no-extraneous-dependencies
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TestAppModule } from '../test-app.module';
import { clearDatasource } from './clear-datasource.util';

export interface TestAppContext {
  app: INestApplication;
  dataSource: DataSource;
  module: TestingModule;
}

/**
 * Creates a test NestJS application with database connection.
 * Automatically clears the database before returning.
 *
 * @param additionalImports - Optional additional modules to import for specific tests
 * @returns Test application context with app, dataSource, and module
 */
export async function createTestApp(
  additionalImports: any[] = [],
): Promise<TestAppContext> {
  const moduleFixture = await Test.createTestingModule({
    imports: [TestAppModule, ...additionalImports],
  }).compile();

  const app = moduleFixture.createNestApplication();
  await app.init();

  const dataSource = app.get<DataSource>(getDataSourceToken());
  await clearDatasource(dataSource);

  return {
    app,
    dataSource,
    module: moduleFixture,
  };
}

/**
 * Closes the test application and cleans up resources.
 */
export async function closeTestApp(context: TestAppContext): Promise<void> {
  if (context.dataSource) {
    await clearDatasource(context.dataSource);
  }
  if (context.app) {
    await context.app.close();
  }
}
