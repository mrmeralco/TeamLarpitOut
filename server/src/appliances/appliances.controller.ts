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
    if (!photo) throw new BadRequestException({ error: "Walang litrato (field: photo)" });
    if (!["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"].includes(photo.mimetype)) {
      throw new BadRequestException({ error: "Hindi tanggap ang uri ng larawan." });
    }
    try {
      return await this.labelScan.scan(body.type, { mimeType: photo.mimetype, data: photo.buffer });
    } catch (err) {
      if (err instanceof UnprocessableEntityException) throw err;
      if (err instanceof VisionUnavailableError) {
        throw new ServiceUnavailableException({ error: "Hindi pa naka-set up ang energy label scan. Gamitin muna ang mga sagot mo." });
      }
      throw new BadGatewayException({ error: "Hindi mabasa ang energy label ngayon. Subukan ulit o gamitin ang mga sagot mo." });
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
