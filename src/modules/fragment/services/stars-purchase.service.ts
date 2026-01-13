/* eslint-disable @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports, import/no-extraneous-dependencies, @typescript-eslint/no-require-imports */
import { NotificationsService } from '@modules/notifications/notifications.service';
import { WhitelistService } from '@modules/user/services/whitelist.service';
import { Injectable, Logger } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { mnemonicToPrivateKey } from 'ton-crypto';
import * as TonWeb from 'tonweb';
import * as nacl from 'tweetnacl';
import { EntityManager } from 'typeorm';
import {
  StarsPurchaseEntity,
  StarsPurchaseStatus,
} from '../entities/stars-purchase.entity';
import { FragmentConfig } from '../fragment.config';
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
 * Extended TonWeb interface to include missing type definitions
 */
interface TonWebExtended {
  wallet: {
    all: {
      v3R2: new (
        provider: HttpProvider,
        options: { publicKey: Uint8Array },
      ) => Wallet;
    };
  };
  HttpProvider: new (
    url: string,
    options?: { apiKey?: string },
  ) => HttpProvider;
  boc: {
    CellBuilder: new () => CellBuilder;
  };
  utils: {
    Address: new (address: string) => Address;
    bytesToBase64: (bytes: Uint8Array) => string;
    bytesToHex: (bytes: Uint8Array) => string;
    toNano: (amount: string) => string;
    base64ToBytes: (base64: string) => Uint8Array;
    signCell: (cell: Cell, privateKey: Uint8Array) => Promise<Cell>;
  };
}

interface HttpProvider {
  sendBoc: (boc: string) => Promise<
    | string
    | {
        hash?: string;
        tx_hash?: string;
        transaction_id?: string;
        result?: string;
      }
  >;
}

interface Wallet {
  getAddress: () => Promise<Address>;
  createStateInit: () => Promise<{ stateInit: Cell }>;
}

interface Address {
  toString: (
    bounceable: boolean,
    testOnly: boolean,
    urlSafe: boolean,
  ) => string;
}

interface Cell {
  toBoc: () => Promise<Uint8Array>;
}

interface CellBuilder {
  storeUint: (value: number, bitLength: number) => CellBuilder;
  storeAddress: (address: Address) => CellBuilder;
  storeCoins: (amount: string) => CellBuilder;
  storeBytes: (bytes: Uint8Array) => CellBuilder;
  storeRef: (cell: Cell) => CellBuilder;
  endCell: () => Cell;
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

  // Simple flag to track if a purchase is currently being processed
  // TODO: Replace with RabbitMQ or similar message queue for production
  private isProcessingPurchase = false;

  constructor(
    private readonly apiClient: FragmentApiClientService,
    private readonly whitelistService: WhitelistService,
    private readonly config: FragmentConfig,
    private readonly notificationsService: NotificationsService,
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

      // 7. Initialize wallet and get transaction details
      this.logger.debug(
        'Initializing wallet and getting transaction details...',
      );
      const walletData = await this.initializeWallet();
      if (!walletData) {
        throw new Error('Failed to initialize wallet');
      }

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
      const signedBoc = await this.signTransaction(
        transactionData.transaction,
        walletData,
      );

      // 10. Send transaction to blockchain
      this.logger.debug('Sending transaction to blockchain...');
      const txHash = await this.sendTransactionToBlockchain(signedBoc);

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
        throw new Error('Transaction confirmation failed');
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
   * Purchase 50 test stars for whitelisted user
   * This method handles the complete flow: whitelist check, purchase, and test claims increment
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

    // 1. Check if user is whitelisted
    const isWhitelisted = await this.whitelistService.isUserWhitelisted(userId);
    if (!isWhitelisted) {
      return {
        success: false,
        error: 'User is not whitelisted',
      };
    }

    // 2. Check if user can claim test stars
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

    // 3. Purchase stars
    const result = await this.purchaseStars(
      userId,
      recipientUsername,
      TEST_STARS_AMOUNT,
      0,
      true, // isTestPurchase
    );

    // 4. If purchase was successful, increment test claims
    if (result.success) {
      await this.whitelistService.incrementTestClaims(userId);
    }

    return result;
  }

  /**
   * Initialize TON wallet from mnemonic
   */
  private async initializeWallet(): Promise<{
    address: string;
    stateInit: string;
    publicKey: string;
    privateKey: Uint8Array;
  } | null> {
    try {
      // Dynamic import to avoid issues with CommonJS modules
      // tonweb and ton-crypto are CommonJS modules, require() is necessary

      const mnemonicArray = this.config.mnemonic.trim().split(/\s+/);
      if (mnemonicArray.length !== 24) {
        throw new Error('Mnemonic must contain 24 words');
      }

      // Get private key from mnemonic
      const keyPair = await mnemonicToPrivateKey(mnemonicArray);
      const privateKey = keyPair.secretKey;

      // Type assertion to extended interface because tonweb types are incomplete
      const TonWebTyped = TonWeb as unknown as TonWebExtended;

      // Create HttpProvider first
      const httpProvider = new TonWebTyped.HttpProvider(
        this.config.toncenterRpcUrl || 'https://toncenter.com/api/v2/jsonRPC',
        {
          apiKey: this.config.toncenterApiKey,
        },
      );

      // Create TonWeb instance (needed to access wallet.all)
      // TonWeb constructor takes HttpProvider as argument
      const tonWebInstance = new (TonWeb as any)(httpProvider);

      // Initialize wallet v3R2 - access through instance, not class
      const WalletClass = tonWebInstance.wallet.all.v3R2;
      const wallet = new WalletClass(httpProvider, {
        publicKey: keyPair.publicKey,
      });

      const address = await wallet.getAddress();
      const addressString = address.toString(true, true, true);

      // Get state init
      const stateInit = await wallet.createStateInit();
      const stateInitCell = stateInit.stateInit;
      const stateInitBoc = await stateInitCell.toBoc();
      const stateInitBase64 = tonWebInstance.utils.bytesToBase64(stateInitBoc);

      // Get public key as hex
      const publicKeyHex = tonWebInstance.utils.bytesToHex(keyPair.publicKey);

      return {
        address: addressString,
        stateInit: stateInitBase64,
        publicKey: publicKeyHex,
        privateKey,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to initialize wallet: ${errorMessage}`);
      return null;
    }
  }

  /**
   * Sign transaction using wallet
   * Uses tonweb to create and sign transaction in format expected by Fragment API
   * Based on the working script approach using wallet.createSigningMessage()
   */
  private async signTransaction(
    transaction: {
      validUntil: number;
      from: string;
      messages: Array<{
        address: string;
        amount: string;
        payload?: string;
      }>;
    },
    walletData: {
      address: string;
      stateInit: string;
      publicKey: string;
      privateKey: Uint8Array;
    },
  ): Promise<string> {
    try {
      // Type assertion to extended interface because tonweb types are incomplete
      const TonWebTyped = TonWeb as unknown as TonWebExtended;

      // Create HttpProvider and TonWeb instance
      const httpProvider = new TonWebTyped.HttpProvider(
        this.config.toncenterRpcUrl || 'https://toncenter.com/api/v2/jsonRPC',
        {
          apiKey: this.config.toncenterApiKey,
        },
      );
      const tonWebInstance = new (TonWeb as any)(httpProvider);

      // Recreate wallet to access createSigningMessage
      const mnemonicArray = this.config.mnemonic.trim().split(/\s+/);
      const keyPair = await mnemonicToPrivateKey(mnemonicArray);
      const WalletClass = tonWebInstance.wallet.all.v3R2;
      const wallet = new WalletClass(httpProvider, {
        publicKey: keyPair.publicKey,
      });

      // Get seqno (transaction sequence number)
      const seqno = (await wallet.methods.seqno().call()) || 0;

      // Convert private key to Uint8Array if needed
      const secretKeyUint8 =
        walletData.privateKey instanceof Buffer
          ? new Uint8Array(walletData.privateKey)
          : walletData.privateKey;

      // Create signing message using wallet method
      const signingMessage = wallet.createSigningMessage(seqno);
      const SEND_MODE = 3; // Standard send mode
      signingMessage.bits.writeUint8(SEND_MODE);

      // Process each message from transaction
      for (const msg of transaction.messages) {
        let messagePayload = null;
        if (msg.payload) {
          const payloadBytes = tonWebInstance.utils.base64ToBytes(msg.payload);
          messagePayload = tonWebInstance.boc.Cell.oneFromBoc(payloadBytes);
        }

        // Create outgoing message using Contract helper
        const outMsg = tonWebInstance.Contract.createOutMsg(
          msg.address,
          msg.amount,
          messagePayload,
          null,
        );
        signingMessage.refs.push(outMsg);
      }

      // Get BOC and hash for signing
      const boc = await signingMessage.toBoc(false);
      const hash = await tonWebInstance.boc.Cell.oneFromBoc(boc).hash();

      // Sign the hash using nacl
      const signature = nacl.sign.detached(hash, secretKeyUint8);

      // Create body cell with signature
      const body = new tonWebInstance.boc.Cell();
      body.bits.writeBytes(signature);
      body.writeCell(tonWebInstance.boc.Cell.oneFromBoc(boc));

      // Create state init if this is the first transaction (seqno === 0)
      let stateInit = null;
      if (seqno === 0) {
        const deploy = await wallet.createStateInit();
        stateInit = deploy.stateInit;
      }

      // Create external message header and common message info
      const selfAddress = await wallet.getAddress();
      const header =
        tonWebInstance.Contract.createExternalMessageHeader(selfAddress);
      const externalMessage = tonWebInstance.Contract.createCommonMsgInfo(
        header,
        stateInit,
        body,
      );

      // Get final signed BOC
      const signedBoc = await externalMessage.toBoc(false);
      return tonWebInstance.utils.bytesToBase64(signedBoc);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to sign transaction: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Send signed transaction to blockchain directly
   * Uses tonweb provider to send BOC to TON network
   * TODO: Replace with RabbitMQ worker for production
   */
  private async sendTransactionToBlockchain(
    signedBoc: string,
  ): Promise<string | undefined> {
    try {
      const TonWebTyped = TonWeb as unknown as TonWebExtended;

      // Create HttpProvider
      const httpProvider = new TonWebTyped.HttpProvider(
        this.config.toncenterRpcUrl || 'https://toncenter.com/api/v2/jsonRPC',
        {
          apiKey: this.config.toncenterApiKey,
        },
      );

      // Send BOC to blockchain
      const result = await httpProvider.sendBoc(signedBoc);

      // Extract transaction hash from result
      let txHash: string | undefined;

      if (typeof result === 'string') {
        txHash = result;
      } else if (typeof result === 'object' && result !== null) {
        txHash =
          (result as any).hash ||
          (result as any).tx_hash ||
          (result as any).transaction_id ||
          (result as any).result;
      }

      // Validate that result is not an error message
      if (
        txHash &&
        typeof txHash === 'string' &&
        (txHash.toLowerCase().includes('error') ||
          txHash.toLowerCase().includes('rate') ||
          txHash.toLowerCase().includes('limit') ||
          txHash.toLowerCase().includes('exceed') ||
          txHash.toLowerCase().includes('fail'))
      ) {
        this.logger.error(
          `Blockchain API returned error message instead of txHash: ${txHash}`,
        );
        return undefined;
      }

      return txHash;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to send transaction to blockchain: ${errorMessage}`,
      );
      // Don't throw - transaction might still be processed
      return undefined;
    }
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
