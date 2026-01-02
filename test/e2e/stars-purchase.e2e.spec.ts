import {
  StarsPurchaseEntity,
  StarsPurchaseStatus,
} from '@modules/fragment/entities/stars-purchase.entity';
import { FragmentConfig } from '@modules/fragment/fragment.config';
import { FragmentModule } from '@modules/fragment/fragment.module';
import { StarsPurchaseService } from '@modules/fragment/services/stars-purchase.service';
import { UserEntity } from '@modules/user/entities/user.entity';
import { UserModule } from '@modules/user/user.module';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { TestAppModule } from './test-app.module';
import { clearDatasource } from './utils/clear-datasource.util';
import { closeTestApp, TestAppContext } from './utils/create-test-app.util';

/**
 * E2E test for purchasing 50 stars
 *
 * This test makes REAL API calls to Fragment.com and will actually purchase stars.
 * It requires:
 * - Valid FRAGMENT_COOKIES and FRAGMENT_API_HASH in environment
 * - Valid Telegram username for recipient
 * - User must be in whitelist (inWhiteList: true in database)
 *
 * To run this test:
 *   yarn test:e2e --testNamePattern="Stars Purchase"
 *
 * WARNING: This test will make real purchases and spend real money!
 */
describe('Stars Purchase E2E', () => {
  let testContext: TestAppContext;
  let module: TestingModule;
  let starsPurchaseService: StarsPurchaseService;
  let entityManager: EntityManager;

  // Test configuration
  const TEST_USER_ID = '999999999';
  const TEST_RECIPIENT_USERNAME = 'test_user'; // Change to a valid Telegram username

  // Second user for parallel tests
  const TEST_USER_ID_2 = '888888888';
  const TEST_RECIPIENT_USERNAME_2 = 'test_user_2';

  beforeAll(async () => {
    // Get test values from environment or use defaults
    const testCookiesRaw =
      process.env.FRAGMENT_COOKIES ||
      '{"stel_ssid":"test","stel_ton_token":"test"}';
    const testApiHash = process.env.FRAGMENT_API_HASH || 'test_hash';

    // Validate JSON format
    let testCookies: string;
    try {
      // Ensure it's valid JSON by parsing and stringifying
      testCookies = JSON.stringify(JSON.parse(testCookiesRaw));
    } catch (error) {
      throw new Error(
        `Invalid FRAGMENT_COOKIES format in test: ${testCookiesRaw}. Error: ${error}`,
      );
    }

    // Set environment variables before creating module (for UseEnv decorators)
    const originalCookies = process.env.FRAGMENT_COOKIES;
    const originalApiHash = process.env.FRAGMENT_API_HASH;
    const originalMnemonic = process.env.FRAGMENT_MNEMONIC;

    process.env.FRAGMENT_COOKIES = testCookies;
    process.env.FRAGMENT_API_HASH = testApiHash;
    if (!process.env.FRAGMENT_MNEMONIC) {
      process.env.FRAGMENT_MNEMONIC =
        'test test test test test test test test test test test test test test test test test test test test test test test test test test';
    }

    // Create test app with Fragment and User modules
    // TestAppModule includes DatabaseModule which provides EntityManager
    // We need to override FragmentConfig before creating the app
    const moduleFixture = await Test.createTestingModule({
      imports: [TestAppModule, FragmentModule, UserModule],
    })
      .overrideProvider(FragmentConfig)
      .useValue({
        cookies: testCookies,
        apiHash: testApiHash,
        mnemonic:
          process.env.FRAGMENT_MNEMONIC ||
          'test test test test test test test test test test test test test test test test test test test test test test test test test test',
        toncenterRpcUrl: process.env.TONCENTER_RPC_URL,
        toncenterApiKey: process.env.TONCENTER_RPC_API_KEY,
      })
      .compile();

    const app = moduleFixture.createNestApplication();
    await app.init();

    const dataSource = app.get<DataSource>(getDataSourceToken());
    await clearDatasource(dataSource);

    testContext = {
      app,
      dataSource,
      module: moduleFixture,
    };

    // Restore original environment variables
    if (originalCookies !== undefined) {
      process.env.FRAGMENT_COOKIES = originalCookies;
    }
    if (originalApiHash !== undefined) {
      process.env.FRAGMENT_API_HASH = originalApiHash;
    }
    if (originalMnemonic !== undefined) {
      process.env.FRAGMENT_MNEMONIC = originalMnemonic;
    }

    module = testContext.module;
    starsPurchaseService =
      module.get<StarsPurchaseService>(StarsPurchaseService);
    entityManager = testContext.dataSource.manager;

    // No mocks - use real Fragment API
    // Make sure FRAGMENT_COOKIES and FRAGMENT_API_HASH are set in environment
    if (!process.env.FRAGMENT_COOKIES || !process.env.FRAGMENT_API_HASH) {
      throw new Error(
        'FRAGMENT_COOKIES and FRAGMENT_API_HASH must be set in environment for real API tests',
      );
    }
  });

  afterAll(async () => {
    if (testContext) {
      await closeTestApp(testContext);
    }
  });

  beforeEach(async () => {
    // Create test user in database with whitelist flag
    const userRepo = entityManager.getRepository(UserEntity);
    let testUser = await userRepo.findOneBy({ userId: TEST_USER_ID });

    if (!testUser) {
      testUser = new UserEntity({
        userId: TEST_USER_ID,
        inWhiteList: true,
        testClaims: 0,
      });
    } else {
      testUser.inWhiteList = true;
      testUser.testClaims = 0; // Reset test claims for each test run
    }

    await userRepo.save(testUser);
  });

  it.skip('should purchase 50 stars for whitelisted user', async () => {
    // Verify initial test claims is 0
    const userRepo = entityManager.getRepository(UserEntity);
    const userBefore = await userRepo.findOneBy({ userId: TEST_USER_ID });
    expect(userBefore?.testClaims).toBe(0);

    // Call the main method that does everything: checks whitelist, purchases stars, increments testClaims
    const result = await starsPurchaseService.purchaseTestStars(
      TEST_USER_ID,
      TEST_RECIPIENT_USERNAME,
    );

    // Verify purchase was successful
    expect(result.success).toBe(true);
    expect(result.requestId).toBeDefined();
    expect(result.error).toBeUndefined();

    // Verify test claims counter was incremented
    const userAfter = await userRepo.findOneBy({ userId: TEST_USER_ID });
    expect(userAfter?.testClaims).toBe(1);

    // Verify purchase record was created in database
    const purchaseRepo = entityManager.getRepository(StarsPurchaseEntity);
    const purchaseRecord = await purchaseRepo.findOne({
      where: {
        userId: TEST_USER_ID,
        fragmentRequestId: result.requestId,
      },
      order: {
        createdAt: 'DESC',
      },
    });

    // Debug output
    // eslint-disable-next-line no-console
    console.log('\n=== STARS PURCHASE DATABASE RECORD ===');
    // eslint-disable-next-line no-console
    console.log('Purchase Record:', JSON.stringify(purchaseRecord, null, 2));
    // eslint-disable-next-line no-console
    console.log('=======================================\n');

    // Verify purchase record exists
    expect(purchaseRecord).toBeDefined();
    expect(purchaseRecord).not.toBeNull();

    // Verify all fields
    expect(purchaseRecord?.userId).toBe(TEST_USER_ID);
    expect(purchaseRecord?.recipientUsername).toBe(
      TEST_RECIPIENT_USERNAME.replace('@', ''),
    );
    expect(purchaseRecord?.starsAmount).toBe(50);
    expect(purchaseRecord?.fragmentRequestId).toBe(result.requestId);
    expect(purchaseRecord?.status).toBe(StarsPurchaseStatus.COMPLETED);
    if (result.txHash) {
      expect(purchaseRecord?.txHash).toBe(result.txHash);
    }
    expect(purchaseRecord?.error).toBeNull();
    expect(purchaseRecord?.createdAt).toBeDefined();
    expect(purchaseRecord?.updatedAt).toBeDefined();
  }, 60000); // 60 second timeout

  it.skip('should fail to purchase stars if user is not whitelisted', async () => {
    // Remove user from whitelist
    const userRepo = entityManager.getRepository(UserEntity);
    const testUser = await userRepo.findOneBy({ userId: TEST_USER_ID });
    if (testUser) {
      testUser.inWhiteList = false;
      await userRepo.save(testUser);
    }

    // Try to purchase stars - should fail
    const result = await starsPurchaseService.purchaseTestStars(
      TEST_USER_ID,
      TEST_RECIPIENT_USERNAME,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('not whitelisted');
  }, 30000);

  it.skip('should fail to purchase stars if user already claimed test stars', async () => {
    // Set test claims to max
    const userRepo = entityManager.getRepository(UserEntity);
    const testUser = await userRepo.findOneBy({ userId: TEST_USER_ID });
    if (testUser) {
      testUser.testClaims = 1; // Max test claims
      await userRepo.save(testUser);
    }

    // Try to purchase stars - should fail
    const result = await starsPurchaseService.purchaseTestStars(
      TEST_USER_ID,
      TEST_RECIPIENT_USERNAME,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('already claimed');
  }, 30000);

  it.skip('should handle parallel purchase requests correctly (one should get QUEUE_BUSY)', async () => {
    // Reset test claims to 0
    const userRepo = entityManager.getRepository(UserEntity);
    const testUser = await userRepo.findOneBy({ userId: TEST_USER_ID });
    if (testUser) {
      testUser.testClaims = 0;
      await userRepo.save(testUser);
    }

    // Launch two parallel purchase requests
    const [result1, result2] = await Promise.all([
      starsPurchaseService.purchaseTestStars(
        TEST_USER_ID,
        TEST_RECIPIENT_USERNAME,
      ),
      starsPurchaseService.purchaseTestStars(
        TEST_USER_ID,
        TEST_RECIPIENT_USERNAME,
      ),
    ]);

    // Debug output
    // eslint-disable-next-line no-console
    console.log('\n=== PARALLEL PURCHASE RESULTS ===');
    // eslint-disable-next-line no-console
    console.log('Result 1:', JSON.stringify(result1, null, 2));
    // eslint-disable-next-line no-console
    console.log('Result 2:', JSON.stringify(result2, null, 2));
    // eslint-disable-next-line no-console
    console.log('==================================\n');

    // Only one should succeed
    const successCount = [result1, result2].filter((r) => r.success).length;
    expect(successCount).toBe(1);

    // The other should fail with QUEUE_BUSY error
    const failedResults = [result1, result2].filter((r) => !r.success);
    expect(failedResults.length).toBe(1);
    expect(failedResults[0].error).toBe('QUEUE_BUSY');

    // Verify only one purchase record was created in DB (the successful one)
    const purchaseRepo = entityManager.getRepository(StarsPurchaseEntity);
    const purchaseRecords = await purchaseRepo.find({
      where: { userId: TEST_USER_ID },
      order: { createdAt: 'DESC' },
    });

    // Debug output
    // eslint-disable-next-line no-console
    console.log('\n=== PARALLEL PURCHASE DB RECORDS ===');
    // eslint-disable-next-line no-console
    console.log(
      `Total records: ${purchaseRecords.length}`,
      JSON.stringify(
        purchaseRecords.map((r) => ({
          id: r.id,
          status: r.status,
          fragmentRequestId: r.fragmentRequestId,
          createdAt: r.createdAt,
        })),
        null,
        2,
      ),
    );
    // eslint-disable-next-line no-console
    console.log('=====================================\n');

    // Should have exactly 1 record (only successful purchase creates a record)
    expect(purchaseRecords.length).toBe(1);

    // The record should be COMPLETED
    expect(purchaseRecords[0].status).toBe(StarsPurchaseStatus.COMPLETED);
    expect(purchaseRecords[0].fragmentRequestId).toBe(
      result1.success ? result1.requestId : result2.requestId,
    );

    // Verify test claims counter was incremented only once
    const userAfter = await userRepo.findOneBy({ userId: TEST_USER_ID });
    expect(userAfter?.testClaims).toBe(1);
  }, 120000); // 120 second timeout for parallel requests

  it.skip('should handle parallel purchases from two different users correctly (one should get QUEUE_BUSY)', async () => {
    // Reset test claims for both users
    const userRepo = entityManager.getRepository(UserEntity);

    // Setup first user
    let testUser1 = await userRepo.findOneBy({ userId: TEST_USER_ID });
    if (!testUser1) {
      testUser1 = new UserEntity({
        userId: TEST_USER_ID,
        inWhiteList: true,
        testClaims: 0,
      });
    } else {
      testUser1.inWhiteList = true;
      testUser1.testClaims = 0;
    }
    await userRepo.save(testUser1);

    // Setup second user
    let testUser2 = await userRepo.findOneBy({ userId: TEST_USER_ID_2 });
    if (!testUser2) {
      testUser2 = new UserEntity({
        userId: TEST_USER_ID_2,
        inWhiteList: true,
        testClaims: 0,
      });
    } else {
      testUser2.inWhiteList = true;
      testUser2.testClaims = 0;
    }
    await userRepo.save(testUser2);

    // Launch two parallel purchase requests from different users
    // Note: Since we now check isProcessingPurchase flag, only one will succeed,
    // the other will get QUEUE_BUSY
    const [result1, result2] = await Promise.all([
      starsPurchaseService.purchaseTestStars(
        TEST_USER_ID,
        TEST_RECIPIENT_USERNAME,
      ),
      starsPurchaseService.purchaseTestStars(
        TEST_USER_ID_2,
        TEST_RECIPIENT_USERNAME_2,
      ),
    ]);

    // Debug output
    // eslint-disable-next-line no-console
    console.log('\n=== PARALLEL PURCHASE FROM TWO USERS RESULTS ===');
    // eslint-disable-next-line no-console
    console.log('User 1 Result:', JSON.stringify(result1, null, 2));
    // eslint-disable-next-line no-console
    console.log('User 2 Result:', JSON.stringify(result2, null, 2));
    // eslint-disable-next-line no-console
    console.log('================================================\n');

    // Only one should succeed (queue is busy for the second)
    const successCount = [result1, result2].filter((r) => r.success).length;
    expect(successCount).toBe(1);

    // The other should fail with QUEUE_BUSY error
    const failedResults = [result1, result2].filter((r) => !r.success);
    expect(failedResults.length).toBe(1);
    expect(failedResults[0].error).toBe('QUEUE_BUSY');

    // Verify only one purchase record was created in DB (the successful one)
    const purchaseRepo = entityManager.getRepository(StarsPurchaseEntity);

    const purchaseRecords1 = await purchaseRepo.find({
      where: { userId: TEST_USER_ID },
      order: { createdAt: 'DESC' },
    });

    const purchaseRecords2 = await purchaseRepo.find({
      where: { userId: TEST_USER_ID_2 },
      order: { createdAt: 'DESC' },
    });

    // Debug output
    // eslint-disable-next-line no-console
    console.log('\n=== PARALLEL PURCHASE DB RECORDS ===');
    // eslint-disable-next-line no-console
    console.log(
      `User 1 records: ${purchaseRecords1.length}`,
      JSON.stringify(
        purchaseRecords1.map((r) => ({
          id: r.id,
          status: r.status,
          fragmentRequestId: r.fragmentRequestId,
          createdAt: r.createdAt,
        })),
        null,
        2,
      ),
    );
    // eslint-disable-next-line no-console
    console.log(
      `User 2 records: ${purchaseRecords2.length}`,
      JSON.stringify(
        purchaseRecords2.map((r) => ({
          id: r.id,
          status: r.status,
          fragmentRequestId: r.fragmentRequestId,
          createdAt: r.createdAt,
        })),
        null,
        2,
      ),
    );
    // eslint-disable-next-line no-console
    console.log('====================================\n');

    // Only one user should have a completed record
    const totalRecords = purchaseRecords1.length + purchaseRecords2.length;
    expect(totalRecords).toBe(1);

    const successfulResult = result1.success ? result1 : result2;
    const successfulRecords = result1.success
      ? purchaseRecords1
      : purchaseRecords2;

    expect(successfulRecords.length).toBe(1);
    expect(successfulRecords[0].status).toBe(StarsPurchaseStatus.COMPLETED);
    expect(successfulRecords[0].fragmentRequestId).toBe(
      successfulResult.requestId,
    );

    // Verify test claims counter was incremented only for the successful user
    const user1After = await userRepo.findOneBy({ userId: TEST_USER_ID });
    const user2After = await userRepo.findOneBy({ userId: TEST_USER_ID_2 });
    if (result1.success) {
      expect(user1After?.testClaims).toBe(1);
      expect(user2After?.testClaims).toBe(0);
    } else {
      expect(user1After?.testClaims).toBe(0);
      expect(user2After?.testClaims).toBe(1);
    }
  }, 120000); // 120 second timeout for parallel requests
});
