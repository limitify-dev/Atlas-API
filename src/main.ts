import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS
  app.enableCors();

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
}
bootstrap();
