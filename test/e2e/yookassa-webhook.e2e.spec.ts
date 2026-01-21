import {
  StarsPurchaseEntity,
  StarsPurchaseStatus,
} from '@modules/fragment/entities/stars-purchase.entity';
import { StarsPurchaseService } from '@modules/fragment/services/stars-purchase.service';
import { PricingConfig } from '@modules/gateway/config/pricing.config';
import { UserEntity } from '@modules/user/entities/user.entity';
import { UserModule } from '@modules/user/user.module';
import {
  PaymentEntity,
  PaymentStatus,
} from '@modules/yookassa/entities/payment.entity';
import { YooKassaWebhookEvent } from '@modules/yookassa/yookassa-webhook-events.enum';
import { YooKassaConfig } from '@modules/yookassa/yookassa.config';
import { YooKassaModule } from '@modules/yookassa/yookassa.module';
import { HttpStatus } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import * as request from 'supertest';
import { DataSource, EntityManager } from 'typeorm';
import { MAIN_TELEGRAM_USER_ID } from './mocks/user.mock';
import { TestAppModule } from './test-app.module';
import { clearDatasource } from './utils/clear-datasource.util';
import { closeTestApp, TestAppContext } from './utils/create-test-app.util';

/**
 * E2E test for YooKassa webhook handling
 *
 * This test validates the webhook endpoint for YooKassa payment notifications:
 * - PAYMENT_SUCCEEDED event handling
 * - PAYMENT_CANCELED event handling
 * - Payment entity creation and linking
 * - Stars purchase creation and linking
 * - Error handling (payment not found, purchase failed)
 *
 * All external dependencies are mocked:
 * - StarsPurchaseService - mocked to prevent real Fragment API calls
 * - YooKassa API - not called (webhook is simulated)
 *
 * To run this test:
 *   yarn test:e2e --testNamePattern="YooKassa Webhook"
 */
describe('YooKassa Webhook E2E', () => {
  let testContext: TestAppContext;
  let entityManager: EntityManager;
  let mockStarsPurchaseService: jest.Mocked<StarsPurchaseService>;

  const TEST_USER_ID = MAIN_TELEGRAM_USER_ID;
  const TEST_RECIPIENT_USERNAME = 'test_recipient';
  const TEST_STARS_AMOUNT = 50;
  const TEST_PRICE_RUB = 79;

  beforeAll(async () => {
    // Disable alerts for tests
    process.env.DISABLE_ALERTS = 'true';

    // Create mock StarsPurchaseService
    mockStarsPurchaseService = {
      purchaseStars: jest.fn(),
      purchaseTestStars: jest.fn(),
    } as any;

    // Create test app with YooKassa and User modules
    const moduleFixture = await Test.createTestingModule({
      imports: [TestAppModule, YooKassaModule, UserModule],
    })
      .overrideProvider(YooKassaConfig)
      .useValue({
        shopId: 'test_shop_id',
        secretKey: 'test_secret_key',
        testMode: true,
      })
      .overrideProvider(PricingConfig)
      .useValue({
        usdRubRate: 78,
        price50StarsUsd: 0.75,
        usdtReserveMultiplier: 1.133,
        acquirerFeePercent: 3,
        availableStarAmounts: [50, 100, 200, 500, 1000],
      })
      .overrideProvider(StarsPurchaseService)
      .useValue(mockStarsPurchaseService)
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

    entityManager = testContext.dataSource.manager;
  });

  afterAll(async () => {
    if (testContext) {
      await closeTestApp(testContext);
    }
  });

  beforeEach(async () => {
    // Clear database before each test
    await clearDatasource(testContext.dataSource);

    // Create test user in database
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
      testUser.testClaims = 0;
    }

    await userRepo.save(testUser);

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('route /api/yookassa/webhook', () => {
    it('should handle PAYMENT_SUCCEEDED webhook and create stars purchase', async () => {
      // Create payment in database first
      const paymentRepo = entityManager.getRepository(PaymentEntity);
      const payment = paymentRepo.create({
        userId: TEST_USER_ID,
        recipientUsername: TEST_RECIPIENT_USERNAME,
        starsAmount: TEST_STARS_AMOUNT,
        priceRub: TEST_PRICE_RUB,
        status: PaymentStatus.PENDING,
        yooKassaPaymentId: 'test_yookassa_payment_id',
        isTestPurchase: false,
      });
      await paymentRepo.save(payment);

      // Mock successful stars purchase
      const mockRequestId = 'test_fragment_request_id';
      const mockTxHash = 'test_tx_hash';
      mockStarsPurchaseService.purchaseStars.mockResolvedValue({
        success: true,
        requestId: mockRequestId,
        txHash: mockTxHash,
      });

      // Create mock stars purchase entity that will be found after purchase
      const purchaseRepo = entityManager.getRepository(StarsPurchaseEntity);
      const mockPurchase = purchaseRepo.create({
        userId: TEST_USER_ID,
        recipientUsername: TEST_RECIPIENT_USERNAME.replace('@', ''),
        starsAmount: TEST_STARS_AMOUNT,
        fragmentRequestId: mockRequestId,
        status: StarsPurchaseStatus.COMPLETED,
        txHash: mockTxHash,
      });
      await purchaseRepo.save(mockPurchase);

      // Send webhook
      const webhookBody = {
        event: YooKassaWebhookEvent.PAYMENT_SUCCEEDED,
        object: {
          id: 'test_yookassa_payment_id',
          status: 'succeeded',
          amount: {
            value: TEST_PRICE_RUB.toFixed(2),
            currency: 'RUB',
          },
        },
      };

      await request(testContext.app.getHttpServer())
        .post('/api/yookassa/webhook')
        .send(webhookBody)
        .expect(HttpStatus.OK);

      // Verify payment was linked to purchase
      const updatedPayment = await paymentRepo.findOne({
        where: { id: payment.id },
      });
      expect(updatedPayment).toBeDefined();
      expect(updatedPayment?.starsPurchaseId).toBe(mockPurchase.id);
      expect(updatedPayment?.status).toBe(PaymentStatus.SUCCEEDED);

      // Verify purchaseStars was called with correct parameters
      expect(mockStarsPurchaseService.purchaseStars).toHaveBeenCalledTimes(1);
      expect(mockStarsPurchaseService.purchaseStars).toHaveBeenCalledWith(
        TEST_USER_ID,
        TEST_RECIPIENT_USERNAME,
        TEST_STARS_AMOUNT,
        0,
        false,
      );
    });

    it('should handle PAYMENT_SUCCEEDED webhook for test purchase', async () => {
      // Create test payment in database
      const paymentRepo = entityManager.getRepository(PaymentEntity);
      const payment = paymentRepo.create({
        userId: TEST_USER_ID,
        recipientUsername: TEST_RECIPIENT_USERNAME,
        starsAmount: TEST_STARS_AMOUNT,
        priceRub: TEST_PRICE_RUB,
        status: PaymentStatus.PENDING,
        yooKassaPaymentId: 'test_yookassa_payment_id_test',
        isTestPurchase: true,
      });
      await paymentRepo.save(payment);

      // Mock successful test stars purchase
      const mockRequestId = 'test_fragment_request_id_test';
      const mockTxHash = 'test_tx_hash_test';
      mockStarsPurchaseService.purchaseTestStars.mockResolvedValue({
        success: true,
        requestId: mockRequestId,
        txHash: mockTxHash,
      });

      // Create mock stars purchase entity
      const purchaseRepo = entityManager.getRepository(StarsPurchaseEntity);
      const mockPurchase = purchaseRepo.create({
        userId: TEST_USER_ID,
        recipientUsername: TEST_RECIPIENT_USERNAME.replace('@', ''),
        starsAmount: 50, // Test purchase always uses 50 stars
        fragmentRequestId: mockRequestId,
        status: StarsPurchaseStatus.COMPLETED,
        txHash: mockTxHash,
      });
      await purchaseRepo.save(mockPurchase);

      // Send webhook
      const webhookBody = {
        event: YooKassaWebhookEvent.PAYMENT_SUCCEEDED,
        object: {
          id: 'test_yookassa_payment_id_test',
          status: 'succeeded',
        },
      };

      await request(testContext.app.getHttpServer())
        .post('/api/yookassa/webhook')
        .send(webhookBody)
        .expect(HttpStatus.OK);

      // Verify payment was linked to purchase
      const updatedPayment = await paymentRepo.findOne({
        where: { id: payment.id },
      });
      expect(updatedPayment).toBeDefined();
      expect(updatedPayment?.starsPurchaseId).toBe(mockPurchase.id);

      // Verify purchaseTestStars was called
      expect(mockStarsPurchaseService.purchaseTestStars).toHaveBeenCalledTimes(
        1,
      );
      expect(mockStarsPurchaseService.purchaseTestStars).toHaveBeenCalledWith(
        TEST_USER_ID,
        TEST_RECIPIENT_USERNAME,
      );
    });

    it('should handle PAYMENT_CANCELED webhook', async () => {
      // Create payment in database
      const paymentRepo = entityManager.getRepository(PaymentEntity);
      const payment = paymentRepo.create({
        userId: TEST_USER_ID,
        recipientUsername: TEST_RECIPIENT_USERNAME,
        starsAmount: TEST_STARS_AMOUNT,
        priceRub: TEST_PRICE_RUB,
        status: PaymentStatus.PENDING,
        yooKassaPaymentId: 'test_yookassa_payment_id_canceled',
      });
      await paymentRepo.save(payment);

      // Send webhook
      const webhookBody = {
        event: YooKassaWebhookEvent.PAYMENT_CANCELED,
        object: {
          id: 'test_yookassa_payment_id_canceled',
          status: 'canceled',
        },
      };

      await request(testContext.app.getHttpServer())
        .post('/api/yookassa/webhook')
        .send(webhookBody)
        .expect(HttpStatus.OK);

      // Verify payment status was updated
      const updatedPayment = await paymentRepo.findOne({
        where: { id: payment.id },
      });
      expect(updatedPayment).toBeDefined();
      expect(updatedPayment?.status).toBe(PaymentStatus.CANCELED);

      // Verify no purchase was attempted
      expect(mockStarsPurchaseService.purchaseStars).not.toHaveBeenCalled();
      expect(mockStarsPurchaseService.purchaseTestStars).not.toHaveBeenCalled();
    });

    it('should handle webhook when payment not found in database', async () => {
      // Send webhook for non-existent payment
      const webhookBody = {
        event: YooKassaWebhookEvent.PAYMENT_SUCCEEDED,
        object: {
          id: 'non_existent_payment_id',
          status: 'succeeded',
        },
      };

      await request(testContext.app.getHttpServer())
        .post('/api/yookassa/webhook')
        .send(webhookBody)
        .expect(HttpStatus.OK);

      // Verify no purchase was attempted
      expect(mockStarsPurchaseService.purchaseStars).not.toHaveBeenCalled();
      expect(mockStarsPurchaseService.purchaseTestStars).not.toHaveBeenCalled();
    });

    it('should handle webhook when stars purchase fails', async () => {
      // Create payment in database
      const paymentRepo = entityManager.getRepository(PaymentEntity);
      const payment = paymentRepo.create({
        userId: TEST_USER_ID,
        recipientUsername: TEST_RECIPIENT_USERNAME,
        starsAmount: TEST_STARS_AMOUNT,
        priceRub: TEST_PRICE_RUB,
        status: PaymentStatus.PENDING,
        yooKassaPaymentId: 'test_yookassa_payment_id_failed',
        isTestPurchase: false,
      });
      await paymentRepo.save(payment);

      // Mock failed stars purchase
      mockStarsPurchaseService.purchaseStars.mockResolvedValue({
        success: false,
        error: 'Purchase failed: insufficient balance',
      });

      // Send webhook
      const webhookBody = {
        event: YooKassaWebhookEvent.PAYMENT_SUCCEEDED,
        object: {
          id: 'test_yookassa_payment_id_failed',
          status: 'succeeded',
        },
      };

      await request(testContext.app.getHttpServer())
        .post('/api/yookassa/webhook')
        .send(webhookBody)
        .expect(HttpStatus.OK);

      // Verify payment error was saved
      const updatedPayment = await paymentRepo.findOne({
        where: { id: payment.id },
      });
      expect(updatedPayment).toBeDefined();
      expect(updatedPayment?.error).toBe(
        'Purchase failed: insufficient balance',
      );
      expect(updatedPayment?.starsPurchaseId).toBeNull();
    });

    it('should handle webhook when payment already has stars purchase linked', async () => {
      // Create payment with linked purchase
      const paymentRepo = entityManager.getRepository(PaymentEntity);
      const purchaseRepo = entityManager.getRepository(StarsPurchaseEntity);

      const existingPurchase = purchaseRepo.create({
        userId: TEST_USER_ID,
        recipientUsername: TEST_RECIPIENT_USERNAME.replace('@', ''),
        starsAmount: TEST_STARS_AMOUNT,
        fragmentRequestId: 'existing_request_id',
        status: StarsPurchaseStatus.COMPLETED,
      });
      await purchaseRepo.save(existingPurchase);

      const payment = paymentRepo.create({
        userId: TEST_USER_ID,
        recipientUsername: TEST_RECIPIENT_USERNAME,
        starsAmount: TEST_STARS_AMOUNT,
        priceRub: TEST_PRICE_RUB,
        status: PaymentStatus.SUCCEEDED,
        yooKassaPaymentId: 'test_yookassa_payment_id_linked',
        starsPurchaseId: existingPurchase.id,
      });
      await paymentRepo.save(payment);

      // Send webhook
      const webhookBody = {
        event: YooKassaWebhookEvent.PAYMENT_SUCCEEDED,
        object: {
          id: 'test_yookassa_payment_id_linked',
          status: 'succeeded',
        },
      };

      await request(testContext.app.getHttpServer())
        .post('/api/yookassa/webhook')
        .send(webhookBody)
        .expect(HttpStatus.OK);

      // Verify no new purchase was attempted
      expect(mockStarsPurchaseService.purchaseStars).not.toHaveBeenCalled();
      expect(mockStarsPurchaseService.purchaseTestStars).not.toHaveBeenCalled();
    });

    it('should handle webhook when purchase succeeds but requestId is missing', async () => {
      // Create payment in database
      const paymentRepo = entityManager.getRepository(PaymentEntity);
      const payment = paymentRepo.create({
        userId: TEST_USER_ID,
        recipientUsername: TEST_RECIPIENT_USERNAME,
        starsAmount: TEST_STARS_AMOUNT,
        priceRub: TEST_PRICE_RUB,
        status: PaymentStatus.PENDING,
        yooKassaPaymentId: 'test_yookassa_payment_id_no_request_id',
        isTestPurchase: false,
      });
      await paymentRepo.save(payment);

      // Mock purchase with missing requestId
      mockStarsPurchaseService.purchaseStars.mockResolvedValue({
        success: true,
        txHash: 'test_tx_hash',
        // requestId is missing
      });

      // Send webhook
      const webhookBody = {
        event: YooKassaWebhookEvent.PAYMENT_SUCCEEDED,
        object: {
          id: 'test_yookassa_payment_id_no_request_id',
          status: 'succeeded',
        },
      };

      await request(testContext.app.getHttpServer())
        .post('/api/yookassa/webhook')
        .send(webhookBody)
        .expect(HttpStatus.OK);

      // Verify payment was not linked (no purchase entity found)
      const updatedPayment = await paymentRepo.findOne({
        where: { id: payment.id },
      });
      expect(updatedPayment).toBeDefined();
      expect(updatedPayment?.starsPurchaseId).toBeNull();
    });

    it('should handle unhandled webhook event', async () => {
      // Create payment in database
      const paymentRepo = entityManager.getRepository(PaymentEntity);
      const payment = paymentRepo.create({
        userId: TEST_USER_ID,
        recipientUsername: TEST_RECIPIENT_USERNAME,
        starsAmount: TEST_STARS_AMOUNT,
        priceRub: TEST_PRICE_RUB,
        status: PaymentStatus.PENDING,
        yooKassaPaymentId: 'test_yookassa_payment_id_unhandled',
      });
      await paymentRepo.save(payment);

      // Send webhook with unhandled event
      const webhookBody = {
        event: 'payment.refund.succeeded',
        object: {
          id: 'test_yookassa_payment_id_unhandled',
          status: 'succeeded',
        },
      };

      await request(testContext.app.getHttpServer())
        .post('/api/yookassa/webhook')
        .send(webhookBody)
        .expect(HttpStatus.OK);

      // Verify no purchase was attempted
      expect(mockStarsPurchaseService.purchaseStars).not.toHaveBeenCalled();
      expect(mockStarsPurchaseService.purchaseTestStars).not.toHaveBeenCalled();
    });
  });
});
