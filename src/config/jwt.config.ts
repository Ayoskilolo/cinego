import { registerAs } from '@nestjs/config';
import { env } from 'node:process';

export default registerAs('jwt', () => ({
  secret: env.JWT_SECRET,
  global: true,
}));
