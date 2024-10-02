import { registerAs } from '@nestjs/config';
// import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { env } from 'node:process';

// export default registerAs(
//   'database',
//   (): TypeOrmModuleOptions => ({
//     type: 'mongodb',
//     url: env.MONGO_URL,
//     database: env.DATABASE_NAME,
//     autoLoadEntities: true,
//   }),
// );

export default registerAs('database', () => ({
  type: 'postgres',
  host: env.POSTGRES_HOST,
  port: env.POSTGRES_PORT,
  username: env.POSTGRES_USER,
  password: env.POSTGRES_PASSWORD,
  database: env.POSTGRES_DB,
  autoLoadEntities: true,
  synchronize: true,
  migrations: [`${__dirname}/../database/migration/**/*.{ts,js}`],

  ...(process.env.NODE_ENV !== 'development' && {
    ssl: { rejectUnauthorized: false },
  }),
}));
