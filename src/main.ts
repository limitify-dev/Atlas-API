// Must run before any other import — several modules (jwtConstants, the CORS
// allow-list, the Socket.IO gateway's decorator options) read process.env at
// module-load time, which happens before Nest's own ConfigModule gets a
// chance to load .env. Without this preload those reads silently see
// `undefined` in every environment that relies on a .env file rather than
// externally-injected env vars (i.e. plain `node dist/src/main.js`).
import 'dotenv/config';

import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';
import { ValidationPipe } from '@nestjs/common';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { HttpCacheInterceptor } from './common/interceptors/http-cache.interceptor';
import { getAllowedOrigins } from './common/config/cors-origins';
import { RedisIoAdapter } from './common/adapters/redis-io.adapter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Socket.IO adapter backed by Redis pub/sub — required so realtime events
  // (chat, presence) still reach every connected client once the API runs
  // as more than one instance/replica. With the default in-memory adapter,
  // two clients connected to different instances can never see each
  // other's events.
  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);

  // Enable global logging interceptor for system logs
  app.useGlobalInterceptors(app.get(LoggingInterceptor));

  // Add cache-control headers to GET responses so the browser + proxy can
  // revalidate cheaply via ETag/304 (and cache outright where a handler opts
  // in with @HttpCache). Never touches mutations.
  app.useGlobalInterceptors(new HttpCacheInterceptor(app.get(Reflector)));

  // Enable global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true, // Automatically transform payloads to DTO instances
      whitelist: true, // Strip properties that don't have decorators
      forbidNonWhitelisted: false, // Don't throw error for non-whitelisted properties
      transformOptions: {
        enableImplicitConversion: true, // Enable implicit type conversion
      },
    }),
  );

  // CORS — restricted to the known web/admin origins. Native mobile requests
  // (Expo) don't send an Origin header, so they're unaffected by this list.
  const allowedOrigins = getAllowedOrigins();
  app.enableCors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : false,
    credentials: true,
  });

  // Swagger/OpenAPI configuration
  const config = new DocumentBuilder()
    .setTitle('Atlas API')
    .setDescription('API documentation for Atlas School Management System')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);

  // Scalar API Reference
  app.use(
    '/doc',
    apiReference({
      theme: 'kepler',
      content: document,
    }),
  );

  await app.listen(process.env.PORT ?? 4000);
  console.log(
    `Application is running on: http://localhost:${process.env.PORT ?? 4000}`,
  );
  console.log(
    `API Documentation: http://localhost:${process.env.PORT ?? 4000}/doc`,
  );
  // console.log(
  //   `CORS allowed origins: ${allowedOrigins.join(', ') || '(none configured)'}`,
  // );
}
bootstrap().catch((err) => {
  console.error('Fatal error during bootstrap:', err);
  process.exit(1);
});
