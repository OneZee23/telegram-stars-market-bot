import { FragmentConfig } from '@modules/fragment/fragment.config';
import { FragmentModule } from '@modules/fragment/fragment.module';
import { FragmentApiClientService } from '@modules/fragment/services/fragment-api-client.service';
import { ProxyManagerService } from '@modules/fragment/services/proxy-manager.service';
import { StarsPurchaseService } from '@modules/fragment/services/stars-purchase.service';
import {
  buildPaymentCallback,
  CallbackData,
} from '@modules/gateway/constants/callback-data.constants';
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
import { UserModule } from '@modules/user/user.module';
import { UserService } from '@modules/user/user.service';
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
  let userService: UserService;
  let entityManager: EntityManager;

  // Test configuration
  const TEST_USER_ID = '999999999';
  const TEST_USERNAME = 'test_user';
  const TEST_USER_ID_NOT_WHITELISTED = '888888888';
  const TEST_USER_ID_ALREADY_CLAIMED = '777777777';

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
    userService = module.get<UserService>(UserService);
    entityManager = testContext.dataSource.manager;
  });

  afterAll(async () => {
    if (testContext) {
      await closeTestApp(testContext);
    }
  });

  beforeEach(async () => {
    // Create test users in database
    const userRepo = entityManager.getRepository(UserEntity);

    // Whitelisted user with 0 claims
    let testUser = await userRepo.findOneBy({ userId: TEST_USER_ID });
    if (!testUser) {
      testUser = new UserEntity({
        userId: TEST_USER_ID,
        inWhiteList: true,
        testClaims: 0,
        language: 'ru', // Set Russian language for tests
      });
    } else {
      testUser.inWhiteList = true;
      testUser.testClaims = 0;
      testUser.language = 'ru'; // Set Russian language for tests
    }
    await userRepo.save(testUser);

    // Not whitelisted user
    let notWhitelistedUser = await userRepo.findOneBy({
      userId: TEST_USER_ID_NOT_WHITELISTED,
    });
    if (!notWhitelistedUser) {
      notWhitelistedUser = new UserEntity({
        userId: TEST_USER_ID_NOT_WHITELISTED,
        inWhiteList: false,
        testClaims: 0,
        language: 'ru', // Set Russian language for tests
      });
    } else {
      notWhitelistedUser.inWhiteList = false;
      notWhitelistedUser.testClaims = 0;
      notWhitelistedUser.language = 'ru'; // Set Russian language for tests
    }
    await userRepo.save(notWhitelistedUser);

    // Already claimed user
    let alreadyClaimedUser = await userRepo.findOneBy({
      userId: TEST_USER_ID_ALREADY_CLAIMED,
    });
    if (!alreadyClaimedUser) {
      alreadyClaimedUser = new UserEntity({
        userId: TEST_USER_ID_ALREADY_CLAIMED,
        inWhiteList: true,
        testClaims: 1, // Already claimed
        language: 'ru', // Set Russian language for tests
      });
    } else {
      alreadyClaimedUser.inWhiteList = true;
      alreadyClaimedUser.testClaims = 1;
      alreadyClaimedUser.language = 'ru'; // Set Russian language for tests
    }
    await userRepo.save(alreadyClaimedUser);

    // Clear user cache to ensure language is updated from context
    // Access private cache through reflection or force reload
    (userService as any).userCache?.clear();
    await (userService as any).loadAllUsers();

    // Clear stored messages for all test users
    messageManagementService.clearStoredMessage(TEST_USER_ID);
    messageManagementService.clearStoredMessage(TEST_USER_ID_NOT_WHITELISTED);
    messageManagementService.clearStoredMessage(TEST_USER_ID_ALREADY_CLAIMED);

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('Bot Command Flow', () => {
    it('should handle /start command and show main menu', async () => {
      const ctx = createMockContext(TEST_USER_ID);

      await botCommandHandler.handleStart(ctx);

      expect(ctx.reply).toHaveBeenCalled();
      const callArgs = (ctx.reply as jest.Mock).mock.calls[0];
      expect(callArgs[0]).toContain('Добро пожаловать');
      expect(callArgs[1]).toBeDefined(); // Options with keyboard
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

      // Step 4: Click "confirm_payment_50"
      await callbackQueryHandler.handleCallbackQuery(
        ctx,
        buildPaymentCallback(50),
      );
      expect(ctx.telegram.editMessageText).toHaveBeenCalled();
      expect(starsPurchaseService.purchaseTestStars).toHaveBeenCalledWith(
        TEST_USER_ID,
        TEST_USERNAME,
      );
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
      const callArgs = (ctx.telegram.editMessageText as jest.Mock).mock.calls;
      const paymentCall = callArgs.find(
        (call) => call[3] && call[3].includes('Оплата'),
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

      await callbackQueryHandler.handleCallbackQuery(
        ctx,
        buildPaymentCallback(50),
      );

      expect(ctx.telegram.editMessageText).toHaveBeenCalled();
      const callArgs = (ctx.telegram.editMessageText as jest.Mock).mock
        .calls[0];
      expect(callArgs[3]).toContain('whitelist');
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

      await callbackQueryHandler.handleCallbackQuery(
        ctx,
        buildPaymentCallback(50),
      );

      expect(ctx.telegram.editMessageText).toHaveBeenCalled();
      const callArgs = (ctx.telegram.editMessageText as jest.Mock).mock.calls;
      const errorCall = callArgs.find(
        (call) => call[3] && call[3].includes('уже получены'),
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

    it('should handle help command', async () => {
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

      // Mock successful purchase
      (
        starsPurchaseService.purchaseTestStars as jest.Mock
      ).mockResolvedValueOnce({
        success: true,
        requestId: 'test_request_id',
      });

      await callbackQueryHandler.handleCallbackQuery(ctx, 'amount_50_test');
      await callbackQueryHandler.handleCallbackQuery(
        ctx,
        buildPaymentCallback(50),
      );

      // Should show processing message
      const editCalls = (ctx.telegram.editMessageText as jest.Mock).mock.calls;
      const processingCall = editCalls.find(
        (call) => call[3] && call[3].includes('Идет покупка'),
      );
      expect(processingCall).toBeDefined();

      // Should show success message
      const successCall = editCalls.find((call) =>
        call[3].includes('Спасибо за тестирование'),
      );
      expect(successCall).toBeDefined();
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

      // Mock failed purchase
      (
        starsPurchaseService.purchaseTestStars as jest.Mock
      ).mockResolvedValueOnce({
        success: false,
        error: 'Test error',
      });

      await callbackQueryHandler.handleCallbackQuery(ctx, 'amount_50_test');
      await callbackQueryHandler.handleCallbackQuery(
        ctx,
        buildPaymentCallback(50),
      );

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

      // Mock QUEUE_BUSY error
      (
        starsPurchaseService.purchaseTestStars as jest.Mock
      ).mockResolvedValueOnce({
        success: false,
        error: 'QUEUE_BUSY',
      });

      await callbackQueryHandler.handleCallbackQuery(ctx, 'amount_50_test');
      await callbackQueryHandler.handleCallbackQuery(
        ctx,
        buildPaymentCallback(50),
      );

      const editCalls = (ctx.telegram.editMessageText as jest.Mock).mock.calls;
      const busyCall = editCalls.find(
        (call) => call[3] && call[3].includes('Очередь занята'),
      );
      expect(busyCall).toBeDefined();
    });
  });
});
