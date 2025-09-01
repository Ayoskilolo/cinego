import { registerAs } from '@nestjs/config';
import { env } from 'node:process';

export default registerAs('jwt', () => ({
  secret: env.JWT_SECRET,
  global: true,
  // Add default expiration; can be overridden per signAsync call
  signOptions: {
    expiresIn: env.JWT_EXPIRES_IN || '1h',
  },
}));
