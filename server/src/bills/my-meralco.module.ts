import { Module } from "@nestjs/common";
import { MY_MERALCO_SOURCE } from "../common/injection-tokens.js";
import { mockMyMeralcoSource } from "./myMeralcoSource.js";

@Module({
  providers: [{ provide: MY_MERALCO_SOURCE, useFactory: () => mockMyMeralcoSource() }],
  exports: [MY_MERALCO_SOURCE],
})
export class MyMeralcoModule {}
