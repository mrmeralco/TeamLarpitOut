import { ValidationPipe, type INestApplication } from "@nestjs/common";

/** Global HTTP setup, shared by main.ts and the test harness so tests hit the same pipeline. */
export function configureApp(app: INestApplication): INestApplication {
  app.setGlobalPrefix("api");
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  return app;
}
