import { Module } from "@nestjs/common";
import { DAILY_WEATHER_SOURCE, WEATHER_PROVIDER } from "../common/injection-tokens.js";
import { OpenMeteoWeatherProvider } from "./open-meteo-weather.provider.js";
import { MockDailyWeatherProvider } from "./mock-daily-weather.provider.js";

@Module({
  providers: [
    {
      provide: WEATHER_PROVIDER,
      useFactory: () => new OpenMeteoWeatherProvider(),
    },
    { provide: DAILY_WEATHER_SOURCE, useFactory: () => new MockDailyWeatherProvider() },
  ],
  exports: [WEATHER_PROVIDER, DAILY_WEATHER_SOURCE],
})
export class WeatherModule {}
