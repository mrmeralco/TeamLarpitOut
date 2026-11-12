import { BadRequestException, Body, Controller, Get, Header, HttpCode, Module, Param, Post, Put, Query, Req, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { HouseholdAccessGuard, type HouseholdRequest } from "../households/household-access.guard.js";
import { VisionModule } from "../vision/vision.module.js";
import { AppliancesModule } from "../appliances/appliances.module.js";
import { SessionGuard } from "../auth/session.guard.js";
import { DATABASE, SETUP_REPOSITORY } from "../common/injection-tokens.js";
import type { Sql } from "../database/database.module.js";
import { PgSetupRepository } from "../database/pg-setup.repository.js";
import { HouseholdsModule } from "../households/households.module.js";
import { PointsModule } from "../points/points.module.js";
import { AirconCheckQueryDto, SetupGridDto, SetupHouseholdDto, SetupRoutineDto } from "./dto/setup.dto.js";
import { InMemorySetupRepository } from "./setup-repository.js";
import { SetupService } from "./setup.service.js";

@Controller("households/:sin/setup")
@UseGuards(SessionGuard, HouseholdAccessGuard)
export class SetupController {
  constructor(private readonly setup: SetupService) {}

  @Get()
  @Header("Cache-Control", "no-store")
  status(@Param("sin") sin: string) {
    return this.setup.status(sin);
  }

  @Post("onboarding-seen")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  onboardingSeen(@Param("sin") sin: string) {
    return this.setup.markOnboardingSeen(sin);
  }

  @Put("household")
  @Header("Cache-Control", "no-store")
  household(@Param("sin") sin: string, @Body() body: SetupHouseholdDto) {
    return this.setup.saveHousehold(sin, body.size);
  }

  @Put("appliances")
  @Header("Cache-Control", "no-store")
  grid(@Param("sin") sin: string, @Body() body: SetupGridDto) {
    return this.setup.saveGrid(sin, body.counts);
  }

  @Get("aircon-check")
  @Header("Cache-Control", "no-store")
  airconCheck(@Param("sin") sin: string, @Req() req: HouseholdRequest, @Query() query: AirconCheckQueryDto) {
    return this.setup.airconCheck(sin, req.household, query.aircon);
  }

  @Post("appliance-photo")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  @UseInterceptors(FileInterceptor("photo", { limits: { fileSize: 10 * 1024 * 1024 } }))
  appliancePhoto(@Param("sin") sin: string, @UploadedFile() photo?: Express.Multer.File) {
    if (!photo) throw new BadRequestException({ error: "No photo (field: photo)" });
    if (!["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"].includes(photo.mimetype)) {
      throw new BadRequestException({ error: "This image type is not accepted." });
    }
    return this.setup.appliancePhoto(sin, { mimeType: photo.mimetype, data: photo.buffer });
  }

  @Put("routine")
  @Header("Cache-Control", "no-store")
  routine(@Param("sin") sin: string, @Body() body: SetupRoutineDto) {
    return this.setup.saveRoutine(sin, body.home, body.aircon);
  }
}

@Module({
  imports: [HouseholdsModule, AppliancesModule, PointsModule, VisionModule],
  controllers: [SetupController],
  providers: [SetupService, { provide: SETUP_REPOSITORY, inject: [DATABASE], useFactory: (db: Sql | null) => (db ? new PgSetupRepository(db) : new InMemorySetupRepository()) }],
  exports: [SetupService],
})
export class SetupModule {}
