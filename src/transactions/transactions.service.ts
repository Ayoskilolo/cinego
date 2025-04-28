import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Transaction } from './entities/transaction.entity';
import { FilterOperator, PaginateQuery, paginate } from 'nestjs-paginate';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { PaymentChannel, PaymentReason } from './enum';
import { UserService } from 'src/user/user.service';
UserService;
import { v4 as uuidv4 } from 'uuid';
import * as retry from 'async-retry';
import { TransactionStatus } from './enum';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  LessThan,
  MoreThan,
  Repository,
  FindOptionsWhere,
  DataSource,
  EntityManager,
} from 'typeorm';
import { SubscriptionType } from 'src/user/enum/userType';
import { User } from 'src/user/entities/user.entity';

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly userService: UserService,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(query: PaginateQuery) {
    return paginate(query, this.transactionRepository, {
      sortableColumns: ['dateCreated', 'amount', 'paymentReason'],
      defaultSortBy: [['dateCreated', 'DESC']],
      searchableColumns: ['reference', 'externalReference', 'paymentReason'],
      filterableColumns: {
        paymentReason: true,
        paymentChanel: true,
        amount: [FilterOperator.GTE, FilterOperator.LTE],
        dateCreated: [FilterOperator.GTE, FilterOperator.LTE],
      },
      select: [
        'id',
        'amount',
        'reference',
        'externalId',
        'externalReference',
        'paymentReason',
        'paymentChanel',
        'userId',
        'dateCreated',
      ],
    });
  }

  async findByUser(userId: string, query: PaginateQuery) {
    return paginate(query, this.transactionRepository, {
      sortableColumns: ['dateCreated', 'amount', 'paymentReason'],
      defaultSortBy: [['dateCreated', 'DESC']],
      searchableColumns: ['reference', 'externalReference', 'paymentReason'],
      filterableColumns: {
        paymentReason: true,
        paymentChanel: true,
        amount: [FilterOperator.GTE, FilterOperator.LTE],
        dateCreated: [FilterOperator.GTE, FilterOperator.LTE],
      },
      where: { userId },
      select: [
        'id',
        'amount',
        'reference',
        'externalId',
        'externalReference',
        'paymentReason',
        'paymentChanel',
        'dateCreated',
      ],
    });
  }

  async findOne(id: string) {
    const transaction = await this.transactionRepository.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!transaction) {
      throw new NotFoundException(`Transaction with ID ${id} not found`);
    }

    return { data: transaction };
  }

  // Define retry constants (consider moving to config)
  private VERIFICATION_RETRY_FACTORS = {
    retries: 5, // Number of retries
    factor: 2, // Exponential factor
    minTimeout: 1000, // Initial delay 1s
    maxTimeout: 60 * 1000, // Max delay 60s
    randomize: true,
  };
  private MAX_VERIFICATION_DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours

  private async _updateTransactionStatus(
    transactionId: string,
    status: TransactionStatus,
    externalReference?: string | null,
  ): Promise<void> {
    try {
      await this.transactionRepository.update(transactionId, {
        status,
        externalReference: externalReference ?? undefined, // Only update if provided
      });
      this.logger.log(
        `Updated transaction ${transactionId} status to ${status}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to update status for transaction ${transactionId} to ${status}: ${error.message}`,
      );
      // Consider how to handle this failure - maybe retry update?
    }
  }

  async verifyFlutterTransaction(transactionId: string): Promise<void> {
    const transaction = await this.transactionRepository.findOneBy({
      id: transactionId,
    });

    if (!transaction) {
      this.logger.error(
        `Transaction not found, transaction ID: ${transactionId}`,
      );
      return;
    }

    // Don't re-verify completed transactions
    if (
      [TransactionStatus.SUCCESSFUL, TransactionStatus.FAILED].includes(
        transaction.status,
      )
    ) {
      this.logger.log(
        `Transaction ${transactionId} already in terminal state: ${transaction.status}. Skipping verification.`,
      );
      return;
    }

    if (!transaction.externalId) {
      this.logger.error(
        `Cannot verify transaction ${transactionId}: externalId is missing.`,
      );
      // Optionally set status to ERROR here if externalId should exist
      return;
    }

    const flutterwaveSecretKey = this.configService.get<string>(
      'FLUTTERWAVE_SECRET_KEY',
    );
    if (!flutterwaveSecretKey) {
      this.logger.error(
        'FLUTTERWAVE_SECRET_KEY is not configured during verification.',
      );
      await this._updateTransactionStatus(
        transactionId,
        TransactionStatus.ERROR,
      );
      return;
    }

    const verificationUrl = `https://api.flutterwave.com/v3/transactions/${transaction.externalId}/verify`;
    const operationStartTime = Date.now();

    try {
      await retry(
        async (bail, attempt) => {
          // Check if max duration exceeded
          if (
            Date.now() - operationStartTime >
            this.MAX_VERIFICATION_DURATION_MS
          ) {
            this.logger.warn(
              `Max verification duration exceeded for transaction ${transactionId}. Bailing out.`,
            );
            bail(new Error('Max verification duration exceeded'));
            return; // Needed for type checking, bail throws
          }

          this.logger.log(
            `Attempt ${attempt} to verify transaction ${transactionId} (External ID: ${transaction.externalId})`,
          );

          // Update attempt count and timestamp before the API call
          await this.transactionRepository.update(transactionId, {
            verificationAttempts: attempt,
            lastVerificationAttemptAt: new Date(),
          });

          let verificationResponse;
          try {
            verificationResponse = await firstValueFrom(
              this.httpService.get(verificationUrl, {
                headers: {
                  Authorization: `Bearer ${flutterwaveSecretKey}`,
                },
                // Add timeout to http request if desired
              }),
            );
          } catch (error) {
            this.logger.warn(
              `Verification API call failed for transaction ${transactionId} on attempt ${attempt}: ${error.message}`,
            );
            // Check if error is potentially retryable (e.g., network error, 5xx)
            if (
              error.response?.status >= 500 ||
              error.code === 'ECONNABORTED' ||
              error.code === 'ETIMEDOUT'
            ) {
              throw error; // Throw error to trigger retry
            } else {
              // Don't retry for non-retryable errors (e.g., 4xx)
              this.logger.error(
                `Non-retryable error during verification API call for ${transactionId}: ${error.message}. Bailing out.`,
              );
              bail(error); // Prevent further retries
              return;
            }
          }

          const verificationData = verificationResponse?.data?.data;
          const apiStatus = verificationResponse?.data?.status;
          const transactionStatus = verificationData?.status;

          this.logger.log(
            `Verification response for ${transactionId}: API Status='${apiStatus}', Transaction Status='${transactionStatus}'`,
          );

          if (apiStatus === 'success' && transactionStatus === 'successful') {
            // FINAL SUCCESS STATE - Use a transaction for atomicity
            // TODO: Send an email confirming the subscription
            const queryRunner = this.dataSource.createQueryRunner();
            await queryRunner.connect();
            await queryRunner.startTransaction();

            try {
              this.logger.log(
                `Transaction ${transactionId} verified successfully. Attempting atomic update.`,
              );

              // 1. Update Transaction Status within the transaction
              await queryRunner.manager.update(Transaction, transactionId, {
                status: TransactionStatus.SUCCESSFUL,
                externalReference: verificationData.flw_ref, // Store external reference
                verificationAttempts: attempt, // Also update attempts here
                lastVerificationAttemptAt: new Date(), // And timestamp
              });
              this.logger.log(
                `Updated transaction ${transactionId} status to SUCCESSFUL within transaction.`,
              );

              // 2. Update User Subscription within the same transaction
              const user = await queryRunner.manager.findOneBy(User, {
                id: transaction.userId,
              }); // Fetch user using transaction manager

              if (!user) {
                this.logger.error(
                  `User ${transaction.userId} not found during subscription update for transaction ${transactionId}. Rolling back.`,
                );
                // Throw an error to trigger rollback
                throw new NotFoundException(
                  `User ${transaction.userId} not found.`,
                );
              }

              let needsUpdate = false;
              const updatePayload: Partial<User> = {};

              if (transaction.paymentReason === PaymentReason.PREMIUM) {
                this.logger.log(
                  `Updating user ${user.id} to PREMIUM subscription within transaction.`,
                );
                updatePayload.subscriptionType = SubscriptionType.PREMIUM;
                updatePayload.isSubscribed = true;
                const expiryDate = new Date();
                expiryDate.setMonth(expiryDate.getMonth() + 1); // Set expiry 1 month from now
                updatePayload.subscriptionExpiresAt = expiryDate;
                needsUpdate = true;
              } else if (transaction.paymentReason === PaymentReason.FREEMIUM) {
                this.logger.log(
                  `Updating user ${user.id} to FREEMIUM subscription within transaction.`,
                );
                updatePayload.subscriptionType = SubscriptionType.FREEMIUM;
                updatePayload.isSubscribed = true;
                updatePayload.subscriptionExpiresAt = null; // Freemium might not expire
                needsUpdate = true;
              }

              if (needsUpdate) {
                await queryRunner.manager.update(User, user.id, updatePayload);
                this.logger.log(
                  `Successfully updated subscription status for user ${user.id} within transaction.`,
                );
              }

              // If all succeeds, commit the transaction
              await queryRunner.commitTransaction();
              this.logger.log(
                `Successfully committed atomic update for transaction ${transactionId}.`,
              );
            } catch (error) {
              this.logger.error(
                `Error during atomic update for transaction ${transactionId}. Rolling back transaction: ${error.message}`,
                error.stack,
              );
              // Rollback transaction on any error
              await queryRunner.rollbackTransaction();
              // Set transaction status to ERROR outside the rolled-back transaction
              await this._updateTransactionStatus(
                transactionId,
                TransactionStatus.ERROR,
              );
              // Rethrow or handle as needed, maybe bail from retry?
              bail(new Error(`Atomic update failed: ${error.message}`)); // Bail from retry loop after rollback
              return; // Bail throws, but needed for type safety
            } finally {
              // Ensure queryRunner is released
              await queryRunner.release();
            }

            return; // Success, stop retrying
          } else if (
            apiStatus === 'success' &&
            transactionStatus === 'failed'
          ) {
            // FINAL FAILED STATE - No user update needed, just update transaction
            this.logger.warn(
              `Transaction ${transactionId} verification returned status: failed.`,
            );
            // Use the standard update method here as it's a single operation
            await this._updateTransactionStatus(
              transactionId,
              TransactionStatus.FAILED,
              verificationData?.flw_ref,
            );
            // Update attempts/timestamp as well
            await this.transactionRepository.update(transactionId, {
              verificationAttempts: attempt,
              lastVerificationAttemptAt: new Date(),
            });
            return; // Failure confirmed, stop retrying
          } else {
            // Treat other statuses (pending, error from Flutterwave, etc.) or API errors as retryable
            this.logger.warn(
              `Transaction ${transactionId} verification inconclusive on attempt ${attempt} (API: ${apiStatus}, TX: ${transactionStatus}). Retrying...`,
            );
            throw new Error('Inconclusive verification status'); // Trigger retry
          }
        },
        {
          ...this.VERIFICATION_RETRY_FACTORS,
          onRetry: (error: any, attempt) => {
            this.logger.warn(
              `Retrying verification for transaction ${transactionId} (Attempt ${attempt}) due to: ${error.message}`,
            );
          },
        },
      );
    } catch (error) {
      // This block is reached if retries are exhausted or bail() was called
      this.logger.error(
        `Failed to verify transaction ${transactionId} after multiple attempts or due to non-retryable error: ${error.message}`,
      );
      // Ensure status is ERROR if retries fail or bail is called outside the atomic block
      if (
        error.message !== 'Max verification duration exceeded' &&
        !error.message.startsWith('Atomic update failed')
      ) {
        await this._updateTransactionStatus(
          transactionId,
          TransactionStatus.ERROR,
        );
      } else if (error.message === 'Max verification duration exceeded') {
        // Handle max duration exceeded - potentially set to a specific status?
        // For now, setting to ERROR as well.
        await this._updateTransactionStatus(
          transactionId,
          TransactionStatus.ERROR, // Or maybe a new 'TIMEOUT' status?
        );
      }
      // If it's 'Atomic update failed', the status was already set to ERROR after rollback.
    }
  }

  async processFlutterWebhook(payload: any, signature: string) {
    // TODO: Implement the handling of different types of webhooks, for success, failure, cancellation, etc.

    this.logger.log('Received Flutterwave webhook');
    // 1. Verify Signature (same as before)
    const flutterwaveWebhookHash = this.configService.get<string>(
      'FLUTTERWAVE_WEBHOOK_HASH',
    );
    if (flutterwaveWebhookHash !== signature) {
      this.logger.error('Invalid webhook signature received');
      throw new UnauthorizedException('Invalid webhook signature');
    }
    this.logger.log(`Webhook signature verified for txRef: ${payload?.txRef}`);

    // 2. Extract Key Information
    const reference = payload?.txRef; // Use txRef which is our reference
    const externalId = payload?.id?.toString(); // Flutterwave's transaction ID

    if (!reference) {
      this.logger.error('txRef (reference) missing from webhook payload');
      throw new BadRequestException(
        'Transaction reference missing from payload',
      );
    }
    if (!externalId) {
      this.logger.error('id (externalId) missing from webhook payload');
      throw new BadRequestException(
        'External transaction ID missing from payload',
      );
    }

    // 3. Find Pending Transaction by Reference
    let transaction;
    try {
      transaction = await this.transactionRepository.findOne({
        where: { reference: reference, status: TransactionStatus.PENDING },
      });

      if (!transaction) {
        // Could be already processed or reference is wrong
        // Check if already successful/failed based on externalId to handle potential duplicate webhooks
        const existingCompleted = await this.transactionRepository.findOne({
          where: [
            { externalId: externalId, status: TransactionStatus.SUCCESSFUL },
            { externalId: externalId, status: TransactionStatus.FAILED },
            { externalId: externalId, status: TransactionStatus.ERROR },
          ],
        });
        if (existingCompleted) {
          this.logger.log(
            `Webhook received for already completed transaction (Ref: ${reference}, ExternalId: ${externalId}, Status: ${existingCompleted.status}). Ignoring.`,
          );
          return 'Webhook ignored, transaction already completed.';
        } else {
          this.logger.warn(
            `Pending transaction with reference ${reference} not found for webhook (External ID: ${externalId}). Might be processed or invalid.`,
          );
          throw new NotFoundException(
            `Pending transaction with reference ${reference} not found.`,
          );
        }
      }
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(
        `Error finding transaction by reference ${reference}: ${error.message}`,
      );
      throw new InternalServerErrorException(
        'Database error finding transaction.',
      );
    }

    // 4. Update Transaction with External ID (if needed)
    if (!transaction.externalId) {
      try {
        await this.transactionRepository.update(transaction.id, { externalId });
        this.logger.log(
          `Updated transaction ${transaction.id} with externalId ${externalId}`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to update externalId for transaction ${transaction.id}: ${error.message}`,
        );
        // Decide if this is critical enough to stop processing
        throw new InternalServerErrorException(
          'Failed to store external transaction ID.',
        );
      }
    } else if (transaction.externalId !== externalId) {
      // This case should be rare if reference is unique, but log a warning
      this.logger.warn(
        `Webhook externalId ${externalId} differs from stored externalId ${transaction.externalId} for transaction ${transaction.id}. Using webhook's ID for verification.`,
      );
      try {
        await this.transactionRepository.update(transaction.id, { externalId });
      } catch (error) {
        this.logger.error(
          `Failed to update differing externalId for transaction ${transaction.id}: ${error.message}`,
        );
        throw new InternalServerErrorException(
          'Failed to update external transaction ID.',
        );
      }
    }

    // 5. Trigger Verification (Asynchronously - Fire and Forget)
    // We don't await this so the webhook returns quickly.
    // The verifyTransaction method handles its own state updates.
    this.verifyFlutterTransaction(transaction.id).catch((error) => {
      // Log errors from the async verification process if needed,
      // but the method itself should handle setting ERROR status.
      this.logger.error(
        `Error occurred during background verification triggered by webhook for transaction ${transaction.id}: ${error.message}`,
        error.stack,
      );
    });

    this.logger.log(
      `Webhook for transaction ${transaction.id} processed. Verification triggered in background.`,
    );
    return 'Webhook received and verification initiated.'; // Return quickly
  }

  async initiateTransaction(
    amount: number,
    userId: string,
    paymentReason: PaymentReason,
  ): Promise<{ reference: string; transactionId: string }> {
    this.logger.log(
      `Initiating transaction for user ${userId}, amount ${amount}, reason ${paymentReason}`,
    );

    if (paymentReason === PaymentReason.PREMIUM && amount < 4000) {
      throw new BadRequestException(
        'Premium transactions must be at least 4000.',
      );
    }

    if (paymentReason === PaymentReason.FREEMIUM && amount < 100) {
      throw new BadRequestException(
        'Freemium transactions must be at least 100.',
      );
    }

    // 1. Ensure user exists (optional but recommended)
    try {
      await this.userService.findOne(userId); // Assuming findOne exists
    } catch (error) {
      if (error instanceof NotFoundException) {
        this.logger.error(`User with ID ${userId} not found for initiation.`);
        throw new BadRequestException(`User with ID ${userId} not found.`);
      }
      this.logger.error(
        `Error checking user ${userId} during initiation: ${error.message}`,
      );
      throw new InternalServerErrorException('Failed to validate user.');
    }

    // 2. Generate unique reference
    const reference = `CIN-${uuidv4()}`;

    // 3. Create pending transaction
    const newTransaction = this.transactionRepository.create({
      amount,
      userId,
      paymentReason,
      reference,
      status: TransactionStatus.PENDING,
      paymentChanel: PaymentChannel.FLUTTERWAVE, // Default or determine based on context
      externalId: null,
      externalReference: null,
      verificationAttempts: 0,
      lastVerificationAttemptAt: null,
    });

    // 4. Save transaction
    try {
      const savedTransaction =
        await this.transactionRepository.save(newTransaction);
      this.logger.log(
        `Created pending transaction ${savedTransaction.id} with reference ${reference}`,
      );
      return {
        reference: savedTransaction.reference,
        transactionId: savedTransaction.id,
      };
    } catch (error) {
      // Handle potential unique constraint violation on reference, though unlikely with UUID
      this.logger.error(
        `Failed to save initial pending transaction for reference ${reference}: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException(
        'Failed to initiate transaction record.',
      );
    }
  }

  // Define polling constants (consider moving to config)
  private POLLING_MAX_ATTEMPTS = this.VERIFICATION_RETRY_FACTORS.retries + 2; // Allow a couple more attempts via polling
  private POLLING_RETRY_THRESHOLD_MINUTES = 5; // Only retry if last attempt was > 5 mins ago

  @Cron(CronExpression.EVERY_30_MINUTES)
  async handlePendingTransactionPolling() {
    this.logger.log('Running scheduled job to poll pending transactions...');

    const retryThreshold = new Date();
    retryThreshold.setMinutes(
      retryThreshold.getMinutes() - this.POLLING_RETRY_THRESHOLD_MINUTES,
    );

    // Find transactions that are pending, have an externalId, haven't exceeded max attempts,
    // and haven't been attempted recently.
    const findOptions: FindOptionsWhere<Transaction> = {
      status: TransactionStatus.PENDING,
      externalId: MoreThan(''), // Checks for non-null and non-empty string
      verificationAttempts: LessThan(this.POLLING_MAX_ATTEMPTS),
      // Only poll if last attempt was before threshold OR never attempted
      lastVerificationAttemptAt: LessThan(retryThreshold),
    };
    const findOptionsNeverAttempted: FindOptionsWhere<Transaction> = {
      status: TransactionStatus.PENDING,
      externalId: MoreThan(''),
      verificationAttempts: 0, // Specifically find those never attempted
      lastVerificationAttemptAt: null,
    };

    let pendingTransactions: Transaction[] = [];
    try {
      const recentlyAttempted = await this.transactionRepository.find({
        where: findOptions,
      });
      const neverAttempted = await this.transactionRepository.find({
        where: findOptionsNeverAttempted,
      });
      pendingTransactions = [...recentlyAttempted, ...neverAttempted];
    } catch (error) {
      this.logger.error(
        `Polling Job: Error fetching pending transactions: ${error.message}`,
        error.stack,
      );
      return; // Exit job run on DB error
    }

    if (pendingTransactions.length === 0) {
      this.logger.log(
        'Polling Job: No pending transactions found needing verification.',
      );
      return;
    }

    this.logger.log(
      `Polling Job: Found ${pendingTransactions.length} pending transaction(s) to verify.`,
    );

    // Process verification for each (consider concurrency limits if many)
    for (const transaction of pendingTransactions) {
      this.logger.log(
        `Polling Job: Triggering verification for transaction ${transaction.id}`,
      );
      // Trigger verification asynchronously
      this.verifyFlutterTransaction(transaction.id).catch((error) => {
        this.logger.error(
          `Polling Job: Error during background verification for transaction ${transaction.id}: ${error.message}`,
          error.stack,
        );
      });
      // Optional: Add a small delay between triggers if needed
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    this.logger.log('Polling Job: Finished triggering verifications.');
  }
}
