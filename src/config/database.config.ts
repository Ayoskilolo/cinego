import { registerAs } from '@nestjs/config';
import { env } from 'node:process';

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
// NOTE: Do not read env values at module load time for dynamic config.
// Nest's ConfigModule populates env after this file is imported.

export default registerAs('database', () => {
  // Re-read env inside the factory to ensure values are available
  const sslEnv = env.POSTGRES_SSL?.toLowerCase();
  const connectionUrl = env.DATABASE_URL || env.POSTGRES_URL;
  const host = connectionUrl ? undefined : env.POSTGRES_HOST;
  // If host is missing (using URL), assume remote to enforce TLS
  const isLocal = host ? isLocalHost(host) : false;
  const sslOption: false | { rejectUnauthorized: boolean } = isLocal
    ? false
    : { rejectUnauthorized: false };
  // Lightweight debug to verify effective DB options at runtime (no secrets)
  try {
    const sslEnabled = Boolean(sslOption);
    const dbg = {
      url: !!connectionUrl,
      host: connectionUrl ? 'using-url' : env.POSTGRES_HOST,
      port: connectionUrl ? 'using-url' : Number(env.POSTGRES_PORT),
      sslEnabled,
      sslEnv,
      isLocal,
    } as const;
    // Only log in development to avoid noisy staging logs
    if ((env.NODE_ENV || '').toLowerCase() !== 'production') {
      console.log('[database.config] resolved options:', dbg);
    }
  } catch {}

  return ({
    type: 'postgres',
    ...(connectionUrl ? { url: connectionUrl } : {}),
    host: connectionUrl ? undefined : env.POSTGRES_HOST,
    port: connectionUrl ? undefined : Number(env.POSTGRES_PORT),
    username: connectionUrl ? undefined : env.POSTGRES_USER,
    password: connectionUrl ? undefined : env.POSTGRES_PASSWORD,
    database: connectionUrl ? undefined : env.POSTGRES_DB,
    autoLoadEntities: true,
    // Explicitly include all entity files to avoid missing metadata issues during DataSource initialization
    entities: [`${__dirname}/../**/*.entity.{ts,js}`],
    synchronize: true,
    migrations: [`${__dirname}/../database/migration/**/*.{ts,js}`],
    // Provide driver-level object so pg negotiates TLS (with relaxed cert) on remote hosts
    ssl: sslOption,
    // Ensure driver receives SSL even if TypeORM ignores top-level option in some environments
    extra: {
      ...(sslOption ? { ssl: sslOption } : {}),
      keepAlive: true,
    },
  });
});
