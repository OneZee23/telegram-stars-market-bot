import { ADMIN_USER_ID } from '@common/constants/admin.constants';
import { NotificationsService } from '@modules/notifications/notifications.service';
import { StonfiSwapService } from '@modules/ton/providers/stonfi-swap.provider';
import { TonBalanceProvider } from '@modules/ton/providers/ton-balance.provider';
import { TonTransactionProvider } from '@modules/ton/providers/ton-transaction.provider';
import { TonWalletProvider } from '@modules/ton/providers/ton-wallet.provider';
import { TonConfig } from '@modules/ton/ton.config';
import { Transaction, WalletData } from '@modules/ton/ton.iface';
import { WhitelistService } from '@modules/user/services/whitelist.service';
import { Injectable, Logger } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import {
  StarsPurchaseEntity,
  StarsPurchaseStatus,
} from '../entities/stars-purchase.entity';
import { FragmentApiClientService } from './fragment-api-client.service';

/**
 * Result of stars purchase operation
 */
export interface PurchaseResult {
  success: boolean;
  requestId?: string;
  txHash?: string;
  error?: string;
}

/**
 * Service for purchasing Telegram Stars through Fragment API
 * Handles the complete flow: authentication, price updates, transaction creation and confirmation
 */

@Injectable()
export class StarsPurchaseService {
  private readonly logger = new Logger(StarsPurchaseService.name);

  private readonly MIN_STARS = 50;

  private readonly MAX_STARS = 1000000;

  private readonly MAX_RETRIES = 3;

  private readonly TRANSACTION_WAIT_TIME_MS = 3000;

  private readonly PRICE_PER_STAR_RUB = 1.244;

  /**
   * Fixed price for 50 stars on Fragment (in USD)
   * We use 0.85 USDT with reserve for 50 stars
   */
  private readonly PRICE_50_STARS_USD = 0.75;

  private readonly USDT_RESERVE_MULTIPLIER = 1.133; // 0.85 / 0.75 = 1.133

  private startTime?: number;

  // Simple flag to track if a purchase is currently being processed
  // TODO: Replace with RabbitMQ or similar message queue for production
  private isProcessingPurchase = false;

  constructor(
    private readonly apiClient: FragmentApiClientService,
    private readonly whitelistService: WhitelistService,
    private readonly tonConfig: TonConfig,
    private readonly notificationsService: NotificationsService,
    private readonly stonfiSwapService: StonfiSwapService,
    private readonly tonWalletProvider: TonWalletProvider,
    private readonly tonTransactionProvider: TonTransactionProvider,
    private readonly tonBalanceProvider: TonBalanceProvider,
    @InjectEntityManager()
    private readonly em: EntityManager,
  ) {}

  /**
   * Purchase stars for a recipient
   * @param userId Telegram user ID who initiated the purchase
   * @param recipientUsername Telegram username (with or without @)
   * @param amount Amount of stars to purchase (50-1000000)
   * @param hideSender Whether to hide sender (0 or 1)
   * @returns Purchase result with request ID and transaction hash
   */
  async purchaseStars(
    userId: string,
    recipientUsername: string,
    amount: number,
    hideSender: number = 0, // eslint-disable-line @typescript-eslint/no-unused-vars
    isTestPurchase: boolean = false,
  ): Promise<PurchaseResult> {
    // Check if a purchase is currently being processed
    // TODO: Replace with RabbitMQ queue status check for production
    if (this.isProcessingPurchase) {
      this.logger.warn(
        `Purchase request rejected: another purchase is currently being processed`,
      );
      return {
        success: false,
        error: 'QUEUE_BUSY',
      };
    }

    // Mark as processing
    this.isProcessingPurchase = true;

    const startTime = Date.now();
    this.startTime = startTime;
    const purchaseRepo = this.em.getRepository(StarsPurchaseEntity);

    const purchaseRecord = purchaseRepo.create({
      userId,
      recipientUsername: recipientUsername.replace('@', ''),
      starsAmount: amount,
      status: StarsPurchaseStatus.PENDING,
    });
    await purchaseRepo.save(purchaseRecord);

    try {
      // Validate amount
      if (amount < this.MIN_STARS || amount > this.MAX_STARS) {
        throw new Error(
          `Amount must be between ${this.MIN_STARS} and ${this.MAX_STARS} stars`,
        );
      }

      this.logger.log(
        `User ${userId} initiated purchase: ${amount} stars for @${recipientUsername.replace('@', '')}`,
      );

      // 0. Check USDT balance before starting purchase (final check after payment)
      // This protects against concurrent purchases that might deplete the balance
      this.logger.debug('Checking USDT balance before purchase...');
      const balanceCheck = await this.checkUsdtBalanceForPurchase(amount);
      if (!balanceCheck.sufficient) {
        const balanceFormatted = balanceCheck.balance
          ? (Number(BigInt(balanceCheck.balance)) / 1e6).toFixed(2)
          : '0';
        const requiredFormatted = balanceCheck.required
          ? (Number(BigInt(balanceCheck.required)) / 1e6).toFixed(2)
          : 'unknown';
        throw new Error(
          `Insufficient funds. Required: ${requiredFormatted} USDT, Available: ${balanceFormatted} USDT. Please contact administrator.`,
        );
      }

      // 1. Initialize session
      this.logger.debug('Initializing Fragment session...');
      await this.apiClient.initializeSession();

      // 2. Check cookies validity
      const isValid = await this.apiClient.checkCookiesValidity();
      if (!isValid) {
        throw new Error(
          'Fragment cookies are invalid or expired. Please update FRAGMENT_COOKIES and FRAGMENT_API_HASH',
        );
      }

      // 3. Search recipient
      this.logger.debug(`Searching for recipient: ${recipientUsername}`);
      const recipientResult =
        await this.apiClient.searchStarsRecipient(recipientUsername);

      if (!recipientResult.ok || !recipientResult.found) {
        throw new Error(`Recipient not found: ${recipientUsername}`);
      }

      const { recipient } = recipientResult.found;
      this.logger.log(
        `Found recipient: ${recipientResult.found.name} (${recipient})`,
      );

      // 4. Update stars buy state
      this.logger.debug('Updating stars buy state...');
      await this.apiClient.updateStarsBuyState('new');

      // 5. Update stars prices
      this.logger.debug(`Updating stars prices for ${amount} stars...`);
      await this.apiClient.updateStarsPrices(amount);

      // 6. Create buy request with retry logic
      this.logger.debug(`Creating buy request for ${amount} stars...`);
      let buyRequest: { req_id: string; amount: string } | null = null;

      const attempts = Array.from(
        { length: this.MAX_RETRIES },
        (_, i) => i + 1,
      );
      const results = await Promise.allSettled(
        attempts.map(async (attempt) => {
          if (attempt > 1) {
            this.logger.debug(
              `Retry attempt ${attempt}/${this.MAX_RETRIES}: Refreshing prices...`,
            );
            await this.apiClient.updateStarsPrices(amount);
            await this.sleep(500);
          }

          const request = await this.apiClient.initBuyStarsRequest(
            recipient,
            amount,
          );
          return { attempt, request };
        }),
      );

      const successfulResult = results.find((r) => r.status === 'fulfilled') as
        | PromiseFulfilledResult<{
            attempt: number;
            request: { req_id: string; amount: string };
          }>
        | undefined;

      if (!successfulResult) {
        const lastError = results[results.length - 1];
        if (lastError.status === 'rejected') {
          throw lastError.reason;
        }
        throw new Error('Failed to create buy request after retries');
      }

      buyRequest = successfulResult.value.request;
      this.logger.log(`Buy request created: ${buyRequest.req_id}`);

      if (!buyRequest) {
        throw new Error('Failed to create buy request after retries');
      }

      if (!buyRequest.amount) {
        throw new Error('Buy request amount is missing');
      }

      // 7. Initialize wallet and check balance / perform swap if needed
      this.logger.debug('Initializing wallet and checking balance...');
      const walletData = await this.tonWalletProvider.initializeWallet();
      if (!walletData) {
        throw new Error('Failed to initialize wallet');
      }

      // Calculate required TON amount from buy request
      // buyRequest.amount is a string, but may contain a float (e.g., "0.4418")
      // We need to normalize it to nano units (integer string)
      const requiredTonAmountRaw = buyRequest.amount;

      if (!requiredTonAmountRaw) {
        throw new Error('Buy request amount is missing');
      }

      const requiredTonValue = parseFloat(requiredTonAmountRaw);

      if (Number.isNaN(requiredTonValue) || requiredTonValue <= 0) {
        throw new Error(
          `Invalid buy request amount: ${requiredTonAmountRaw} (parsed as ${requiredTonValue})`,
        );
      }

      // If it's a float, convert to nano (multiply by 1e9)
      // If it's already an integer string, use as is
      const requiredTonAmount =
        requiredTonValue % 1 !== 0
          ? Math.floor(requiredTonValue * 1e9).toString()
          : Math.floor(requiredTonValue).toString();

      if (
        !requiredTonAmount ||
        requiredTonAmount === 'NaN' ||
        requiredTonAmount === '0'
      ) {
        throw new Error(
          `Failed to normalize TON amount. Raw: ${requiredTonAmountRaw}, Value: ${requiredTonValue}, Result: ${requiredTonAmount}`,
        );
      }

      // 7. Check balance and perform swap if needed
      const balanceInfo = await this.checkAndPrepareBalance(
        walletData.address,
        requiredTonAmount,
        amount,
      );

      const { initialTonBalance, initialUsdtBalance, swapPerformed } =
        balanceInfo;

      // 8. Execute transaction
      const { signedBoc, txHash, isValidTxHash } =
        await this.executeTransaction(
          buyRequest.req_id,
          walletData,
          hideSender,
        );

      // 11. Confirm transaction with Fragment
      // Note: Even if txHash is invalid (rate limit), we still try to confirm
      // Fragment may have received the transaction despite the API error response
      if (!isValidTxHash) {
        this.logger.debug(
          `Transaction hash is invalid or missing (${txHash || 'undefined'}), but proceeding with Fragment confirmation. Fragment may have received the transaction despite the API response.`,
        );
      }

      this.logger.debug('Confirming transaction with Fragment...');
      const confirmed = await this.apiClient.confirmReq(
        buyRequest.req_id,
        signedBoc,
        walletData.address,
        walletData.stateInit,
        walletData.publicKey,
      );

      if (!confirmed) {
        throw new Error('Transaction confirmation failed');
      }

      // Transaction is confirmed by Fragment, so it's successful regardless of txHash format
      // If Fragment confirms, the transaction was processed successfully
      const finalTxHash = isValidTxHash ? txHash : txHash || undefined;

      // 9. Log final balances
      await this.logFinalBalances(
        walletData.address,
        initialTonBalance,
        initialUsdtBalance,
        BigInt(requiredTonAmount),
        swapPerformed,
      );

      // Update purchase record in DB
      purchaseRecord.status = StarsPurchaseStatus.COMPLETED;
      purchaseRecord.fragmentRequestId = buyRequest.req_id;
      purchaseRecord.txHash = finalTxHash;
      await purchaseRepo.save(purchaseRecord);

      const processingTime = Date.now() - (this.startTime || Date.now());
      const priceRub = amount * this.PRICE_PER_STAR_RUB;

      this.logger.log(
        `Stars purchase completed successfully. User: ${userId}, Request ID: ${buyRequest.req_id}, TX Hash: ${txHash || 'N/A'}`,
      );

      await this.notificationsService.notifyPurchaseSuccess(
        userId,
        recipientUsername,
        amount,
        priceRub,
        this.PRICE_PER_STAR_RUB,
        processingTime,
        false,
        isTestPurchase,
      );

      return {
        success: true,
        requestId: buyRequest.req_id,
        txHash: finalTxHash,
      };
    } catch (error: unknown) {
      let errorMessage: string;
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      if (typeof error === 'string') {
        errorMessage = error;
      }
      if (!errorMessage) {
        errorMessage = JSON.stringify(error) || 'Unknown error';
      }

      // Update purchase record in DB with error
      purchaseRecord.status = StarsPurchaseStatus.FAILED;
      purchaseRecord.error = errorMessage;
      await purchaseRepo.save(purchaseRecord);

      this.logger.error(
        `Stars purchase failed for user ${userId}: ${errorMessage}`,
      );

      await this.notificationsService.notifyError('Fragment API', errorMessage);

      return {
        success: false,
        error: errorMessage,
      };
    } finally {
      // Always release the processing flag
      this.isProcessingPurchase = false;
    }
  }

  /**
   * Check if recipient exists
   */
  async checkRecipientExists(username: string): Promise<boolean> {
    try {
      const result = await this.apiClient.searchStarsRecipient(username);
      return result.ok === true && result.found !== undefined;
    } catch {
      return false;
    }
  }

  /**
   * Check if there's sufficient USDT balance for purchasing stars
   * @param starsAmount Amount of stars to purchase
   * @returns true if balance is sufficient, false otherwise
   */
  async checkUsdtBalanceForPurchase(
    starsAmount: number,
  ): Promise<{ sufficient: boolean; balance?: string; required?: string }> {
    try {
      const walletData = await this.tonWalletProvider.initializeWallet();
      if (!walletData) {
        return { sufficient: false };
      }

      const balances = await this.tonBalanceProvider.getWalletBalances(
        walletData.address,
      );
      if (!balances) {
        return { sufficient: false };
      }

      const usdtBalance = BigInt(balances.usdt || '0');
      const usdtAmountForStars =
        (starsAmount / 50) *
        this.PRICE_50_STARS_USD *
        this.USDT_RESERVE_MULTIPLIER;
      const requiredUsdtNano = BigInt(Math.floor(usdtAmountForStars * 1e6));

      const sufficient = usdtBalance >= requiredUsdtNano;

      return {
        sufficient,
        balance: usdtBalance.toString(),
        required: requiredUsdtNano.toString(),
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to check USDT balance: ${errorMessage}`);
      return { sufficient: false };
    }
  }

  /**
   * Purchase 50 test stars for whitelisted user
   * This method handles the complete flow: whitelist check, purchase, and test claims increment
   * Admin can claim without restrictions
   * @param userId Telegram user ID of the purchaser
   * @param recipientUsername Telegram username of the recipient (with or without @)
   * @returns Purchase result with request ID
   */
  async purchaseTestStars(
    userId: string,
    recipientUsername: string,
  ): Promise<PurchaseResult> {
    const TEST_STARS_AMOUNT = 50;
    const MAX_TEST_CLAIMS = 1;
    const isAdmin = userId === ADMIN_USER_ID;

    // 1. Check if user is whitelisted (admin bypasses this check)
    if (isAdmin) {
      // Skip whitelist check for admin
    } else {
      const isWhitelisted =
        await this.whitelistService.isUserWhitelisted(userId);
      if (!isWhitelisted) {
        return {
          success: false,
          error: 'User is not whitelisted',
        };
      }
    }

    // 2. Check if user can claim test stars (admin bypasses this check)
    if (isAdmin) {
      // Skip test claims check for admin
    } else {
      const canClaim = await this.whitelistService.canClaimTestStars(
        userId,
        MAX_TEST_CLAIMS,
      );
      if (!canClaim) {
        return {
          success: false,
          error: 'User has already claimed test stars',
        };
      }
    }

    // 3. Purchase stars
    const result = await this.purchaseStars(
      userId,
      recipientUsername,
      TEST_STARS_AMOUNT,
      0,
      true, // isTestPurchase
    );

    // 4. If purchase was successful, increment test claims
    // Note: Admin also increments for tracking purposes
    if (!result.success) {
      return result;
    }

    await this.whitelistService.incrementTestClaims(userId);
    return result;
  }

  /**
   * Check balance and perform swap if needed
   */
  private async checkAndPrepareBalance(
    walletAddress: string,
    requiredTonAmount: string,
    starsAmount: number,
  ): Promise<{
    initialTonBalance: bigint;
    initialUsdtBalance: bigint;
    totalRequiredTon: bigint;
    swapPerformed: boolean;
    swapTxHash?: string;
  }> {
    this.logger.debug('Getting initial wallet balances...');
    const initialBalances =
      await this.tonBalanceProvider.getWalletBalances(walletAddress);
    if (!initialBalances) {
      throw new Error('Failed to get initial wallet balances');
    }

    const initialTonBalance = BigInt(initialBalances.ton || '0');
    const initialUsdtBalance = BigInt(initialBalances.usdt || '0');

    const initialTonFormatted = (Number(initialTonBalance) / 1e9).toFixed(4);
    const initialUsdtFormatted = (Number(initialUsdtBalance) / 1e6).toFixed(2);

    this.logger.log(
      `Initial balances - TON: ${initialTonFormatted}, USDT: ${initialUsdtFormatted}`,
    );

    const minTonForFees = BigInt(this.tonConfig.minTonForFees || '100000000');
    const requiredTonBigInt = BigInt(requiredTonAmount);
    const totalRequiredTon = requiredTonBigInt + minTonForFees;

    const requiredTonFormatted = (Number(totalRequiredTon) / 1e9).toFixed(4);
    this.logger.debug(
      `Required TON: ${requiredTonFormatted} TON (${totalRequiredTon} nano) = ${(Number(requiredTonBigInt) / 1e9).toFixed(4)} TON + ${(Number(minTonForFees) / 1e9).toFixed(4)} TON (fees)`,
    );

    const hasSufficientTon = initialTonBalance >= totalRequiredTon;
    const hasUsdt = initialUsdtBalance > BigInt(0);

    this.logger.debug(
      `TON sufficient: ${hasSufficientTon}, USDT available: ${hasUsdt}`,
    );

    let swapPerformed = false;
    let swapTxHash: string | undefined;

    if (hasUsdt) {
      const swapResult = await this.performUsdtSwapIfNeeded(
        starsAmount,
        initialUsdtBalance,
      );

      if (swapResult) {
        swapPerformed = true;
        swapTxHash = swapResult.txHash;
      }
    }

    if (!hasUsdt && !hasSufficientTon) {
      throw new Error(
        `Insufficient balance. Required: ${requiredTonFormatted} TON, Available: ${initialTonFormatted} TON. No USDT available for swap. Please contact administrators.`,
      );
    }

    if (!hasUsdt && hasSufficientTon) {
      this.logger.log(
        `No USDT available, but TON balance sufficient. Proceeding with purchase.`,
      );
    }

    return {
      initialTonBalance,
      initialUsdtBalance,
      totalRequiredTon,
      swapPerformed,
      swapTxHash,
    };
  }

  /**
   * Perform USDT to TON swap if sufficient balance available
   */
  private async performUsdtSwapIfNeeded(
    starsAmount: number,
    initialUsdtBalance: bigint,
  ): Promise<{ txHash: string } | null> {
    const usdtAmountForStars =
      (starsAmount / 50) *
      this.PRICE_50_STARS_USD *
      this.USDT_RESERVE_MULTIPLIER;
    const requiredUsdtNano = BigInt(Math.floor(usdtAmountForStars * 1e6));
    const requiredUsdtFormatted = usdtAmountForStars.toFixed(2);

    this.logger.log(
      `USDT available. Required: ${requiredUsdtFormatted} USDT for ${starsAmount} stars`,
    );

    const hasSufficientUsdt = initialUsdtBalance >= requiredUsdtNano;

    if (!hasSufficientUsdt) {
      const initialUsdtFormatted = (Number(initialUsdtBalance) / 1e6).toFixed(
        2,
      );
      throw new Error(
        `Insufficient USDT balance. Required: ${requiredUsdtFormatted} USDT, Available: ${initialUsdtFormatted} USDT`,
      );
    }

    const initialUsdtFormatted = (Number(initialUsdtBalance) / 1e6).toFixed(2);
    this.logger.log(
      `USDT balance sufficient for swap. Required: ${requiredUsdtFormatted} USDT, Available: ${initialUsdtFormatted} USDT`,
    );

    this.logger.log(
      `Processing your payment. Please wait while we complete the transaction...`,
    );
    await this.sleep(1000);

    this.logger.debug(
      `Getting swap quote for ${requiredUsdtFormatted} USDT...`,
    );
    const swapQuote = await this.stonfiSwapService.getSwapQuoteFromUsdt(
      requiredUsdtNano.toString(),
    );

    if (!swapQuote) {
      throw new Error('Failed to get swap quote');
    }

    const minTonAmount = swapQuote.minToAmount;
    const minTonFormatted = (Number(BigInt(minTonAmount)) / 1e9).toFixed(4);

    this.logger.log(
      `Executing USDT to TON swap: ${requiredUsdtFormatted} USDT -> min ${minTonFormatted} TON...`,
    );

    const swapResult = await this.stonfiSwapService.swapUsdtToTon(
      requiredUsdtNano.toString(),
      minTonAmount,
    );

    if (!swapResult.success) {
      throw new Error(`Swap failed: ${swapResult.error || 'Unknown error'}`);
    }

    this.logger.log(
      `Swap completed successfully. TX Hash: ${swapResult.txHash}`,
    );

    await this.sleep(2000);

    return { txHash: swapResult.txHash! };
  }

  /**
   * Execute transaction: get details, sign and send to blockchain
   */
  private async executeTransaction(
    requestId: string,
    walletData: WalletData,
    hideSender: number,
  ): Promise<{
    signedBoc: string;
    txHash?: string;
    isValidTxHash: boolean;
  }> {
    this.logger.debug('Getting transaction details from Fragment...');
    const transactionData = await this.apiClient.getBuyStarsLink(
      requestId,
      walletData.address,
      walletData.stateInit,
      walletData.publicKey,
      hideSender,
    );

    this.logger.debug('Transaction details received');

    this.logger.debug('Signing transaction...');
    const signedBoc = await this.tonTransactionProvider.signTransaction(
      transactionData.transaction as Transaction,
      walletData,
    );

    this.logger.debug('Sending transaction to blockchain...');
    const txHash =
      await this.tonTransactionProvider.sendTransactionToBlockchain(signedBoc);

    // Validate txHash: must be a non-empty string without error keywords
    // Note: We don't check length strictly as different APIs may return different formats
    const isValidTxHash =
      txHash &&
      typeof txHash === 'string' &&
      txHash.trim().length > 0 &&
      !txHash.toLowerCase().includes('error') &&
      !txHash.toLowerCase().includes('rate') &&
      !txHash.toLowerCase().includes('limit') &&
      !txHash.toLowerCase().includes('exceed');

    if (!isValidTxHash) {
      this.logger.warn(
        `Transaction may not have been sent to blockchain. Response: ${txHash || 'undefined'}`,
      );
      await this.sleep(this.TRANSACTION_WAIT_TIME_MS);
      return { signedBoc, txHash, isValidTxHash };
    }

    this.logger.log(`Transaction sent to blockchain. TX Hash: ${txHash}`);
    await this.sleep(this.TRANSACTION_WAIT_TIME_MS);

    return { signedBoc, txHash, isValidTxHash };
  }

  /**
   * Log final balances and changes
   */
  private async logFinalBalances(
    walletAddress: string,
    initialTonBalance: bigint,
    initialUsdtBalance: bigint,
    requiredTonBigInt: bigint,
    swapPerformed: boolean,
  ): Promise<void> {
    this.logger.debug('Getting final wallet balances...');
    const finalBalances =
      await this.tonBalanceProvider.getWalletBalances(walletAddress);

    if (!finalBalances) {
      return;
    }

    const finalTonBalance = BigInt(finalBalances.ton || '0');
    const finalUsdtBalance = BigInt(finalBalances.usdt || '0');

    const tonChange = finalTonBalance - initialTonBalance;
    const usdtSpent = initialUsdtBalance - finalUsdtBalance;

    const finalTonFormatted = (Number(finalTonBalance) / 1e9).toFixed(4);
    const finalUsdtFormatted = (Number(finalUsdtBalance) / 1e6).toFixed(2);
    const tonChangeFormatted = (Number(tonChange) / 1e9).toFixed(4);
    const usdtSpentFormatted = (Number(usdtSpent) / 1e6).toFixed(2);

    this.logger.log(
      `Final balances - TON: ${finalTonFormatted}, USDT: ${finalUsdtFormatted}`,
    );
    this.logger.log(
      `Balance changes - TON change: ${tonChangeFormatted}, USDT spent: ${usdtSpentFormatted}`,
    );

    if (!swapPerformed) {
      this.logger.debug(
        'No swap was performed. Purchase was made directly with TON.',
      );
      return;
    }

    const tonReceivedFromSwap = tonChange + requiredTonBigInt;
    this.logger.log(
      `Swap was performed. USDT spent: ${usdtSpentFormatted}, TON received from swap: ~${(Number(tonReceivedFromSwap) / 1e9).toFixed(4)}, TON spent on purchase: ${(Number(requiredTonBigInt) / 1e9).toFixed(4)}`,
    );
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        resolve();
      }, ms);
    });
  }
}
