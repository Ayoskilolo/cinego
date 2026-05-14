import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AppService } from './app.service';

async function bootstrap() {
  // Prepare HTTPS options from local certs (mkcert)
  const certPath =
    process.env.SSL_CERT_PATH ||
    join(process.cwd(), 'certs', 'localhost-cert.pem') ||
    join(process.cwd(), 'certs', 'dev-cert.pem');
  const keyPath =
    process.env.SSL_KEY_PATH ||
    join(process.cwd(), 'certs', 'localhost-key.pem') ||
    join(process.cwd(), 'certs', 'dev-key.pem');
  let httpsOptions: { key: Buffer; cert: Buffer } | undefined;
  try {
    httpsOptions = {
      key: readFileSync(keyPath),
      cert: readFileSync(certPath),
    };
  } catch {
    // If certs are not found, fall back to HTTP
    httpsOptions = undefined;
  }

  const app = await NestFactory.create(
    AppModule,
    httpsOptions ? { httpsOptions } : {},
  );

  // Get config before enabling CORS
  const configService = app.get(ConfigService);
  const frontendUrl = configService.get<string>('FRONTEND_URL') || '';
  const adminFrontendUrl =
    configService.get<string>('FRONTEND_ADMIN_URL') || '';

  // TODO: clean up before pushing to prod
  const allowedOrigins = [
    frontendUrl,
    adminFrontendUrl,
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'https://localhost:5500',
    'https://127.0.0.1:5500',
    'http://app.cinego.live:5500',
    'https://app.cinego.live:5500',
    'http://localhost:3100',
    'http://127.0.0.1:3100',
    'https://localhost:3100',
    'https://127.0.0.1:3100',
    'http://localhost:3001',
    'http://localhost:3001',
    // Also allow calling from/to port 3000
    'http://localhost:3000',
    'https://localhost:3000',

    'https://cinego-admin-frontend.onrender.com',
  ]
    .flatMap((s) => (s ? s.split(',') : []))
    .map((s) => s.trim())
    .filter(Boolean);

  app.enableCors({
    origin: allowedOrigins.length ? allowedOrigins : true,
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type, Authorization, X-Requested-With',
  });

  app.useGlobalPipes(new ValidationPipe());

  const swaggerEnabledRaw = configService.get<string>('SWAGGER_ENABLED');
  const swaggerEnabled =
    swaggerEnabledRaw !== undefined && swaggerEnabledRaw !== ''
      ? swaggerEnabledRaw.toLowerCase() === 'true'
      : (configService.get<string>('NODE_ENV') || '').toLowerCase() !==
        'production';

  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('CineGo API')
      .setDescription('API documentation for CineGo application')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api-docs', app, document);
    const appService = app.get(AppService);
    appService.setSwaggerDocument(document);
  }

  const port = (await app.get(ConfigService)).get('app.port');
  await app.listen(port);

  // Log server URL and port after startup
  const isHttps = !!httpsOptions;
  const protocol = isHttps ? 'https' : 'http';
  const host = 'localhost';
  console.log(`Server running at ${protocol}://${host}:${port}`);
}
bootstrap();
