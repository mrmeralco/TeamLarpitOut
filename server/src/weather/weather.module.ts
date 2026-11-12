import { Module } from "@nestjs/common";
import { WEATHER_PROVIDER } from "../common/injection-tokens.js";
import { OpenMeteoWeatherProvider } from "./open-meteo-weather.provider.js";

@Module({
  providers: [
    {
      provide: WEATHER_PROVIDER,
      useFactory: () => new OpenMeteoWeatherProvider(),
    },
  ],
  exports: [WEATHER_PROVIDER],
})
export class WeatherModule {}
