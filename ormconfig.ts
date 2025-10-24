import { DataSource } from 'typeorm';
import { config } from 'dotenv';

config();

const isLocalHost = (h?: string) => {
  if (!h) return true;
  const host = String(h).toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local');
};
const sslEnv = process.env.POSTGRES_SSL?.toLowerCase();
const sslEnabled = sslEnv === 'true' ? true : sslEnv === 'false' ? false : !isLocalHost(process.env.POSTGRES_HOST);
const sslOption: false | { rejectUnauthorized: boolean } = sslEnabled ? { rejectUnauthorized: false } : false;

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
  ssl: sslOption,
});

AppDataSource.initialize()
  .then(() => {
    console.log('Data Source has been initialized!');
  })
  .catch((err) => {
    console.error('Error during Data Source initialization', err);
  });

export default AppDataSource;
