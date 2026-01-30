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
  agoraAppId: env.AGORA_APP_ID,
  agoraAppCertificate: env.AGORA_APP_CERTIFICATE,
  agoraTokenExpiry: env.AGORA_TOKEN_EXPIRY,
}));
