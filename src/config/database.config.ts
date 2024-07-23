import { registerAs } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { env } from 'node:process';

export default registerAs(
  'database',
  (): TypeOrmModuleOptions => ({
    type: 'mongodb',
    url: env.MONGO_URL,
    database: env.DATABASE_NAME,
    autoLoadEntities: true,
  }),
);
