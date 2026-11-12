import { Module } from "@nestjs/common";
import { DAILY_WEATHER_SOURCE, DATABASE, WEATHER_PROVIDER } from "../common/injection-tokens.js";
import type { Sql } from "../database/database.module.js";
import { PgDailyWeatherSource } from "../database/pg-daily-weather.source.js";
import { OpenMeteoWeatherProvider } from "./open-meteo-weather.provider.js";
import { MockDailyWeatherProvider } from "./mock-daily-weather.provider.js";

@Module({
  providers: [
    {
      provide: WEATHER_PROVIDER,
      useFactory: () => new OpenMeteoWeatherProvider(),
    },
    {
      provide: DAILY_WEATHER_SOURCE,
      inject: [DATABASE],
      useFactory: (db: Sql | null) => (db ? new PgDailyWeatherSource(db) : new MockDailyWeatherProvider()),
    },
  ],
  exports: [WEATHER_PROVIDER, DAILY_WEATHER_SOURCE],
})
export class WeatherModule {}
