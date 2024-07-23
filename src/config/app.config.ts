import { registerAs } from '@nestjs/config';
import { env } from 'node:process';

export default registerAs('app', () => ({
  port: env.PORT,
}));
