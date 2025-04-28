export enum PaymentReason {
  PREMIUM = 'premium',
  FREEMIUM = 'freemium',
}

// Assuming your enums are in this file
export enum PaymentChannel {
  FLUTTERWAVE = 'flutterwave',
  // Add other channels if needed
}

export enum TransactionStatus {
  PENDING = 'pending',
  SUCCESSFUL = 'successful',
  FAILED = 'failed', // Explicit failure from provider
  ERROR = 'error', // Verification failed after retries or unexpected issue
}
