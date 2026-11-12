import {
  BadGatewayException, BadRequestException, Body, Controller, Get, Header, HttpCode,
  Param, Post, Put, Query, Req, ServiceUnavailableException, UnprocessableEntityException,
  UploadedFile, UseGuards, UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { SessionGuard } from "../auth/session.guard.js";
import { HouseholdAccessGuard, type HouseholdRequest } from "../households/household-access.guard.js";
import { AppliancesService } from "./appliances.service.js";
import { SaveAppliancesDto } from "./dto/save-appliances.dto.js";
import { ScanApplianceLabelDto } from "./dto/scan-appliance-label.dto.js";
import { ApplianceLabelScanService } from "./appliance-label-scan.service.js";
import { VisionUnavailableError } from "../vision/vision-provider.interface.js";
import { AirconPatternService } from "./aircon-pattern.service.js";
import { AirconPatternRequestDto } from "./dto/aircon-pattern-request.dto.js";

/** A Household's appliances and "Saan napupunta?". Owner only. */
@Controller("households/:sin/appliances")
@UseGuards(SessionGuard, HouseholdAccessGuard)
export class AppliancesController {
  constructor(
    private readonly appliances: AppliancesService,
    private readonly labelScan: ApplianceLabelScanService,
    private readonly pattern: AirconPatternService,
  ) {}

  @Post("aircon-pattern-proposal")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  airconPattern(@Req() req: HouseholdRequest, @Body() body: AirconPatternRequestDto) {
    return this.pattern.propose(req.household, body);
  }

  @Post("scan-label")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  @UseInterceptors(FileInterceptor("photo", { limits: { fileSize: 10 * 1024 * 1024 } }))
  async scanLabel(@Body() body: ScanApplianceLabelDto, @UploadedFile() photo?: Express.Multer.File) {
    if (!photo) throw new BadRequestException({ error: "No photo (field: photo)" });
    if (!["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"].includes(photo.mimetype)) {
      throw new BadRequestException({ error: "This image type is not accepted." });
    }
    try {
      return await this.labelScan.scan(body.type, { mimeType: photo.mimetype, data: photo.buffer });
    } catch (err) {
      if (err instanceof UnprocessableEntityException) throw err;
      if (err instanceof VisionUnavailableError) {
        throw new ServiceUnavailableException({ error: "Energy label scan is not set up yet. Use your answers for now." });
      }
      throw new BadGatewayException({ error: "We couldn't read the energy label right now. Try again or use your answers." });
    }
  }

  @Get()
  @Header("Cache-Control", "no-store")
  list(@Param("sin") sin: string) {
    return this.appliances.list(sin);
  }

  @Get("aircon-proposal")
  @Header("Cache-Control", "no-store")
  airconProposal(
    @Param("sin") sin: string,
    @Req() req: HouseholdRequest,
    @Query() query: Record<string, string>,
  ) {
    return this.appliances.airconProposal(sin, req.household, query);
  }

  @Put()
  @Header("Cache-Control", "no-store")
  save(@Param("sin") sin: string, @Body() body: SaveAppliancesDto) {
    return this.appliances.save(sin, body.appliances);
  }

  @Get("breakdown")
  @Header("Cache-Control", "no-store")
  breakdown(@Param("sin") sin: string) {
    return this.appliances.breakdown(sin);
  }
}
