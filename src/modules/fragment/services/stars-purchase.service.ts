import { ADMIN_USER_ID } from '@common/constants';
import { NotificationsService } from '@modules/notifications/notifications.service';
import { DexSwapService } from '@modules/ton/services/dex-swap.service';
import { TransactionService } from '@modules/ton/services/transaction.service';
import { WalletService } from '@modules/ton/services/wallet.service';
import { WhitelistService } from '@modules/user/services/whitelist.service';
import { Injectable, Logger } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import {
  StarsPurchaseEntity,
  StarsPurchaseStatus,
} from '../entities/stars-purchase.entity';
import { FragmentApiClientService } from './fragment-api-client.service';

export interface PurchaseResult {
  success: boolean;
  requestId?: string;
  txHash?: string;
  error?: string;
}

@Injectable()
export class StarsPurchaseService {
  private readonly logger = new Logger(StarsPurchaseService.name);

  private readonly MIN_STARS = 50;

  private readonly MAX_STARS = 1000000;

  private readonly MAX_RETRIES = 3;

  private readonly TRANSACTION_WAIT_TIME_MS = 3000;

  private readonly PRICE_PER_STAR_RUB = 1.244;

  // Simple flag to track if a purchase is currently being processed
  // TODO: Replace with RabbitMQ or similar message queue for production
  private isProcessingPurchase = false;

  constructor(
    private readonly apiClient: FragmentApiClientService,
    private readonly whitelistService: WhitelistService,
    private readonly notificationsService: NotificationsService,
    private readonly dexSwapService: DexSwapService,
    private readonly walletService: WalletService,
    private readonly transactionService: TransactionService,
    @InjectEntityManager()
    private readonly em: EntityManager,
  ) {}

  async purchaseStars(
    userId: string,
    recipientUsername: string,
    amount: number,
    hideSender: number = 0,
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

      if (successfulResult) {
        buyRequest = successfulResult.value.request;
        this.logger.log(`Buy request created: ${buyRequest.req_id}`);
      } else {
        const lastError = results[results.length - 1];
        if (lastError.status === 'rejected') {
          throw lastError.reason;
        }
      }

      if (!buyRequest) {
        throw new Error('Failed to create buy request after retries');
      }

      // 6.5. Check balance and swap USDT to TON if needed
      this.logger.debug('Checking balance and performing swap if needed...');
      const walletData = await this.walletService.initializeWallet();
      if (!walletData) {
        throw new Error('Failed to initialize wallet');
      }
      this.logger.debug(
        `Required TON amount: ${buyRequest.amount} nano (${parseFloat(buyRequest.amount) / 1e9} TON)`,
      );
      await this.ensureSufficientTonBalance(buyRequest.amount, walletData);
      this.logger.debug('Balance check completed, sufficient funds available');

      // 7. Get transaction details
      this.logger.debug('Getting transaction details...');

      // 8. Get transaction details from Fragment
      const transactionData = await this.apiClient.getBuyStarsLink(
        buyRequest.req_id,
        walletData.address,
        walletData.stateInit,
        walletData.publicKey,
        hideSender,
      );

      this.logger.debug('Transaction details received');

      // 9. Sign transaction
      this.logger.debug('Signing transaction...');
      const signedBoc = await this.transactionService.signTransaction(
        transactionData.transaction,
        walletData,
      );

      // 10. Send transaction to blockchain
      this.logger.debug('Sending transaction to blockchain...');
      const txHash = await this.transactionService.sendTransaction(signedBoc);

      // Validate txHash - it should be a valid hash, not an error message
      const isValidTxHash =
        txHash &&
        typeof txHash === 'string' &&
        txHash.length > 20 &&
        !txHash.toLowerCase().includes('error') &&
        !txHash.toLowerCase().includes('rate') &&
        !txHash.toLowerCase().includes('limit') &&
        !txHash.toLowerCase().includes('exceed');

      if (isValidTxHash) {
        this.logger.log(`Transaction sent to blockchain. TX Hash: ${txHash}`);
      } else {
        this.logger.warn(
          `Transaction may not have been sent to blockchain. Response: ${txHash || 'undefined'}`,
        );
      }

      // Wait for transaction to be processed
      await this.sleep(this.TRANSACTION_WAIT_TIME_MS);

      // 11. Confirm transaction with Fragment
      // Note: Even if txHash is invalid (rate limit), we still try to confirm
      // Fragment may have received the transaction despite the API error response
      if (!isValidTxHash) {
        this.logger.warn(
          `Transaction hash is invalid (${txHash || 'undefined'}), but proceeding with Fragment confirmation. This may indicate a rate limit issue.`,
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
        const errorMsg =
          'Transaction confirmation failed. Please contact @onezee123 and check report channel for order details.';
        this.logger.error(errorMsg);
        throw new Error('CONFIRMATION_FAILED');
      }

      // Update purchase record in DB
      purchaseRecord.status = StarsPurchaseStatus.COMPLETED;
      purchaseRecord.fragmentRequestId = buyRequest.req_id;
      purchaseRecord.txHash = isValidTxHash ? txHash : undefined;
      await purchaseRepo.save(purchaseRecord);

      if (!isValidTxHash) {
        this.logger.error(
          `Purchase marked as completed but transaction may not have been sent to blockchain. Fragment request ID: ${buyRequest.req_id}. Stars may not arrive. Check Fragment dashboard and user account.`,
        );
      }

      const processingTime = Date.now() - startTime;
      const priceRub = amount * this.PRICE_PER_STAR_RUB;

      this.logger.log(
        `Stars purchase completed successfully. User: ${userId}, Request ID: ${buyRequest.req_id}, TX Hash: ${txHash || 'N/A'}`,
      );

      if (userId === ADMIN_USER_ID && isTestPurchase) {
        await this.notificationsService.notifyAdminTestClaim();
      } else {
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
      }

      return {
        success: true,
        requestId: buyRequest.req_id,
        txHash: txHash || undefined,
      };
    } catch (error: unknown) {
      let errorMessage: string;
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else {
        errorMessage = JSON.stringify(error) || 'Unknown error';
      }

      // Update purchase record in DB with error
      purchaseRecord.status = StarsPurchaseStatus.FAILED;
      purchaseRecord.error = errorMessage;
      await purchaseRepo.save(purchaseRecord);

      this.logger.error(
        `Stars purchase failed for user ${userId}: ${errorMessage}`,
      );

      let userFriendlyError = errorMessage;
      if (errorMessage === 'INSUFFICIENT_FUNDS') {
        userFriendlyError = 'insufficient_funds';
      } else if (errorMessage === 'SWAP_FAILED_AND_INSUFFICIENT_TON') {
        userFriendlyError = 'swap_failed_insufficient_ton';
      } else if (errorMessage === 'CONFIRMATION_FAILED') {
        userFriendlyError = 'confirmation_failed';
      }

      await this.notificationsService.notifyError('Fragment API', errorMessage);

      return {
        success: false,
        error: userFriendlyError,
      };
    } finally {
      // Always release the processing flag
      this.isProcessingPurchase = false;
    }
  }

  async checkRecipientExists(username: string): Promise<boolean> {
    try {
      const result = await this.apiClient.searchStarsRecipient(username);
      return result.ok === true && result.found !== undefined;
    } catch {
      return false;
    }
  }

  async checkBalanceBeforePurchase(
    amount: number,
  ): Promise<{ canPurchase: boolean; error?: string }> {
    try {
      await this.apiClient.initializeSession();
      const isValid = await this.apiClient.checkCookiesValidity();
      if (!isValid) {
        return {
          canPurchase: false,
          error: 'balance_check_failed',
        };
      }

      await this.apiClient.updateStarsPrices(amount);

      const walletData = await this.walletService.initializeWallet();
      if (!walletData) {
        return {
          canPurchase: false,
          error: 'balance_check_failed',
        };
      }

      const estimatedTonPerStar = 0.001;
      const estimatedRequiredTon = amount * estimatedTonPerStar;
      const requiredTonNano = (estimatedRequiredTon * 1e9).toString();

      return await this.dexSwapService.checkSufficientBalance(
        walletData.address,
        requiredTonNano,
      );
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Balance check failed: ${errorMessage}`);
      return {
        canPurchase: false,
        error: 'balance_check_failed',
      };
    }
  }

  async purchaseTestStars(
    userId: string,
    recipientUsername: string,
  ): Promise<PurchaseResult> {
    const TEST_STARS_AMOUNT = 50;
    const MAX_TEST_CLAIMS = 1;

    // 1. Check if user is whitelisted
    const isWhitelisted = await this.whitelistService.isUserWhitelisted(userId);
    if (!isWhitelisted) {
      return {
        success: false,
        error: 'User is not whitelisted',
      };
    }

    // 2. Check if user can claim test stars (skip for admin user)
    if (userId !== ADMIN_USER_ID) {
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

    // 4. If purchase was successful, increment test claims (skip for admin)
    if (result.success && userId !== ADMIN_USER_ID) {
      await this.whitelistService.incrementTestClaims(userId);
    }

    // 5. Notify about admin test claim
    if (result.success && userId === ADMIN_USER_ID) {
      await this.notificationsService.notifyAdminTestClaim();
    }

    return result;
  }

  private async ensureSufficientTonBalance(
    requiredTonAmount: string,
    walletData: { address: string; privateKey: Uint8Array },
  ): Promise<void> {
    try {
      const requiredTon = parseFloat(requiredTonAmount) / 1e9;
      const reservePercent = this.dexSwapService.getSwapReservePercent();
      const requiredWithReserve = requiredTon * (1 + reservePercent / 100);
      const minTonForFees =
        parseFloat(this.dexSwapService.getMinTonForFees()) / 1e9;
      const totalRequired = requiredWithReserve + minTonForFees;

      const usdtBalance = parseFloat(
        await this.dexSwapService.getUsdtBalance(walletData.address),
      );
      const tonBalance = parseFloat(
        await this.dexSwapService.getTonBalance(walletData.address),
      );

      this.logger.debug(
        `Balance check: TON=${tonBalance}, USDT=${usdtBalance}, Required=${totalRequired}`,
      );

      if (tonBalance >= totalRequired) {
        this.logger.debug('Sufficient TON balance, no swap needed');
        return;
      }

      const tonNeeded = totalRequired - tonBalance;

      if (usdtBalance === 0) {
        if (tonBalance < totalRequired) {
          const errorMsg = `Insufficient funds: TON=${tonBalance}, Required=${totalRequired}, USDT=0`;
          this.logger.error(errorMsg);
          await this.notificationsService.notifyInsufficientBalance(
            tonBalance.toString(),
            totalRequired.toString(),
            usdtBalance.toString(),
          );
          throw new Error('INSUFFICIENT_FUNDS');
        }
        return;
      }

      const usdtNeeded = await this.dexSwapService.calculateRequiredUsdt(
        tonNeeded.toString(),
      );

      if (!usdtNeeded) {
        if (tonBalance >= totalRequired) {
          this.logger.log('Using TON directly, swap quote unavailable');
          return;
        }
        throw new Error('Failed to get swap quote');
      }

      const usdtNeededFloat = parseFloat(usdtNeeded);

      if (usdtBalance < usdtNeededFloat) {
        if (tonBalance >= totalRequired) {
          this.logger.log('Using TON directly, insufficient USDT');
          return;
        }
        const errorMsg = `Insufficient funds: USDT=${usdtBalance}, Need=${usdtNeededFloat}, TON=${tonBalance}, Need=${totalRequired}`;
        this.logger.error(errorMsg);
        await this.notificationsService.notifyInsufficientBalance(
          tonBalance.toString(),
          totalRequired.toString(),
          usdtBalance.toString(),
        );
        throw new Error('INSUFFICIENT_FUNDS');
      }

      const quote = await this.dexSwapService.getSwapQuote(
        usdtNeededFloat.toString(),
      );

      if (!quote) {
        if (tonBalance >= totalRequired) {
          this.logger.log('Using TON directly, quote unavailable');
          return;
        }
        throw new Error('Failed to get swap quote');
      }

      this.logger.log(
        `Swapping ${usdtNeededFloat} USDT → ~${quote.tonAmount} TON (min: ${quote.minTonAmount} TON)`,
      );

      const swapResult = await this.dexSwapService.swapUsdtToTon(
        usdtNeededFloat.toString(),
        quote.minTonAmount,
        walletData.address,
        walletData.privateKey,
      );

      if (!swapResult.success) {
        this.logger.warn(
          `Swap failed: ${swapResult.error}, trying TON directly`,
        );
        await this.notificationsService.notifySwapError(
          usdtNeededFloat.toString(),
          quote.tonAmount,
          swapResult.error || 'Unknown error',
        );

        const finalTonBalance = parseFloat(
          await this.dexSwapService.getTonBalance(walletData.address),
        );

        if (finalTonBalance < totalRequired) {
          const errorMsg = `Swap failed and insufficient TON: ${finalTonBalance} < ${totalRequired}`;
          this.logger.error(errorMsg);
          throw new Error('SWAP_FAILED_AND_INSUFFICIENT_TON');
        }

        this.logger.log(
          `Swap failed but using TON directly: ${finalTonBalance} >= ${totalRequired}`,
        );

        await this.notificationsService.notifySwapFailedUsingTonDirectly(
          usdtNeededFloat.toString(),
          finalTonBalance.toString(),
          totalRequired.toString(),
          swapResult.error || 'Unknown error',
        );

        return;
      }

      this.logger.log(
        `Swap successful! TX: ${swapResult.txHash}, Swapped: ${swapResult.usdtAmount} USDT → ${swapResult.tonAmount} TON`,
      );

      await this.sleep(2000);

      const finalTonBalance = parseFloat(
        await this.dexSwapService.getTonBalance(walletData.address),
      );

      if (finalTonBalance < totalRequired) {
        this.logger.warn(
          `After swap, balance (${finalTonBalance}) is still below required (${totalRequired}). Continuing anyway...`,
        );
      } else {
        this.logger.log(
          `Balance after swap: ${finalTonBalance} TON (required: ${totalRequired})`,
        );
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to ensure sufficient TON balance: ${errorMessage}`,
      );
      throw error;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        resolve();
      }, ms);
    });
  }
}
