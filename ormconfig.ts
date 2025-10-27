import { DataSource } from 'typeorm';
import { config } from 'dotenv';

config();

const isLocalHost = (h?: string) => {
  if (!h) return true;
  const host = String(h).toLowerCase();
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host.endsWith('.local')
  );
};
const sslEnv = process.env.POSTGRES_SSL?.toLowerCase();
// Always enable TLS for remote (non-local) hosts
const sslOption: false | { rejectUnauthorized: boolean } = isLocalHost(process.env.POSTGRES_HOST)
  ? false
  : { rejectUnauthorized: false };

const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.POSTGRES_HOST,
  port: +process.env.POSTGRES_PORT,
  username: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
  entities: [`${__dirname}/**/*.entity.{ts,js}`],
  migrations: [`${__dirname}/database/migrations/**/*.{ts,js}`],
  synchronize: true,
  // Send driver-level SSL object when remote
  ssl: sslOption,
  extra: sslOption ? { ssl: sslOption, keepAlive: true } : { keepAlive: true },
});

AppDataSource.initialize()
  .then(() => {
    console.log('Data Source has been initialized!');
  })
  .catch((err) => {
    console.error('Error during Data Source initialization', err);
  });

export default AppDataSource;
