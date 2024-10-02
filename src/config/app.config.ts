import { registerAs } from '@nestjs/config';
import { env } from 'node:process';

export default registerAs('app', () => ({
  port: env.PORT,
  baseUrl: env.BASE_URL,
  nodeEnvironment: env.NODE_ENV,
  encryption: {
    key: env.ENCRYPTION_KEY,
    iv: env.INITIATION_VECTOR,
  },
}));
