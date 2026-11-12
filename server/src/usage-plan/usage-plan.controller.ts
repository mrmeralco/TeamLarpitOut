import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import { SessionGuard } from "../auth/session.guard.js";
import { HouseholdAccessGuard } from "../households/household-access.guard.js";
import { SaveMidMonthReadingDto } from "./dto/save-mid-month-reading.dto.js";
import { SaveUsagePlanDto } from "./dto/save-usage-plan.dto.js";
import { UsagePlanService } from "./usage-plan.service.js";
import { MissionPlanService } from "./mission-plan.service.js";

function parseAirconSetting(value?: string): number | undefined {
  if (value === undefined || value === "") return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 16 || n > 30) {
    throw new BadRequestException({ error: "The aircon setting is 16 to 30°C." });
  }
  return n;
}

/** Target and Missions for the next billing period. Owner only. */
@Controller("households/:sin")
@UseGuards(SessionGuard, HouseholdAccessGuard)
export class UsagePlanController {
  constructor(private readonly usagePlan: UsagePlanService, private readonly missionPlans: MissionPlanService) {}

  @Get("target")
  @Header("Cache-Control", "no-store")
  target(@Param("sin") sin: string) {
    return this.usagePlan.target(sin);
  }

  @Get("missions")
  @Header("Cache-Control", "no-store")
  missions(@Param("sin") sin: string, @Query("airconSetting") airconSetting?: string) {
    return this.usagePlan.missions(sin, parseAirconSetting(airconSetting));
  }

  /** The 5% Mission Plan (ADR-0007), created on first view after Household Setup. */
  @Get("missions/plan")
  @Header("Cache-Control", "no-store")
  missionPlan(@Param("sin") sin: string) {
    return this.missionPlans.plan(sin);
  }

  @Post("missions/plan/shuffle")
  @Header("Cache-Control", "no-store")
  shuffle(@Param("sin") sin: string) {
    return this.missionPlans.shuffle(sin);
  }

  @Post("missions/:missionId/swap")
  @Header("Cache-Control", "no-store")
  swap(@Param("sin") sin: string, @Param("missionId") missionId: string) {
    return this.missionPlans.swap(sin, missionId);
  }

  @Get("usage-plan")
  @Header("Cache-Control", "no-store")
  plan(@Param("sin") sin: string) {
    return this.usagePlan.plan(sin);
  }

  @Put("usage-plan")
  @Header("Cache-Control", "no-store")
  savePlan(@Param("sin") sin: string, @Body() body: SaveUsagePlanDto) {
    return this.usagePlan.savePlan(sin, body);
  }

  @Get("forecast")
  @Header("Cache-Control", "no-store")
  forecast(@Param("sin") sin: string) {
    return this.usagePlan.forecast(sin);
  }

  @Post("mid-month-reading")
  @Header("Cache-Control", "no-store")
  saveReading(@Param("sin") sin: string, @Body() body: SaveMidMonthReadingDto) {
    return this.usagePlan.saveReading(sin, body);
  }

  @Delete("mid-month-reading")
  @Header("Cache-Control", "no-store")
  deleteReading(@Param("sin") sin: string) {
    return this.usagePlan.deleteReading(sin);
  }

  @Get("points")
  @Header("Cache-Control", "no-store")
  points(@Param("sin") sin: string) {
    return this.usagePlan.getPoints(sin);
  }

  @Post(["usage-plan/self-report", "missions/self-report"])
  @Header("Cache-Control", "no-store")
  selfReport(@Param("sin") sin: string, @Body() body?: { missionId?: string; status?: string }) {
    return this.usagePlan.selfReport(sin, body?.missionId);
  }
}
