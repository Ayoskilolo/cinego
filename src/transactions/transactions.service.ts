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
  In,
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
    const result = await paginate(query, this.transactionRepository, {
      sortableColumns: ['dateCreated', 'amount', 'paymentReason', 'status'],
      defaultSortBy: [['dateCreated', 'DESC']],
      searchableColumns: ['reference', 'externalReference', 'paymentReason'],
      filterableColumns: {
        paymentReason: true,
        paymentChanel: true,
        status: true,
        amount: [FilterOperator.GTE, FilterOperator.LTE],
        dateCreated: [FilterOperator.GTE, FilterOperator.LTE],
      },
      relations: ['user'],
      select: [
        'id',
        'amount',
        'reference',
        'externalId',
        'externalReference',
        'paymentReason',
        'paymentChanel',
        'status',
        'userId',
        'dateCreated',
      ],
    });

    // Ensure user relation is a minimal object: { id, email, firstName, lastName }
    result.data = result.data.map((tx: any) => {
      if (tx.user) {
        tx.user = this.toMinimalUser(tx.user as User);
      }
      return tx;
    });

    return result;
  }

  async findByUser(userId: string, query: PaginateQuery) {
    const result = await paginate(query, this.transactionRepository, {
      sortableColumns: ['dateCreated', 'amount', 'paymentReason', 'status'],
      defaultSortBy: [['dateCreated', 'DESC']],
      searchableColumns: ['reference', 'externalReference', 'paymentReason'],
      filterableColumns: {
        paymentReason: true,
        paymentChanel: true,
        status: true,
        amount: [FilterOperator.GTE, FilterOperator.LTE],
        dateCreated: [FilterOperator.GTE, FilterOperator.LTE],
      },
      where: { userId },
      relations: ['user'],
      select: [
        'id',
        'amount',
        'reference',
        'externalId',
        'externalReference',
        'paymentReason',
        'paymentChanel',
        'status',
        'dateCreated',
      ],
    });

    // Ensure user relation is a minimal object: { id, email, firstName, lastName }
    result.data = result.data.map((tx: any) => {
      if (tx.user) {
        tx.user = this.toMinimalUser(tx.user as User);
      }
      return tx;
    });

    return result;
  }

  async findOne(id: string) {
    const transaction = await this.transactionRepository.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!transaction) {
      throw new NotFoundException(`Transaction with ID ${id} not found`);
    }

    const shaped = Object.assign({}, transaction, {
      user: transaction.user
        ? this.toMinimalUser(transaction.user as User)
        : undefined,
    });

    return { data: shaped };
  }

  // Helper to shape user object in transaction responses
  private toMinimalUser(user: User) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    };
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
                updatePayload.nextBillingDate = expiryDate; // Set next billing date to same as expiry
                needsUpdate = true;
              } else if (transaction.paymentReason === PaymentReason.FREEMIUM) {
                this.logger.log(
                  `Updating user ${user.id} to FREEMIUM subscription within transaction.`,
                );
                updatePayload.subscriptionType = SubscriptionType.FREEMIUM;
                updatePayload.isSubscribed = true;
                updatePayload.subscriptionExpiresAt = null; // Freemium might not expire
                updatePayload.nextBillingDate = null; // No billing for freemium
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
    this.logger.log('Received Flutterwave webhook');
    // 1. Verify Signature
    const flutterwaveWebhookHash = this.configService.get<string>(
      'FLUTTERWAVE_WEBHOOK_HASH',
    );
    if (flutterwaveWebhookHash !== signature) {
      this.logger.error('Invalid webhook signature received');
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const eventType = payload?.event;
    const eventData = payload?.data;

    this.logger.log(`Webhook signature verified. Event: ${eventType}`);

    if (!eventData) {
      this.logger.error('Webhook payload missing "data" object');
      throw new BadRequestException('Webhook payload missing "data" object');
    }

    // Handle subscription.cancelled event type separately as it doesn't have tx_ref
    if (eventType === 'subscription.cancelled') {
      const customerEmail = eventData?.customer?.email;
      const flutterwaveSubscriptionId = eventData?.id?.toString();

      if (!customerEmail) {
        this.logger.error(
          `Email missing from 'subscription.cancelled' webhook (Flutterwave Subscription ID: ${flutterwaveSubscriptionId || 'N/A'}). Cannot process reliably.`,
        );
        throw new BadRequestException(
          `Email missing from 'subscription.cancelled' payload data.`,
        );
      }

      this.logger.log(
        `Processing 'subscription.cancelled' webhook directly for email: ${customerEmail}, Flutterwave Subscription ID: ${flutterwaveSubscriptionId || 'N/A'}`,
      );

      try {
        const user = await this.userService.findOneByEmail(customerEmail);

        if (
          user.subscriptionType === SubscriptionType.FREE_TIER &&
          !user.isSubscribed
        ) {
          this.logger.log(
            `User ${user.id} (Email: ${customerEmail}) is already on FREE_TIER or not subscribed. 'subscription.cancelled' webhook action redundant.`,
          );
          return `Subscription for user ${user.id} (Email: ${customerEmail}) already reflects a non-active/free status.`;
        }

        const updatePayload: Partial<User> = {
          subscriptionType: SubscriptionType.FREE_TIER,
          isSubscribed: false,
          subscriptionExpiresAt: null,
          nextBillingDate: null,
        };

        await this.userService.updateUser(user.id, updatePayload);

        this.logger.log(
          `Successfully processed 'subscription.cancelled' webhook for user ${user.id} (Email: ${customerEmail}). User subscription set to FREE_TIER.`,
        );
        return `Subscription cancelled successfully for user ${user.id} with email ${customerEmail}.`;
      } catch (error) {
        if (error instanceof NotFoundException) {
          this.logger.warn(
            `User with email ${customerEmail} not found while processing 'subscription.cancelled' webhook (Flutterwave Subscription ID: ${flutterwaveSubscriptionId || 'N/A'}). Ignoring.`,
          );
          return `Webhook for 'subscription.cancelled' acknowledged: User with email ${customerEmail} not found. No action taken.`;
        }
        this.logger.error(
          `Error processing 'subscription.cancelled' webhook for email ${customerEmail} (Flutterwave Subscription ID: ${flutterwaveSubscriptionId || 'N/A'}): ${error.message}`,
          error.stack,
        );
        throw new InternalServerErrorException(
          `Failed to process subscription cancellation for email ${customerEmail}. Please check logs for details.`,
        );
      }
    }

    // For other event types, proceed with tx_ref based logic
    const reference = eventData?.tx_ref; // Our internal reference
    const externalId = eventData?.id?.toString(); // Flutterwave's transaction ID
    const flutterwaveStatus = eventData?.status; // e.g., "successful", "failed" from data object
    const flwRef = eventData?.flw_ref; // Flutterwave's reference string

    if (!reference) {
      this.logger.error(
        `txRef (reference) missing from webhook payload data for event: ${eventType}. This is unexpected for non-cancellation events.`,
      );
      throw new BadRequestException(
        `Transaction reference missing from payload data for event type ${eventType}`,
      );
    }

    // Find transaction by our internal reference
    const transaction = await this.transactionRepository.findOne({
      where: { reference: reference },
    });

    if (!transaction) {
      this.logger.warn(
        `Transaction with reference ${reference} not found for webhook event '${eventType}'. External ID from webhook: ${externalId}. Ignoring.`,
      );
      if (eventType === 'charge.completed') {
        throw new NotFoundException(
          `Transaction with reference ${reference} not found for event '${eventType}'.`,
        );
      }
      return `Webhook for event '${eventType}' on non-existent local transaction ${reference} ignored.`;
    }

    this.logger.log(
      `Processing webhook event '${eventType}' for transaction ${transaction.id} (current status: ${transaction.status}). Flutterwave data status: ${flutterwaveStatus}`,
    );

    // The switch statement will now only handle events that are expected to have a tx_ref
    switch (eventType) {
      case 'charge.completed':
        if (!externalId) {
          this.logger.error(
            `'id' (externalId) missing from 'charge.completed' webhook payload data for txRef ${reference}. Cannot process reliably.`,
          );
          throw new BadRequestException(
            `External transaction ID missing from 'charge.completed' payload data.`,
          );
        }

        // Ensure externalId in our DB matches/is updated with the one from the webhook
        if (!transaction.externalId) {
          this.logger.log(
            `Transaction ${transaction.id} missing externalId. Updating with ${externalId} from webhook.`,
          );
          await this.transactionRepository.update(transaction.id, {
            externalId,
          });
          transaction.externalId = externalId; // Keep in-memory object consistent
        } else if (transaction.externalId !== externalId) {
          this.logger.warn(
            `Webhook externalId ${externalId} differs from stored externalId ${transaction.externalId} for transaction ${transaction.id}. Updating to use webhook's ID.`,
          );
          await this.transactionRepository.update(transaction.id, {
            externalId,
          });
          transaction.externalId = externalId;
        }

        // Handle based on flutterwaveStatus from the webhook data
        if (flutterwaveStatus === 'successful') {
          if (transaction.status === TransactionStatus.SUCCESSFUL) {
            this.logger.log(
              `Transaction ${transaction.id} is already SUCCESSFUL. Webhook for 'charge.completed' (successful) ignored to prevent reprocessing.`,
            );
            return 'Webhook ignored, transaction already successful.';
          }
          this.logger.log(
            `Charge reported as 'successful' by webhook for ${transaction.id}. Triggering full verification.`,
          );
          this.verifyFlutterTransaction(transaction.id).catch((error) => {
            this.logger.error(
              `Error during background verification triggered by 'charge.completed' (successful) webhook for transaction ${transaction.id}: ${error.message}`,
            );
          });
          return 'Webhook for successful charge processed; verification initiated.';
        } else if (flutterwaveStatus === 'failed') {
          if (transaction.status === TransactionStatus.FAILED) {
            this.logger.log(
              `Transaction ${transaction.id} is already FAILED. Webhook for 'charge.completed' (failed) ignored.`,
            );
            return 'Webhook ignored, transaction already failed.';
          }
          if (transaction.status === TransactionStatus.SUCCESSFUL) {
            this.logger.error(
              `CRITICAL: Transaction ${transaction.id} is SUCCESSFUL in DB, but 'charge.completed' (failed) webhook received. Manual investigation needed. Status NOT changed by webhook.`,
            );
            return 'Webhook for failed charge processed, but conflicts with existing successful status; manual review needed.';
          }
          this.logger.log(
            `Charge reported as 'failed' by webhook for ${transaction.id}. Updating status to FAILED.`,
          );
          await this._updateTransactionStatus(
            transaction.id,
            TransactionStatus.FAILED,
            flwRef || transaction.externalReference,
          );
          return 'Webhook for failed charge processed; transaction marked as FAILED.';
        } else {
          // e.g., "pending", "requires_action", etc.
          this.logger.log(
            `'charge.completed' webhook for transaction ${transaction.id} has Flutterwave status '${flutterwaveStatus}'. No immediate status change by webhook. Verification cron or subsequent events will handle.`,
          );
          // If our transaction is PENDING, we can proactively trigger verification.
          if (transaction.status === TransactionStatus.PENDING) {
            this.verifyFlutterTransaction(transaction.id).catch((err) => {
              this.logger.error(
                `Error in background verification for ${transaction.id} (webhook - ${flutterwaveStatus}): ${err.message}`,
              );
            });
            return `Webhook for charge with status '${flutterwaveStatus}' processed; verification re-triggered if applicable.`;
          }
          return `Webhook for charge with status '${flutterwaveStatus}' processed.`;
        }

      // --- Placeholder for other event types ---
      // Consult Flutterwave documentation for exact event names and payloads
      case 'transfer.completed': // Example, may be 'transfer.successful'
      case 'transfer.successful':
      case 'transfer.failed':
        // this.logger.log(
        //   `Received '${eventType}' event for transaction ${transaction.id}. Data: ${JSON.stringify(eventData)}. Implement specific logic.`,
        // );
        // Example:
        // if (eventType === 'transfer.successful' && transaction.paymentReason === PaymentReason.PAYOUT) {
        //   await this.handleSuccessfulPayout(transaction, eventData);
        // }
        return `Webhook event '${eventType}' for transaction ${transaction.id} acknowledged. Specific handling TBD.`;

      case 'subscription.cancelled':
        const customerEmail = eventData?.customer?.email;
        const flutterwaveSubscriptionId = eventData?.id?.toString();

        if (!customerEmail) {
          this.logger.error(
            `Email missing from 'subscription.cancelled' webhook (Flutterwave Subscription ID: ${flutterwaveSubscriptionId || 'N/A'}). Cannot process reliably.`,
          );
          throw new BadRequestException(
            `Email missing from 'subscription.cancelled' payload data.`,
          );
        }

        this.logger.log(
          `Processing 'subscription.cancelled' webhook for email: ${customerEmail}, Flutterwave Subscription ID: ${flutterwaveSubscriptionId || 'N/A'}`,
        );

        try {
          const user = await this.userService.findOneByEmail(customerEmail);

          // If user is already on FREE_TIER or not subscribed, log and exit gracefully.
          if (
            user.subscriptionType === SubscriptionType.FREE_TIER &&
            !user.isSubscribed
          ) {
            this.logger.log(
              `User ${user.id} (Email: ${customerEmail}) is already on FREE_TIER or not subscribed. 'subscription.cancelled' webhook action redundant.`,
            );
            return `Subscription for user ${user.id} (Email: ${customerEmail}) already reflects a non-active/free status.`;
          }

          const updatePayload: Partial<User> = {
            subscriptionType: SubscriptionType.FREE_TIER,
            isSubscribed: false,
            subscriptionExpiresAt: null,
            nextBillingDate: null,
          };

          await this.userService.updateUser(user.id, updatePayload);

          this.logger.log(
            `Successfully processed 'subscription.cancelled' webhook for user ${user.id} (Email: ${customerEmail}). User subscription set to FREE_TIER.`,
          );
          return `Subscription cancelled successfully for user ${user.id} with email ${customerEmail}.`;
        } catch (error) {
          if (error instanceof NotFoundException) {
            this.logger.warn(
              `User with email ${customerEmail} not found while processing 'subscription.cancelled' webhook (Flutterwave Subscription ID: ${flutterwaveSubscriptionId || 'N/A'}). Ignoring.`,
            );
            return `Webhook for 'subscription.cancelled' acknowledged: User with email ${customerEmail} not found. No action taken.`;
          }

          this.logger.error(
            `Error processing 'subscription.cancelled' webhook for email ${customerEmail} (Flutterwave Subscription ID: ${flutterwaveSubscriptionId || 'N/A'}): ${error.message}`,
            error.stack,
          );
          throw new InternalServerErrorException(
            `Failed to process subscription cancellation for email ${customerEmail}. Please check logs for details.`,
          );
        }

      default:
        this.logger.warn(
          `Received unhandled webhook event type: '${eventType}' for transaction ${transaction.id}. Payload data: ${JSON.stringify(eventData)}`,
        );
        return `Webhook event '${eventType}' for transaction ${transaction.id} received but not specifically handled.`;
    }
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

  async cancelSubscription(userId: string) {
    // this.logger.log(`Attempting to cancel subscription for user ${userId}`);
    // const user = await this.userService.findOneById(userId);
    // if (!user) {
    //   throw new NotFoundException(`User with ID ${userId} not found`);
    // }
    // if (
    //   !user.isSubscribed ||
    //   user.subscriptionType === SubscriptionType.FREE_TIER
    // ) {
    //   throw new BadRequestException('No active subscription to cancel');
    // }
    // // Call Flutterwave API to cancel the subscription
    // try {
    //   const flutterwaveSecretKey = this.configService.get<string>(
    //     'FLUTTERWAVE_SECRET_KEY',
    //   );
    //   const flutterwaveBaseUrl = 'https://api.flutterwave.com/v3';
    //   // Make API call to Flutterwave to cancel subscription
    //   // Note: This is a placeholder - you'll need to check Flutterwave's API docs
    //   // for the exact endpoint and payload structure
    //   const response = await firstValueFrom(
    //     this.httpService.post(
    //       `${flutterwaveBaseUrl}/subscriptions/cancel`,
    //       {
    //         transaction_reference: latestTransaction.externalReference,
    //       },
    //       {
    //         headers: {
    //           Authorization: `Bearer ${flutterwaveSecretKey}`,
    //           'Content-Type': 'application/json',
    //         },
    //       },
    //     ),
    //   );
    //   this.logger.log(
    //     `Flutterwave cancellation response: ${JSON.stringify(response.data)}`,
    //   );
    //   // Check if cancellation was successful
    //   if (response.data?.status !== 'success') {
    //     this.logger.error(
    //       `Failed to cancel subscription with Flutterwave: ${JSON.stringify(response.data)}`,
    //     );
    //     // Continue with local cancellation even if Flutterwave fails
    //   }
    // } catch (error) {
    //   this.logger.error(
    //     `Error calling Flutterwave API: ${error.message}`,
    //     error.stack,
    //   );
    //   // Continue with local cancellation even if API call fails
    // }
  }

  // Aggregated stats for charting
  async getAggregatedStats(params: {
    from?: string;
    to?: string;
    interval?: 'day' | 'week' | 'month';
    status?: string; // accepts enum labels like SUCCESS, SUCCESSFUL, PENDING, FAILED, ERROR
    timezone?: string; // currently standardized to UTC
  }): Promise<{
    series: { date: string; revenue: number; transactions: number }[];
  }> {
    const interval = (params.interval ?? 'day') as 'day' | 'week' | 'month';
    if (!['day', 'week', 'month'].includes(interval)) {
      throw new BadRequestException(
        `Invalid interval '${params.interval}'. Use day|week|month.`,
      );
    }

    // Parse dates (default last 30 days)
    const nowUtc = new Date();
    const defaultFrom = new Date(nowUtc.getTime() - 30 * 24 * 60 * 60 * 1000);
    const from = params.from ? new Date(params.from) : defaultFrom;
    const to = params.to ? new Date(params.to) : nowUtc;

    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      throw new BadRequestException(
        'Invalid from/to datetime. Provide ISO 8601 strings.',
      );
    }
    if (from > to) {
      throw new BadRequestException('`from` must be <= `to`.');
    }

    // Map status string (if provided) to enum value
    let statusFilter: TransactionStatus | undefined;
    if (params.status) {
      const normalized = params.status.toUpperCase();
      if (normalized === 'SUCCESS') {
        statusFilter = TransactionStatus.SUCCESSFUL;
      } else if (normalized in TransactionStatus) {
        statusFilter = (TransactionStatus as any)[normalized];
      } else {
        // Also try enum values string match (e.g., 'successful')
        const foundKey = Object.keys(TransactionStatus).find(
          (k) => (TransactionStatus as any)[k] === params.status,
        );
        if (foundKey) statusFilter = (TransactionStatus as any)[foundKey];
      }
      if (!statusFilter) {
        throw new BadRequestException(
          `Invalid status '${params.status}'. Use one of: ${Object.keys(TransactionStatus).join(', ')}`,
        );
      }
    }

    // Build aggregation query (UTC standardization)
    const qb = this.transactionRepository.createQueryBuilder('t');

    const dateTruncUnit = interval; // 'day' | 'week' | 'month' (whitelisted)
    // Group by UTC-truncated bucket
    qb.select(`date_trunc('${dateTruncUnit}', t."dateCreated")`, 'bucket')
      .addSelect('COUNT(*)', 'transactions')
      .addSelect('COALESCE(SUM(t.amount), 0)', 'revenue_major')
      .where('t."dateCreated" >= :from AND t."dateCreated" <= :to', {
        from: from.toISOString(),
        to: to.toISOString(),
      });

    if (statusFilter) {
      qb.andWhere('t.status = :status', { status: statusFilter });
    }

    qb.groupBy('bucket').orderBy('bucket', 'ASC');

    type RawRow = { bucket: Date; transactions: string; revenue_major: string };
    const raw: RawRow[] = await qb.getRawMany();

    // Map results by bucket ISO date (YYYY-MM-DD)
    const fmt = (d: Date) => {
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, '0');
      const day = String(d.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    const trunc = (d: Date): Date => {
      const dt = new Date(d.getTime());
      if (interval === 'day') {
        return new Date(
          Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()),
        );
      }
      if (interval === 'week') {
        // Align to Monday (to match Postgres date_trunc('week', ...))
        const dow = dt.getUTCDay(); // 0=Sun..6=Sat
        const delta = (dow + 6) % 7; // days since Monday
        const monday = new Date(
          Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()),
        );
        monday.setUTCDate(monday.getUTCDate() - delta);
        return monday;
      }
      // month
      return new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), 1));
    };

    const step = (d: Date): Date => {
      const nd = new Date(d.getTime());
      if (interval === 'day') {
        nd.setUTCDate(nd.getUTCDate() + 1);
      } else if (interval === 'week') {
        nd.setUTCDate(nd.getUTCDate() + 7);
      } else {
        nd.setUTCMonth(nd.getUTCMonth() + 1);
      }
      return nd;
    };

    const startBucket = trunc(from);
    const endBucket = trunc(to);

    const map = new Map<
      string,
      { revenueMajor: number; transactions: number }
    >();
    for (const r of raw) {
      const b = new Date(r.bucket);
      const key = fmt(trunc(b));
      map.set(key, {
        revenueMajor: Number(r.revenue_major) || 0,
        transactions: Number(r.transactions) || 0,
      });
    }

    const series: { date: string; revenue: number; transactions: number }[] =
      [];
    for (
      let cur = startBucket;
      cur.getTime() <= endBucket.getTime();
      cur = step(cur)
    ) {
      const key = fmt(cur);
      const entry = map.get(key) ?? { revenueMajor: 0, transactions: 0 };
      // Convert to smallest unit (assume stored major units)
      const revenueMinor = Math.round(entry.revenueMajor * 100);
      series.push({
        date: key,
        revenue: revenueMinor,
        transactions: entry.transactions,
      });
    }

    return { series };
  }
}
