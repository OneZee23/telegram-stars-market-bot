import { HttpStatus } from '@nestjs/common';
import * as request from 'supertest';
import {
  closeTestApp,
  createTestApp,
  TestAppContext,
} from './utils/create-test-app.util';

describe('Stars Market Bot Service (e2e)', () => {
  let testContext: TestAppContext;

  beforeEach(async () => {
    testContext = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp(testContext);
  });

  describe('Health Check', () => {
    it('should return health status', async () => {
      await request(testContext.app.getHttpServer())
        .get('/health/check')
        .expect(HttpStatus.OK)
        .expect('I am ok');
    });
  });
});
