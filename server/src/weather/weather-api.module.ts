import { Module } from "@nestjs/common";
import { HouseholdsModule } from "../households/households.module.js";
import { PointsModule } from "../points/points.module.js";
import { WeatherApiController } from "./weather-api.controller.js";
import { WeatherModule } from "./weather.module.js";

/** The weather endpoints, kept apart from WeatherModule so its many importers don't pull in login checks. */
@Module({
  imports: [WeatherModule, HouseholdsModule, PointsModule],
  controllers: [WeatherApiController],
})
export class WeatherApiModule {}
