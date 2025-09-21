import { registerAs } from '@nestjs/config';
import { env } from 'node:process';

export default registerAs('aws', () => ({
  region: env.AWS_REGION,
  accessKeyId: env.AWS_ACCESS_KEY_ID,
  secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  roleArn: env.AWS_ROLE_ARN,
  bucketName: env.AWS_BUCKET_NAME || 'test-cinego',
}));
