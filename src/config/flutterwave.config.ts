import { registerAs } from '@nestjs/config';
import { env } from 'node:process';

export default registerAs('flutterwave', () => ({
  secretKey: env.FLUTTERWAVE_SECRET_KEY,
  encryptionKey: env.FLUTTERWAVE_ENCRYPTION_KEY,
}));
