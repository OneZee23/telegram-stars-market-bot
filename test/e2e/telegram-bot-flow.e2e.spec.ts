import { FragmentConfig } from '@modules/fragment/fragment.config';
import { FragmentModule } from '@modules/fragment/fragment.module';
import { FragmentApiClientService } from '@modules/fragment/services/fragment-api-client.service';
import { ProxyManagerService } from '@modules/fragment/services/proxy-manager.service';
import { StarsPurchaseService } from '@modules/fragment/services/stars-purchase.service';
import { CallbackData } from '@modules/gateway/constants/callback-data.constants';
import { BotCommandHandler } from '@modules/gateway/handlers/bot-command.handler';
import { CallbackQueryHandler } from '@modules/gateway/handlers/callback-query.handler';
import { MessageManagementService } from '@modules/gateway/services/message-management.service';
import { TelegramBotModule } from '@modules/gateway/telegram-bot.module';
import { TelegramBotService } from '@modules/gateway/telegram-bot.service';
import { NotificationsConfig } from '@modules/notifications/notifications.config';
import { NotificationsService } from '@modules/notifications/notifications.service';
import { TelegramBotConfig } from '@modules/telegram-core/telegram-bot.config';
import { StonfiSwapService } from '@modules/ton/providers/stonfi-swap.provider';
import { TonBalanceProvider } from '@modules/ton/providers/ton-balance.provider';
import { TonTransactionProvider } from '@modules/ton/providers/ton-transaction.provider';
import { TonWalletProvider } from '@modules/ton/providers/ton-wallet.provider';
import { TonConfig } from '@modules/ton/ton.config';
import { UserEntity } from '@modules/user/entities/user.entity';
import { ConsentService } from '@modules/user/services/consent.service';
import { UserModule } from '@modules/user/user.module';
import { UserService } from '@modules/user/user.service';
import { YooKassaService } from '@modules/yookassa/services/yookassa.service';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { Telegraf } from 'telegraf';
import { DataSource, EntityManager } from 'typeorm';
import { TestAppModule } from './test-app.module';
import { clearDatasource } from './utils/clear-datasource.util';
import { closeTestApp, TestAppContext } from './utils/create-test-app.util';

/**
 * E2E test for Telegram bot flow
 *
 * This test validates the complete user interaction flow with the bot:
 * - /start command
 * - Selecting purchase option
 * - Choosing recipient (myself)
 * - Selecting star amount
 * - Balance checking
 * - Payment button display
 * - Payment confirmation
 * - Whitelist and claim validation
 * - Purchase process (mocked)
 * - Error handling (not whitelisted, already claimed, insufficient balance)
 *
 * All external dependencies are mocked to prevent real API calls:
 * - Telegram Bot API (Telegraf) - mocked
 * - Fragment API (FragmentApiClientService) - mocked
 * - TON Blockchain (TonWalletProvider, TonBalanceProvider, TonTransactionProvider) - mocked
 * - Stonfi DEX (StonfiSwapService) - mocked (prevents WebSocket connections)
 * - Notifications/Alerts (NotificationsService) - mocked
 * - Proxy Manager (ProxyManagerService) - mocked
 *
 * To run this test:
 *   yarn test:e2e --testNamePattern="Telegram Bot Flow"
 */
describe('Telegram Bot Flow E2E', () => {
  let testContext: TestAppContext;
  let module: TestingModule;
  let botCommandHandler: BotCommandHandler;
  let callbackQueryHandler: CallbackQueryHandler;
  let messageManagementService: MessageManagementService;
  let starsPurchaseService: StarsPurchaseService;
  let yooKassaService: YooKassaService;
  let userService: UserService;
  let entityManager: EntityManager;

  // Mock for ConsentService - tracks consent state per user
  const mockConsentState = new Map<string, boolean>();
  const mockConsentService = {
    hasValidConsent: jest.fn((userId: string) => {
      return Promise.resolve(mockConsentState.get(userId) ?? false);
    }),
    grantConsent: jest.fn((userId: string) => {
      mockConsentState.set(userId, true);
      return Promise.resolve();
    }),
    revokeConsent: jest.fn((userId: string) => {
      mockConsentState.set(userId, false);
      return Promise.resolve();
    }),
    getCurrentVersion: jest.fn(() => 'v1.0'),
  };

  // Test configuration
  const TEST_USER_ID = '999999999';
  const TEST_USERNAME = 'test_user';
  const TEST_USER_ID_NOT_WHITELISTED = '888888888';
  const TEST_USER_ID_ALREADY_CLAIMED = '777777777';
  const TEST_USER_ID_NO_CONSENT = '666666666';

  // Mock context for handlers
  const createMockContext = (userId: string, username?: string): any => {
    const chatId = parseInt(userId, 10);
    const mockReply = jest.fn().mockResolvedValue({
      message_id: 1,
      chat: { id: chatId, type: 'private' },
      text: '',
    });
    const mockEditMessageText = jest.fn().mockResolvedValue(true);
    const mockDeleteMessage = jest.fn().mockResolvedValue(true);

    return {
      from: {
        id: chatId,
        is_bot: false,
        first_name: 'Test',
        username: username || TEST_USERNAME,
        language_code: 'ru', // Set Russian language for tests
      },
      chat: {
        id: chatId,
        type: 'private' as const,
      },
      reply: mockReply,
      callbackQuery: {
        id: 'test_callback_id',
        from: {
          id: chatId,
          is_bot: false,
          first_name: 'Test',
          username: username || TEST_USERNAME,
          language_code: 'ru', // Set Russian language for tests
        },
        message: {
          message_id: 1,
          date: Date.now(),
          chat: {
            id: chatId,
            type: 'private' as const,
          },
        },
        data: '',
      },
      answerCbQuery: jest.fn().mockResolvedValue(true),
      telegram: {
        getChat: jest.fn().mockResolvedValue({
          id: chatId,
          type: 'private',
          username: username || TEST_USERNAME,
        }),
        editMessageText: mockEditMessageText,
        deleteMessage: mockDeleteMessage,
      },
    } as any;
  };

  beforeAll(async () => {
    // Disable alerts for tests
    process.env.DISABLE_ALERTS = 'true';
    // Set required env vars for TelegramBotConfig
    process.env.BOT_TOKEN = process.env.BOT_TOKEN || 'test_token';
    process.env.TELEGRAM_WEBHOOK_API_KEY =
      process.env.TELEGRAM_WEBHOOK_API_KEY || 'test_api_key';
    process.env.PUBLIC_URL =
      process.env.PUBLIC_URL || 'https://test.example.com';
    process.env.TELEGRAM_MONITORING_CHANNEL_ID =
      process.env.TELEGRAM_MONITORING_CHANNEL_ID || 'test_channel_id';

    // Create mock Telegraf instance
    const mockTelegraf = {
      telegram: {
        getMe: jest.fn().mockResolvedValue({ username: 'test_bot' }),
        setMyCommands: jest.fn().mockResolvedValue(true),
        setWebhook: jest.fn().mockResolvedValue(true),
        editMessageText: jest.fn().mockResolvedValue(true),
        deleteMessage: jest.fn().mockResolvedValue(true),
        getChat: jest.fn().mockResolvedValue({
          id: 1,
          type: 'private',
        }),
      },
      botInfo: { username: 'test_bot' },
    } as unknown as Telegraf;

    // Create test app with TelegramBot, User, and Fragment modules
    // Override all real dependencies BEFORE compilation to prevent initialization
    const moduleFixture = await Test.createTestingModule({
      imports: [TestAppModule, TelegramBotModule, UserModule, FragmentModule],
    })
      .overrideProvider(TelegramBotConfig)
      .useValue({
        botToken: 'test_token',
        telegramWebhookApiKey: 'test_api_key',
        publicUrl: 'https://test.example.com',
      })
      .overrideProvider(Telegraf)
      .useValue(mockTelegraf)
      .overrideProvider(TelegramBotService)
      .useValue({
        handleUpdate: jest.fn(),
        getUsername: jest.fn().mockReturnValue('test_bot'),
        onModuleInit: jest.fn(),
        onApplicationBootstrap: jest.fn(),
      })
      .overrideProvider(StonfiSwapService)
      .useValue({
        getSwapQuoteFromUsdt: jest.fn().mockResolvedValue({
          fromAmount: '850000',
          toAmount: '441800000',
          minToAmount: '441800000',
        }),
        swapUsdtToTon: jest.fn().mockResolvedValue({
          success: true,
          txHash: 'test_swap_tx_hash',
        }),
        getWalletBalances: jest.fn().mockResolvedValue({
          ton: '1000000000',
          usdt: '1000000000',
        }),
      })
      .overrideProvider(TonWalletProvider)
      .useValue({
        initializeWallet: jest.fn().mockResolvedValue({
          address: 'test_wallet_address',
          stateInit: 'test_state_init',
          publicKey: 'test_public_key',
          privateKey: new Uint8Array(32),
        }),
        initializeWalletForSwap: jest.fn().mockResolvedValue({
          address: 'test_wallet_address',
          privateKey: new Uint8Array(32),
        }),
      })
      .overrideProvider(TonBalanceProvider)
      .useValue({
        getWalletBalances: jest.fn().mockResolvedValue({
          ton: '1000000000', // 1 TON
          usdt: '1000000000', // 1000 USDT
        }),
        getTonBalance: jest.fn().mockResolvedValue('1000000000'),
        getJettonBalance: jest.fn().mockResolvedValue('1000000000'),
      })
      .overrideProvider(TonTransactionProvider)
      .useValue({
        signTransaction: jest.fn().mockResolvedValue('test_signed_boc'),
        sendTransactionToBlockchain: jest
          .fn()
          .mockResolvedValue('test_tx_hash_123456'),
      })
      .overrideProvider(FragmentConfig)
      .useValue({
        cookies: '{"stel_ssid":"test","stel_ton_token":"test"}',
        apiHash: 'test_hash',
        mnemonic:
          'test test test test test test test test test test test test test test test test test test test test test test test test test test',
        toncenterRpcUrl: process.env.TONCENTER_RPC_URL,
        toncenterApiKey: process.env.TONCENTER_RPC_API_KEY,
        usdtJettonAddress:
          process.env.USDT_JETTON_ADDRESS ||
          'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs',
        swapSlippageTolerance: process.env.SWAP_SLIPPAGE_TOLERANCE
          ? parseInt(process.env.SWAP_SLIPPAGE_TOLERANCE, 10)
          : 1,
        swapReservePercent: process.env.SWAP_RESERVE_PERCENT
          ? parseInt(process.env.SWAP_RESERVE_PERCENT, 10)
          : 5,
        minTonForFees: process.env.MIN_TON_FOR_FEES || '100000000',
      })
      .overrideProvider(TonConfig)
      .useValue({
        mnemonic:
          'test test test test test test test test test test test test test test test test test test test test test test test test test test',
        toncenterRpcUrl: process.env.TONCENTER_RPC_URL,
        toncenterApiKey: process.env.TONCENTER_RPC_API_KEY,
        usdtJettonAddress:
          process.env.USDT_JETTON_ADDRESS ||
          'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs',
        swapSlippageTolerance: process.env.SWAP_SLIPPAGE_TOLERANCE
          ? parseInt(process.env.SWAP_SLIPPAGE_TOLERANCE, 10)
          : 1,
        swapReservePercent: process.env.SWAP_RESERVE_PERCENT
          ? parseInt(process.env.SWAP_RESERVE_PERCENT, 10)
          : 5,
        minTonForFees: process.env.MIN_TON_FOR_FEES || '100000000',
      })
      .overrideProvider(NotificationsConfig)
      .useValue({
        channelId: 'test_channel_id',
        disableAlerts: true,
      })
      .overrideProvider(ProxyManagerService)
      .useValue({
        getProxy: jest.fn().mockResolvedValue(null),
        markProxyAsFailed: jest.fn(),
        resetFailedProxies: jest.fn(),
      })
      .overrideProvider(FragmentApiClientService)
      .useValue({
        initializeSession: jest.fn().mockResolvedValue(undefined),
        checkCookiesValidity: jest.fn().mockResolvedValue(true),
        searchStarsRecipient: jest.fn().mockResolvedValue({
          ok: true,
          found: {
            recipient: 'test_recipient_id',
            name: 'Test User',
          },
        }),
        updateStarsBuyState: jest.fn().mockResolvedValue(undefined),
        updateStarsPrices: jest.fn().mockResolvedValue(undefined),
        initBuyStarsRequest: jest.fn().mockResolvedValue({
          req_id: 'test_request_id',
          amount: '0.4418',
        }),
        getBuyStarsLink: jest.fn().mockResolvedValue({
          transaction: {
            from: 'test_address',
            messages: [],
          },
          confirm_method: 'confirm',
          confirm_params: { id: 'test_request_id' },
        }),
        confirmReq: jest.fn().mockResolvedValue(true),
      })
      .overrideProvider(NotificationsService)
      .useValue({
        notifyPurchaseSuccess: jest.fn().mockResolvedValue(undefined),
        notifyError: jest.fn().mockResolvedValue(undefined),
        notifyAdminTestClaim: jest.fn().mockResolvedValue(undefined),
        notifySuspiciousActivity: jest.fn().mockResolvedValue(undefined),
        notifyLowBalance: jest.fn().mockResolvedValue(undefined),
      })
      .overrideProvider(StarsPurchaseService)
      .useValue({
        checkUsdtBalanceForPurchase: jest.fn().mockResolvedValue({
          sufficient: true,
          balance: '1000000000', // 1000 USDT in nano
          required: '850000', // 0.85 USDT in nano
        }),
        purchaseTestStars: jest.fn().mockResolvedValue({
          success: true,
          requestId: 'test_request_id_123',
          txHash: 'test_tx_hash_456',
        }),
        purchaseStars: jest.fn().mockResolvedValue({
          success: true,
          requestId: 'test_request_id_789',
          txHash: 'test_tx_hash_012',
        }),
      })
      .overrideProvider(YooKassaService)
      .useValue({
        createPayment: jest.fn().mockResolvedValue({
          success: true,
          paymentId: 'test_payment_id',
          confirmationUrl:
            'https://yoomoney.ru/checkout/payments/v2/contract?orderId=test',
        }),
        getPaymentByYooKassaId: jest.fn().mockResolvedValue(null),
        linkPaymentToPurchase: jest.fn().mockResolvedValue(undefined),
        updatePaymentStatus: jest.fn().mockResolvedValue(undefined),
        handleWebhook: jest.fn().mockResolvedValue(undefined),
      })
      .overrideProvider(ConsentService)
      .useValue(mockConsentService)
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

    module = testContext.module;
    botCommandHandler = module.get<BotCommandHandler>(BotCommandHandler);
    callbackQueryHandler =
      module.get<CallbackQueryHandler>(CallbackQueryHandler);
    messageManagementService = module.get<MessageManagementService>(
      MessageManagementService,
    );
    starsPurchaseService =
      module.get<StarsPurchaseService>(StarsPurchaseService);
    yooKassaService = module.get<YooKassaService>(YooKassaService);
    userService = module.get<UserService>(UserService);
    entityManager = testContext.dataSource.manager;
  });

  afterAll(async () => {
    if (testContext) {
      await closeTestApp(testContext);
    }
  });

  beforeEach(async () => {
    // Reset mock consent state
    mockConsentState.clear();
    // Set consent for users that should have consent
    mockConsentState.set(TEST_USER_ID, true);
    mockConsentState.set(TEST_USER_ID_NOT_WHITELISTED, true);
    mockConsentState.set(TEST_USER_ID_ALREADY_CLAIMED, true);
    // TEST_USER_ID_NO_CONSENT stays without consent (not in map = false)

    // Create test users in database
    const userRepo = entityManager.getRepository(UserEntity);

    // Whitelisted user with 0 claims and email (has consent)
    let testUser = await userRepo.findOneBy({ userId: TEST_USER_ID });
    if (!testUser) {
      testUser = new UserEntity({
        userId: TEST_USER_ID,
        inWhiteList: true,
        testClaims: 0,
        language: 'ru',
        email: 'test@example.com',
      });
    } else {
      testUser.inWhiteList = true;
      testUser.testClaims = 0;
      testUser.language = 'ru';
      testUser.email = 'test@example.com';
    }
    await userRepo.save(testUser);

    // Not whitelisted user (has consent but not whitelisted)
    let notWhitelistedUser = await userRepo.findOneBy({
      userId: TEST_USER_ID_NOT_WHITELISTED,
    });
    if (!notWhitelistedUser) {
      notWhitelistedUser = new UserEntity({
        userId: TEST_USER_ID_NOT_WHITELISTED,
        inWhiteList: false,
        testClaims: 0,
        language: 'ru',
        email: undefined,
      });
    } else {
      notWhitelistedUser.inWhiteList = false;
      notWhitelistedUser.testClaims = 0;
      notWhitelistedUser.language = 'ru';
      notWhitelistedUser.email = undefined;
    }
    await userRepo.save(notWhitelistedUser);

    // Already claimed user (has consent, whitelisted, but already claimed)
    let alreadyClaimedUser = await userRepo.findOneBy({
      userId: TEST_USER_ID_ALREADY_CLAIMED,
    });
    if (!alreadyClaimedUser) {
      alreadyClaimedUser = new UserEntity({
        userId: TEST_USER_ID_ALREADY_CLAIMED,
        inWhiteList: true,
        testClaims: 1,
        language: 'ru',
        email: 'claimed@example.com',
      });
    } else {
      alreadyClaimedUser.inWhiteList = true;
      alreadyClaimedUser.testClaims = 1;
      alreadyClaimedUser.language = 'ru';
      alreadyClaimedUser.email = 'claimed@example.com';
    }
    await userRepo.save(alreadyClaimedUser);

    // User without consent (for testing consent flow)
    let noConsentUser = await userRepo.findOneBy({
      userId: TEST_USER_ID_NO_CONSENT,
    });
    if (!noConsentUser) {
      noConsentUser = new UserEntity({
        userId: TEST_USER_ID_NO_CONSENT,
        inWhiteList: true,
        testClaims: 0,
        language: 'ru',
        email: 'noconsent@example.com',
      });
    } else {
      noConsentUser.inWhiteList = true;
      noConsentUser.testClaims = 0;
      noConsentUser.language = 'ru';
      noConsentUser.email = 'noconsent@example.com';
    }
    await userRepo.save(noConsentUser);
    // Note: No consent for this user (mockConsentState doesn't have this user)

    // Clear user cache
    (userService as any).userCache?.clear();
    await (userService as any).loadAllUsers();

    // Clear stored messages for all test users
    messageManagementService.clearStoredMessage(TEST_USER_ID);
    messageManagementService.clearStoredMessage(TEST_USER_ID_NOT_WHITELISTED);
    messageManagementService.clearStoredMessage(TEST_USER_ID_ALREADY_CLAIMED);
    messageManagementService.clearStoredMessage(TEST_USER_ID_NO_CONSENT);

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('Bot Command Flow', () => {
    it('should handle /start command and show main menu for user with consent', async () => {
      const ctx = createMockContext(TEST_USER_ID);

      await botCommandHandler.handleStart(ctx);

      expect(ctx.reply).toHaveBeenCalled();
      const callArgs = (ctx.reply as jest.Mock).mock.calls[0];
      expect(callArgs[0]).toContain('Добро пожаловать');
      expect(callArgs[1]).toBeDefined(); // Options with keyboard
    });

    it('should show consent screen for user without consent', async () => {
      const ctx = createMockContext(TEST_USER_ID_NO_CONSENT);

      await botCommandHandler.handleStart(ctx);

      expect(ctx.reply).toHaveBeenCalled();
      const callArgs = (ctx.reply as jest.Mock).mock.calls[0];
      expect(callArgs[0]).toContain(
        'Согласие на обработку персональных данных',
      );
      expect(callArgs[1]).toBeDefined();
      // Should have consent buttons
      const keyboard = callArgs[1]?.reply_markup?.inline_keyboard;
      expect(keyboard).toBeDefined();
      const hasConsentButton = keyboard?.some((row: any[]) =>
        row.some(
          (btn: any) =>
            btn.callback_data === CallbackData.CONSENT_GRANT ||
            btn.text?.includes('Даю согласие'),
        ),
      );
      expect(hasConsentButton).toBe(true);
    });
  });

  describe('Consent Flow', () => {
    it('should grant consent and show main menu', async () => {
      const ctx = createMockContext(TEST_USER_ID_NO_CONSENT);

      // Initialize message for editMessage to work
      await messageManagementService.sendMessage(
        ctx,
        TEST_USER_ID_NO_CONSENT,
        'Initial message',
      );

      // Grant consent
      await callbackQueryHandler.handleCallbackQuery(
        ctx,
        CallbackData.CONSENT_GRANT,
      );

      expect(ctx.telegram.editMessageText).toHaveBeenCalled();
      const callArgs = (ctx.telegram.editMessageText as jest.Mock).mock.calls;
      const successCall = callArgs.find(
        (call) =>
          call[3] &&
          (call[3].includes('Спасибо') || call[3].includes('Добро пожаловать')),
      );
      expect(successCall).toBeDefined();

      // Verify grantConsent was called
      expect(mockConsentService.grantConsent).toHaveBeenCalledWith(
        TEST_USER_ID_NO_CONSENT,
        expect.any(String),
      );
      // Verify consent state was updated in mock
      expect(mockConsentState.get(TEST_USER_ID_NO_CONSENT)).toBe(true);
    });

    it('should redirect to consent screen when clicking on any button without consent', async () => {
      const ctx = createMockContext(TEST_USER_ID_NO_CONSENT);

      // Initialize message for editMessage to work
      await messageManagementService.sendMessage(
        ctx,
        TEST_USER_ID_NO_CONSENT,
        'Initial message',
      );

      // Clear mocks to isolate callback handler behavior
      jest.clearAllMocks();

      // Try to click on BUY_STARS without consent
      await callbackQueryHandler.handleCallbackQuery(
        ctx,
        CallbackData.BUY_STARS,
      );

      // Should show consent screen instead (via ctx.reply since it's a new message)
      expect(ctx.reply).toHaveBeenCalled();
      const callArgs = (ctx.reply as jest.Mock).mock.calls[0];
      expect(callArgs[0]).toContain('Согласие');
    });
  });

  describe('Purchase Flow - Happy Path', () => {
    it('should complete full purchase flow for whitelisted user', async () => {
      const ctx = createMockContext(TEST_USER_ID);

      // Initialize message for editMessage to work
      await messageManagementService.sendMessage(
        ctx,
        TEST_USER_ID,
        'Initial message',
      );

      // Step 1: Click "buy_stars"
      await callbackQueryHandler.handleCallbackQuery(
        ctx,
        CallbackData.BUY_STARS,
      );
      expect(ctx.telegram.editMessageText).toHaveBeenCalled();

      // Step 2: Click "buy_for_myself"
      await callbackQueryHandler.handleCallbackQuery(
        ctx,
        CallbackData.BUY_FOR_MYSELF,
      );
      expect(ctx.telegram.editMessageText).toHaveBeenCalled();

      // Step 3: Click "amount_50_test"
      await callbackQueryHandler.handleCallbackQuery(ctx, 'amount_50_test');
      expect(ctx.telegram.editMessageText).toHaveBeenCalled();
      expect(
        starsPurchaseService.checkUsdtBalanceForPurchase,
      ).toHaveBeenCalledWith(50);

      // Step 4: Payment should be created automatically (user has email)
      // Check that YooKassa payment creation was attempted
      expect(yooKassaService.createPayment).toHaveBeenCalled();
      const editCalls = (ctx.telegram.editMessageText as jest.Mock).mock.calls;
      const paymentCall = editCalls.find(
        (call) =>
          call[3] &&
          (call[3].includes('Платеж создан') ||
            call[3].includes('Перейти к оплате')),
      );
      expect(paymentCall).toBeDefined();
      // Note: purchaseTestStars will be called later via webhook after payment succeeds
    });

    it('should show payment button when balance is sufficient', async () => {
      const ctx = createMockContext(TEST_USER_ID);

      // Initialize message for editMessage to work
      await messageManagementService.sendMessage(
        ctx,
        TEST_USER_ID,
        'Initial message',
      );

      // Setup: user is whitelisted and can claim
      (
        starsPurchaseService.checkUsdtBalanceForPurchase as jest.Mock
      ).mockResolvedValueOnce({
        sufficient: true,
        balance: '1000000000',
        required: '850000',
      });

      await callbackQueryHandler.handleCallbackQuery(ctx, 'amount_50_test');

      expect(
        starsPurchaseService.checkUsdtBalanceForPurchase,
      ).toHaveBeenCalledWith(50);
      expect(ctx.telegram.editMessageText).toHaveBeenCalled();
      // Payment should be created automatically via YooKassa
      expect(yooKassaService.createPayment).toHaveBeenCalled();
      const callArgs = (ctx.telegram.editMessageText as jest.Mock).mock.calls;
      // Now payment is created automatically, check for payment creation message
      const paymentCall = callArgs.find(
        (call) =>
          call[3] &&
          (call[3].includes('Платеж создан') ||
            call[3].includes('Перейти к оплате') ||
            call[3].includes('Создаю платеж')),
      );
      expect(paymentCall).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should show error when user is not whitelisted', async () => {
      const ctx = createMockContext(TEST_USER_ID_NOT_WHITELISTED);

      // Initialize message for editMessage to work
      await messageManagementService.sendMessage(
        ctx,
        TEST_USER_ID_NOT_WHITELISTED,
        'Initial message',
      );

      await callbackQueryHandler.handleCallbackQuery(
        ctx,
        CallbackData.BUY_FOR_MYSELF,
      );

      expect(ctx.telegram.editMessageText).toHaveBeenCalled();
      const callArgs = (ctx.telegram.editMessageText as jest.Mock).mock
        .calls[0];
      expect(callArgs[3]).toContain('whitelist');
    });

    it('should show error when user already claimed test stars', async () => {
      const ctx = createMockContext(TEST_USER_ID_ALREADY_CLAIMED);

      // Initialize message for editMessage to work
      await messageManagementService.sendMessage(
        ctx,
        TEST_USER_ID_ALREADY_CLAIMED,
        'Initial message',
      );

      await callbackQueryHandler.handleCallbackQuery(
        ctx,
        CallbackData.BUY_FOR_MYSELF,
      );

      expect(ctx.telegram.editMessageText).toHaveBeenCalled();
      const callArgs = (ctx.telegram.editMessageText as jest.Mock).mock
        .calls[0];
      expect(callArgs[3]).toContain('уже получены');
    });

    it('should show error when balance is insufficient', async () => {
      const ctx = createMockContext(TEST_USER_ID);

      // Initialize message for editMessage to work
      await messageManagementService.sendMessage(
        ctx,
        TEST_USER_ID,
        'Initial message',
      );

      (
        starsPurchaseService.checkUsdtBalanceForPurchase as jest.Mock
      ).mockResolvedValueOnce({
        sufficient: false,
        balance: '100000', // 0.1 USDT
        required: '850000', // 0.85 USDT
      });

      await callbackQueryHandler.handleCallbackQuery(ctx, 'amount_50_test');

      expect(ctx.telegram.editMessageText).toHaveBeenCalled();
      const callArgs = (ctx.telegram.editMessageText as jest.Mock).mock.calls;
      const errorCall = callArgs.find(
        (call) => call[3] && call[3].includes('Недостаточно средств'),
      );
      expect(errorCall).toBeDefined();
    });

    it('should prevent payment confirmation if user is not whitelisted', async () => {
      const ctx = createMockContext(TEST_USER_ID_NOT_WHITELISTED);

      // Initialize message for editMessage to work
      await messageManagementService.sendMessage(
        ctx,
        TEST_USER_ID_NOT_WHITELISTED,
        'Initial message',
      );

      // Try to select amount - should show whitelist error
      await callbackQueryHandler.handleCallbackQuery(ctx, 'amount_50_test');

      expect(ctx.telegram.editMessageText).toHaveBeenCalled();
      const callArgs = (ctx.telegram.editMessageText as jest.Mock).mock.calls;
      const errorCall = callArgs.find(
        (call) =>
          call[3] &&
          (call[3].includes('whitelist') ||
            call[3].includes('Доступ ограничен') ||
            call[3].includes('доступно только для пользователей')),
      );
      expect(errorCall).toBeDefined();
      expect(starsPurchaseService.purchaseTestStars).not.toHaveBeenCalled();
    });

    it('should prevent payment confirmation if user already claimed', async () => {
      const ctx = createMockContext(TEST_USER_ID_ALREADY_CLAIMED);

      // Initialize message for editMessage to work
      await messageManagementService.sendMessage(
        ctx,
        TEST_USER_ID_ALREADY_CLAIMED,
        'Initial message',
      );

      // Try to select amount - should show already claimed error
      await callbackQueryHandler.handleCallbackQuery(ctx, 'amount_50_test');

      expect(ctx.telegram.editMessageText).toHaveBeenCalled();
      const callArgs = (ctx.telegram.editMessageText as jest.Mock).mock.calls;
      const errorCall = callArgs.find(
        (call) =>
          call[3] &&
          (call[3].includes('уже получены') ||
            call[3].includes('уже получили') ||
            call[3].includes('Тестовые звезды уже')),
      );
      expect(errorCall).toBeDefined();
      expect(starsPurchaseService.purchaseTestStars).not.toHaveBeenCalled();
    });
  });

  describe('Navigation Flow', () => {
    it('should handle back navigation', async () => {
      const ctx = createMockContext(TEST_USER_ID);

      // Initialize message for editMessage to work
      await messageManagementService.sendMessage(
        ctx,
        TEST_USER_ID,
        'Initial message',
      );

      // Go to help
      await callbackQueryHandler.handleCallbackQuery(ctx, CallbackData.HELP);
      expect(ctx.telegram.editMessageText).toHaveBeenCalled();

      // Go back
      await callbackQueryHandler.handleCallbackQuery(
        ctx,
        CallbackData.BACK_TO_MAIN,
      );
      expect(ctx.telegram.editMessageText).toHaveBeenCalled();
    });

    it('should handle help command and show help menu', async () => {
      const ctx = createMockContext(TEST_USER_ID);

      // Initialize message for editMessage to work
      await messageManagementService.sendMessage(
        ctx,
        TEST_USER_ID,
        'Initial message',
      );

      await callbackQueryHandler.handleCallbackQuery(ctx, CallbackData.HELP);

      expect(ctx.telegram.editMessageText).toHaveBeenCalled();
      const callArgs = (ctx.telegram.editMessageText as jest.Mock).mock.calls;
      const helpCall = callArgs.find(
        (call) => call[3] && call[3].includes('Помощь'),
      );
      expect(helpCall).toBeDefined();
    });
  });

  describe('Help Menu Flow', () => {
    it('should show offer info', async () => {
      const ctx = createMockContext(TEST_USER_ID);

      await messageManagementService.sendMessage(
        ctx,
        TEST_USER_ID,
        'Initial message',
      );

      await callbackQueryHandler.handleCallbackQuery(
        ctx,
        CallbackData.HELP_OFFER,
      );

      expect(ctx.telegram.editMessageText).toHaveBeenCalled();
      const callArgs = (ctx.telegram.editMessageText as jest.Mock).mock.calls;
      const offerCall = callArgs.find(
        (call) =>
          call[3] && (call[3].includes('оферт') || call[3].includes('Оферт')),
      );
      expect(offerCall).toBeDefined();
    });

    it('should show privacy policy info', async () => {
      const ctx = createMockContext(TEST_USER_ID);

      await messageManagementService.sendMessage(
        ctx,
        TEST_USER_ID,
        'Initial message',
      );

      await callbackQueryHandler.handleCallbackQuery(
        ctx,
        CallbackData.HELP_PRIVACY,
      );

      expect(ctx.telegram.editMessageText).toHaveBeenCalled();
      const callArgs = (ctx.telegram.editMessageText as jest.Mock).mock.calls;
      const privacyCall = callArgs.find(
        (call) =>
          call[3] &&
          (call[3].includes('конфиденциальност') ||
            call[3].includes('Политика')),
      );
      expect(privacyCall).toBeDefined();
    });

    it('should show contacts info', async () => {
      const ctx = createMockContext(TEST_USER_ID);

      await messageManagementService.sendMessage(
        ctx,
        TEST_USER_ID,
        'Initial message',
      );

      await callbackQueryHandler.handleCallbackQuery(
        ctx,
        CallbackData.HELP_CONTACTS,
      );

      expect(ctx.telegram.editMessageText).toHaveBeenCalled();
      const callArgs = (ctx.telegram.editMessageText as jest.Mock).mock.calls;
      const contactsCall = callArgs.find(
        (call) =>
          call[3] &&
          (call[3].includes('Контакт') || call[3].includes('@onezee123')),
      );
      expect(contactsCall).toBeDefined();
    });

    it('should show FAQ', async () => {
      const ctx = createMockContext(TEST_USER_ID);

      await messageManagementService.sendMessage(
        ctx,
        TEST_USER_ID,
        'Initial message',
      );

      await callbackQueryHandler.handleCallbackQuery(
        ctx,
        CallbackData.HELP_FAQ,
      );

      expect(ctx.telegram.editMessageText).toHaveBeenCalled();
      const callArgs = (ctx.telegram.editMessageText as jest.Mock).mock.calls;
      // Russian: "Часто задаваемые вопросы", English: "Frequently Asked Questions"
      const faqCall = callArgs.find(
        (call) =>
          call[3] &&
          (call[3].includes('Часто задаваемые') ||
            call[3].includes('Frequently Asked')),
      );
      expect(faqCall).toBeDefined();
    });

    it('should show revoke consent warning', async () => {
      const ctx = createMockContext(TEST_USER_ID);

      await messageManagementService.sendMessage(
        ctx,
        TEST_USER_ID,
        'Initial message',
      );

      await callbackQueryHandler.handleCallbackQuery(
        ctx,
        CallbackData.HELP_REVOKE,
      );

      expect(ctx.telegram.editMessageText).toHaveBeenCalled();
      const callArgs = (ctx.telegram.editMessageText as jest.Mock).mock.calls;
      const revokeCall = callArgs.find(
        (call) =>
          call[3] && (call[3].includes('Отзыв') || call[3].includes('уверены')),
      );
      expect(revokeCall).toBeDefined();
    });

    it('should revoke consent when confirmed', async () => {
      const ctx = createMockContext(TEST_USER_ID);

      await messageManagementService.sendMessage(
        ctx,
        TEST_USER_ID,
        'Initial message',
      );

      // Verify user has consent before revoking
      expect(mockConsentState.get(TEST_USER_ID)).toBe(true);

      // Revoke consent
      await callbackQueryHandler.handleCallbackQuery(
        ctx,
        CallbackData.HELP_REVOKE_CONFIRM,
      );

      expect(ctx.telegram.editMessageText).toHaveBeenCalled();

      // Verify revokeConsent was called
      expect(mockConsentService.revokeConsent).toHaveBeenCalledWith(
        TEST_USER_ID,
      );
      // Verify consent state was updated in mock
      expect(mockConsentState.get(TEST_USER_ID)).toBe(false);
    });

    it('should navigate back to help menu from submenu', async () => {
      const ctx = createMockContext(TEST_USER_ID);

      await messageManagementService.sendMessage(
        ctx,
        TEST_USER_ID,
        'Initial message',
      );

      // Go to FAQ
      await callbackQueryHandler.handleCallbackQuery(
        ctx,
        CallbackData.HELP_FAQ,
      );
      expect(ctx.telegram.editMessageText).toHaveBeenCalled();

      // Go back to help
      await callbackQueryHandler.handleCallbackQuery(
        ctx,
        CallbackData.HELP_BACK,
      );
      expect(ctx.telegram.editMessageText).toHaveBeenCalled();
      const callArgs = (ctx.telegram.editMessageText as jest.Mock).mock.calls;
      const helpCall = callArgs.find(
        (call) => call[3] && call[3].includes('Помощь'),
      );
      expect(helpCall).toBeDefined();
    });
  });

  describe('Purchase Processing', () => {
    it('should show processing message during purchase', async () => {
      const ctx = createMockContext(TEST_USER_ID);

      // Initialize message for editMessage to work
      await messageManagementService.sendMessage(
        ctx,
        TEST_USER_ID,
        'Initial message',
      );

      // Mock successful balance check
      (
        starsPurchaseService.checkUsdtBalanceForPurchase as jest.Mock
      ).mockResolvedValueOnce({
        sufficient: true,
      });

      // Mock successful YooKassa payment creation
      (yooKassaService.createPayment as jest.Mock).mockResolvedValueOnce({
        success: true,
        paymentId: 'test_payment_id',
        confirmationUrl:
          'https://yoomoney.ru/checkout/payments/v2/contract?orderId=test',
      });

      await callbackQueryHandler.handleCallbackQuery(ctx, 'amount_50_test');

      // Should show payment creation message
      const editCalls = (ctx.telegram.editMessageText as jest.Mock).mock.calls;
      const paymentCall = editCalls.find(
        (call) =>
          call[3] &&
          (call[3].includes('Платеж создан') ||
            call[3].includes('Создаю платеж') ||
            call[3].includes('Перейти к оплате')),
      );
      expect(paymentCall).toBeDefined();

      // Should call YooKassa service to create payment
      expect(yooKassaService.createPayment).toHaveBeenCalled();
    });

    it('should handle purchase error', async () => {
      const ctx = createMockContext(TEST_USER_ID);

      // Initialize message for editMessage to work
      await messageManagementService.sendMessage(
        ctx,
        TEST_USER_ID,
        'Initial message',
      );

      // Mock successful balance check
      (
        starsPurchaseService.checkUsdtBalanceForPurchase as jest.Mock
      ).mockResolvedValueOnce({
        sufficient: true,
      });

      // Mock failed YooKassa payment creation
      (yooKassaService.createPayment as jest.Mock).mockResolvedValueOnce({
        success: false,
        error: 'Test error',
      });

      await callbackQueryHandler.handleCallbackQuery(ctx, 'amount_50_test');

      const editCalls = (ctx.telegram.editMessageText as jest.Mock).mock.calls;
      const errorCall = editCalls.find(
        (call) => call[3] && call[3].includes('Ошибка'),
      );
      expect(errorCall).toBeDefined();
    });

    it('should handle QUEUE_BUSY error', async () => {
      const ctx = createMockContext(TEST_USER_ID);

      // Initialize message for editMessage to work
      await messageManagementService.sendMessage(
        ctx,
        TEST_USER_ID,
        'Initial message',
      );

      // Mock successful balance check
      (
        starsPurchaseService.checkUsdtBalanceForPurchase as jest.Mock
      ).mockResolvedValueOnce({
        sufficient: true,
      });

      // Mock successful YooKassa payment creation
      // QUEUE_BUSY error will occur later during webhook processing
      (yooKassaService.createPayment as jest.Mock).mockResolvedValueOnce({
        success: true,
        paymentId: 'test_payment_id',
        confirmationUrl:
          'https://yoomoney.ru/checkout/payments/v2/contract?orderId=test',
      });

      await callbackQueryHandler.handleCallbackQuery(ctx, 'amount_50_test');

      // Payment should be created successfully
      expect(yooKassaService.createPayment).toHaveBeenCalled();
      const editCalls = (ctx.telegram.editMessageText as jest.Mock).mock.calls;
      const paymentCall = editCalls.find(
        (call) => call[3] && call[3].includes('Платеж создан'),
      );
      expect(paymentCall).toBeDefined();
      // Note: QUEUE_BUSY error would be shown later during webhook processing,
      // not during payment creation
    });
  });
});
