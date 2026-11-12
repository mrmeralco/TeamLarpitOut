import { Controller, Get, Module, ValidationPipe, type INestApplication } from "@nestjs/common";
import { BakitGanitoModule } from "./bakit-ganito/bakit-ganito.module.js";
import { HouseholdsModule } from "./households/households.module.js";
import { RateSchedulesModule } from "./rate-schedules/rate-schedules.module.js";
import { VisionModule } from "./vision/vision.module.js";

@Controller("health")
export class HealthController {
  @Get()
  health() {
    return { ok: true };
  }
}

@Module({
  imports: [RateSchedulesModule, BakitGanitoModule, VisionModule, HouseholdsModule],
  controllers: [HealthController],
})
export class AppModule {}

/** Shared by main.ts and the test harness so tests hit the same pipeline. */
export function configureApp(app: INestApplication) {
  app.setGlobalPrefix("api");
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  return app;
}
