import { HttpStatus, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { clearDatasource } from './utils/clear-datasource.util';

describe('Stars Shop Service (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeEach(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    dataSource = app.get<DataSource>(getDataSourceToken());

    await clearDatasource(dataSource);
  });

  afterAll(async () => {
    await clearDatasource(dataSource);
    await app.close();
  });

  describe('Health Check', () => {
    it('should return health status', async () => {
      await request(app.getHttpServer())
        .get('/health/check')
        .expect(HttpStatus.OK)
        .expect('I am ok');
    });
  });
});
