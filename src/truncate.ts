import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { config as loadEnv } from 'dotenv';

loadEnv();

async function truncateAll() {
  const args = process.argv.slice(2);
  const rawTargets =
    args.length > 0
      ? args
      : (process.env.TRUNCATE_TABLES || '')
          .split(',')
          .map((s) => s.trim())
          .filter((s) => !!s);
  const registry: Record<string, string[]> = {
    movies: ['movie'],
    providers: ['providers_entity'],
    users: ['user'],
    profiles: ['profile'],
    sessions: ['session_entity'],
    transactions: ['transaction'],
    comments: ['comments'],
    reviews: ['reviews'],
    movie_news: ['movie_news'],
    my_list: ['my_list_entity'],
    payment_partners: ['payment_partner'],
    user_interactions: [
      'comments',
      'reviews',
      'my_list_entity',
      'watch_history',
    ],
    watch_history: ['watch_history'],
  };
  const expanded: string[] = [];
  for (const keyOrTable of rawTargets) {
    const k = keyOrTable.toLowerCase();
    if (registry[k]) {
      expanded.push(...registry[k]);
    } else {
      // treat as raw table name
      expanded.push(keyOrTable);
    }
  }
  const targetTables = expanded.filter((t) => !!t);
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

  const connectionUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  const host = connectionUrl ? undefined : process.env.POSTGRES_HOST;
  const sslOption: false | { rejectUnauthorized: boolean } = host
    ? isLocalHost(host)
      ? false
      : { rejectUnauthorized: false }
    : // If host is not provided (using URL), assume remote and enable SSL
      { rejectUnauthorized: false };

  const ds = new DataSource({
    type: 'postgres',
    ...(connectionUrl ? { url: connectionUrl } : {}),
    host: connectionUrl ? undefined : process.env.POSTGRES_HOST,
    port: connectionUrl ? undefined : +(process.env.POSTGRES_PORT || 5432),
    username: connectionUrl ? undefined : process.env.POSTGRES_USER,
    password: connectionUrl ? undefined : process.env.POSTGRES_PASSWORD,
    database: connectionUrl ? undefined : process.env.POSTGRES_DB,
    ssl: sslOption,
    extra: sslOption
      ? { ssl: sslOption, keepAlive: true }
      : { keepAlive: true },
  });

  await ds.initialize();

  try {
    if (targetTables.length === 0) {
      console.log(
        'No tables specified. Provide entity keys or table names as args, e.g.:',
      );
      console.log(
        'node dist/src/truncate.js movies providers users OR set TRUNCATE_TABLES=movies,providers',
      );
      console.log('Valid entity keys:', Object.keys(registry).join(', '));
      return;
    }
    for (const t of targetTables) {
      await ds.query(`DELETE FROM "public"."${t}";`);
      console.log(`Deleted rows from table: ${t}`);
    }
  } finally {
    await ds.destroy();
  }
}

truncateAll().catch((err) => {
  console.error('Failed to truncate tables:', err?.message || err);
  process.exit(1);
});
