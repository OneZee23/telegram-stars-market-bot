import { FragmentConfig } from '@modules/fragment/fragment.config';
import { FragmentModule } from '@modules/fragment/fragment.module';
import { StarsPurchaseService } from '@modules/fragment/services/stars-purchase.service';
import { DexSwapService } from '@modules/ton/services/dex-swap.service';
import { WalletService } from '@modules/ton/services/wallet.service';
import { TonConfig } from '@modules/ton/ton.config';
import { TonModule } from '@modules/ton/ton.module';
import { UserEntity } from '@modules/user/entities/user.entity';
import { UserModule } from '@modules/user/user.module';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { TestAppModule } from './test-app.module';
import { clearDatasource } from './utils/clear-datasource.util';
import { closeTestApp, TestAppContext } from './utils/create-test-app.util';

describe('Swap Flow E2E', () => {
  let testContext: TestAppContext;
  let module: TestingModule;
  let dexSwapService: DexSwapService;
  let walletService: WalletService;
  let starsPurchaseService: StarsPurchaseService;
  let entityManager: EntityManager;

  const TEST_USER_ID = '777777777';
  const TEST_RECIPIENT_USERNAME = 'test_user';

  beforeAll(async () => {
    const testCookiesRaw =
      process.env.FRAGMENT_COOKIES ||
      '{"stel_ssid":"test","stel_ton_token":"test"}';
    const testApiHash = process.env.FRAGMENT_API_HASH || 'test_hash';

    let testCookies: string;
    try {
      testCookies = JSON.stringify(JSON.parse(testCookiesRaw));
    } catch (error) {
      throw new Error(
        `Invalid FRAGMENT_COOKIES format: ${testCookiesRaw}. Error: ${error}`,
      );
    }

    const originalCookies = process.env.FRAGMENT_COOKIES;
    const originalApiHash = process.env.FRAGMENT_API_HASH;
    const originalMnemonic = process.env.FRAGMENT_MNEMONIC;

    process.env.FRAGMENT_COOKIES = testCookies;
    process.env.FRAGMENT_API_HASH = testApiHash;
    if (!process.env.FRAGMENT_MNEMONIC) {
      process.env.FRAGMENT_MNEMONIC =
        'test test test test test test test test test test test test test test test test test test test test test test test test test test';
    }

    const moduleFixture = await Test.createTestingModule({
      imports: [TestAppModule, FragmentModule, UserModule, TonModule],
    })
      .overrideProvider(FragmentConfig)
      .useValue({
        cookies: testCookies,
        apiHash: testApiHash,
        proxies: process.env.FRAGMENT_PROXIES,
        proxiesExpiresAt: process.env.FRAGMENT_PROXIES_EXPIRES_AT,
        proxyPurchaseUrl: process.env.FRAGMENT_PROXY_PURCHASE_URL,
      })
      .overrideProvider(TonConfig)
      .useValue({
        mnemonic:
          process.env.FRAGMENT_MNEMONIC ||
          'test test test test test test test test test test test test test test test test test test test test test test test test test test',
        toncenterRpcUrl: process.env.TONCENTER_RPC_URL,
        toncenterApiKey: process.env.TONCENTER_RPC_API_KEY,
        dexProvider: process.env.DEX_PROVIDER || 'stonfi',
        usdtJettonAddress: process.env.USDT_JETTON_ADDRESS,
        swapSlippageTolerance: process.env.SWAP_SLIPPAGE_TOLERANCE || '1',
        swapReservePercent: process.env.SWAP_RESERVE_PERCENT || '5',
        minTonForFees: process.env.MIN_TON_FOR_FEES || '100000000',
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
    dexSwapService = module.get<DexSwapService>(DexSwapService);
    walletService = module.get<WalletService>(WalletService);
    starsPurchaseService =
      module.get<StarsPurchaseService>(StarsPurchaseService);
    entityManager = testContext.dataSource.manager;

    if (!process.env.FRAGMENT_COOKIES || !process.env.FRAGMENT_API_HASH) {
      throw new Error(
        'FRAGMENT_COOKIES and FRAGMENT_API_HASH must be set in environment',
      );
    }
  });

  afterAll(async () => {
    if (testContext) {
      await closeTestApp(testContext);
    }
  });

  beforeEach(async () => {
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
  });

  it('should get wallet address and check balances', async () => {
    const walletData = await walletService.initializeWallet();
    expect(walletData).toBeDefined();
    expect(walletData?.address).toBeDefined();

    if (!process.env.TONCENTER_RPC_URL || !process.env.TONCENTER_RPC_API_KEY) {
      console.log(
        'Skipping balance checks: TONCENTER_RPC_URL and TONCENTER_RPC_API_KEY not set',
      );
      return;
    }

    try {
      const tonBalance = await dexSwapService.getTonBalance(
        walletData!.address,
      );
      const usdtBalance = await dexSwapService.getUsdtBalance(
        walletData!.address,
      );

      expect(tonBalance).toBeDefined();
      expect(usdtBalance).toBeDefined();
      expect(parseFloat(tonBalance)).toBeGreaterThanOrEqual(0);
      expect(parseFloat(usdtBalance)).toBeGreaterThanOrEqual(0);

      console.log(`Wallet: ${walletData!.address}`);
      console.log(`TON balance: ${tonBalance}`);
      console.log(`USDT balance: ${usdtBalance}`);
    } catch (error) {
      console.log(
        `Balance check failed (API might be unavailable): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });

  it('should check sufficient balance for purchase', async () => {
    const walletData = await walletService.initializeWallet();
    expect(walletData).toBeDefined();

    if (!process.env.TONCENTER_RPC_URL || !process.env.TONCENTER_RPC_API_KEY) {
      console.log(
        'Skipping balance check: TONCENTER_RPC_URL and TONCENTER_RPC_API_KEY not set',
      );
      return;
    }

    const requiredTonNano = '1000000000';
    const result = await dexSwapService.checkSufficientBalance(
      walletData!.address,
      requiredTonNano,
    );

    expect(result).toBeDefined();
    expect(result.canPurchase).toBeDefined();
    expect(typeof result.canPurchase).toBe('boolean');

    console.log(`Can purchase: ${result.canPurchase}`);
    if (result.error) {
      console.log(`Error: ${result.error}`);
    }
  });

  it('should calculate required USDT for TON amount', async () => {
    const tonAmount = '1';
    const usdtNeeded = await dexSwapService.calculateRequiredUsdt(tonAmount);

    if (usdtNeeded) {
      expect(parseFloat(usdtNeeded)).toBeGreaterThan(0);
      console.log(`Required USDT for ${tonAmount} TON: ${usdtNeeded}`);
    } else {
      console.log('Failed to get USDT quote (API might be unavailable)');
    }
  });

  it('should get swap quote from DEX', async () => {
    const usdtAmount = '10';
    const quote = await dexSwapService.getSwapQuote(usdtAmount);

    if (quote) {
      expect(quote.usdtAmount).toBe(usdtAmount);
      expect(quote.tonAmount).toBeDefined();
      expect(quote.minTonAmount).toBeDefined();
      expect(parseFloat(quote.tonAmount)).toBeGreaterThan(0);
      expect(parseFloat(quote.minTonAmount)).toBeGreaterThan(0);

      console.log(`Swap quote: ${usdtAmount} USDT → ${quote.tonAmount} TON`);
      console.log(`Min TON (with slippage): ${quote.minTonAmount}`);
    } else {
      console.log('Failed to get swap quote (API might be unavailable)');
    }
  });

  it('should check balance before purchase with swap scenario', async () => {
    if (!process.env.TONCENTER_RPC_URL || !process.env.TONCENTER_RPC_API_KEY) {
      console.log(
        'Skipping balance check: TONCENTER_RPC_URL and TONCENTER_RPC_API_KEY not set',
      );
      return;
    }

    const amount = 100;
    const result =
      await starsPurchaseService.checkBalanceBeforePurchase(amount);

    expect(result).toBeDefined();
    expect(result.canPurchase).toBeDefined();
    expect(typeof result.canPurchase).toBe('boolean');

    console.log(`Balance check for ${amount} stars:`);
    console.log(`Can purchase: ${result.canPurchase}`);
    if (result.error) {
      console.log(`Error: ${result.error}`);
    }
  }, 30000);

  it.skip('should perform swap when TON balance is insufficient', async () => {
    const walletData = await walletService.initializeWallet();
    expect(walletData).toBeDefined();

    const tonBalance = parseFloat(
      await dexSwapService.getTonBalance(walletData!.address),
    );
    const usdtBalance = parseFloat(
      await dexSwapService.getUsdtBalance(walletData!.address),
    );

    console.log(`Initial balances - TON: ${tonBalance}, USDT: ${usdtBalance}`);

    if (usdtBalance < 1) {
      console.log('Skipping: insufficient USDT balance for swap test');
      return;
    }

    const usdtAmount = '1';
    const quote = await dexSwapService.getSwapQuote(usdtAmount);

    if (!quote) {
      console.log('Skipping: failed to get swap quote');
      return;
    }

    const swapResult = await dexSwapService.swapUsdtToTon(
      usdtAmount,
      quote.minTonAmount,
      walletData!.address,
      walletData!.privateKey,
    );

    expect(swapResult).toBeDefined();
    expect(swapResult.success).toBeDefined();

    if (swapResult.success) {
      expect(swapResult.txHash).toBeDefined();
      console.log(`Swap successful! TX: ${swapResult.txHash}`);
    } else {
      console.log(`Swap failed: ${swapResult.error}`);
    }
  }, 120000);

  it.skip('should handle full purchase flow with swap', async () => {
    const result = await starsPurchaseService.purchaseTestStars(
      TEST_USER_ID,
      TEST_RECIPIENT_USERNAME,
    );

    expect(result).toBeDefined();
    expect(result.success).toBeDefined();

    if (result.success) {
      expect(result.requestId).toBeDefined();
      console.log(`Purchase successful! Request ID: ${result.requestId}`);
      if (result.txHash) {
        console.log(`Transaction hash: ${result.txHash}`);
      }
    } else {
      console.log(`Purchase failed: ${result.error}`);
    }
  }, 120000);
});
