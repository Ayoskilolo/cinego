import { registerAs } from '@nestjs/config';
import { env } from 'node:process';

const isLocalHost = (h?: string) => {
  if (!h) return true;
  const host = String(h).toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local');
};
const sslEnv = env.POSTGRES_SSL?.toLowerCase();
const sslEnabled = sslEnv === 'true' ? true : sslEnv === 'false' ? false : !isLocalHost(env.POSTGRES_HOST);
const sslOption: false | { rejectUnauthorized: boolean } = sslEnabled ? { rejectUnauthorized: false } : false;

export default registerAs('database', () => ({
  type: 'postgres',
  host: env.POSTGRES_HOST,
  port: env.POSTGRES_PORT,
  username: env.POSTGRES_USER,
  password: env.POSTGRES_PASSWORD,
  database: env.POSTGRES_DB,
  autoLoadEntities: true,
  // Explicitly include all entity files to avoid missing metadata issues during DataSource initialization
  entities: [`${__dirname}/../**/*.entity.{ts,js}`],
  synchronize: true,
  migrations: [`${__dirname}/../database/migration/**/*.{ts,js}`],
  ssl: sslOption,
}));
