import {
  BadGatewayException,
  BadRequestException,
  Body,
  Controller,
  Header,
  Req,
  UseGuards,
  HttpCode,
  Post,
  ServiceUnavailableException,
  UnauthorizedException,
  UnprocessableEntityException,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { VisionUnavailableError } from "../vision/vision-provider.interface.js";
import { BillScanService } from "./bill-scan.service.js";

import type { Request } from "express";
import { AuthService, SIGN_IN_REQUIRED } from "../auth/auth.service.js";
import { SessionGuard, type AuthenticatedRequest } from "../auth/session.guard.js";
import { HouseholdsService } from "../households/households.service.js";
import { ScanContextStore } from "../vision/scan-context.store.js";
import { ScanLinkageDto } from "../vision/scan-linkage.dto.js";

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

@Controller("bills")
export class BillScanController {
  constructor(
    private readonly billScan: BillScanService,
    private readonly contexts: ScanContextStore,
    private readonly households: HouseholdsService,
    private readonly auth: AuthService,
  ) {}

  @Post("scan-linkage")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  @UseGuards(SessionGuard)
  async linkage(@Body() body: ScanLinkageDto, @Req() request: AuthenticatedRequest) {
    const sin = this.contexts.sin(body.scanToken);
    if (sin === null) return { status: "unknown" };
    const linked = (await this.households.list(request.auth.ownerId)).some((h) => h.sin === sin);
    return linked ? { status: "linked", householdSin: sin } : { status: "unlinked" };
  }

  /**
   * Read a Bill photo into an editable draft. Only a short-lived identity
   * reference is retained; the client sends the confirmed Bill to /api/bakit-ganito.
   */
  @Post("scan")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  @UseInterceptors(FileInterceptor("photo", { limits: { fileSize: MAX_PHOTO_BYTES } }))
  async scan(@Req() request: Request, @UploadedFile() photo?: Express.Multer.File) {
    const ownerId = this.optionalOwner(request);
    if (!photo) throw new BadRequestException({ error: "Walang litrato (field: photo)" });
    if (!IMAGE_TYPES.includes(photo.mimetype)) {
      throw new BadRequestException({ error: `Hindi larawan ang file (${photo.mimetype})` });
    }

    let scanned;
    try {
      scanned = await this.billScan.scan({ mimeType: photo.mimetype, data: photo.buffer });
    } catch (err) {
      if (err instanceof VisionUnavailableError) {
        throw new ServiceUnavailableException({
          status: "unavailable",
          error: "Hindi pa naka-set up ang bill scan. I-type na lang ang Bill.",
        });
      }
      console.error(err);
      throw new BadGatewayException({
        status: "unavailable",
        error: "Hindi nabasa ang litrato ngayon. Subukan ulit o i-type ang Bill.",
      });
    }
    const { result, can } = scanned;
    if (result.status === "unreadable") throw new UnprocessableEntityException(result);
    if (ownerId === null) return result;
    // Account Linking: the scanned CAN activates this login's pending link when it is the same CAN.
    const link = await this.households.activateFromScan(ownerId, can);
    return link.status === "none" ? result : { ...result, link };
  }

  /** A bearer token is optional here; when sent it must be valid. */
  private optionalOwner(request: Request): string | null {
    const header = request.headers.authorization;
    if (!header) return null;
    const token = /^Bearer ([A-Za-z0-9_-]+)$/i.exec(header)?.[1];
    if (!token) throw new UnauthorizedException({ error: SIGN_IN_REQUIRED });
    return this.auth.authenticate(token);
  }
}
