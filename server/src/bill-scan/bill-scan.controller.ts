import {
  BadGatewayException,
  BadRequestException,
  Controller,
  Header,
  Req,
  UseGuards,
  HttpCode,
  Post,
  ServiceUnavailableException,
  UnprocessableEntityException,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { VisionUnavailableError } from "../vision/vision-provider.interface.js";
import { BillScanService } from "./bill-scan.service.js";

import { SessionGuard, type AuthenticatedRequest } from "../auth/session.guard.js";
import { HouseholdsService } from "../households/households.service.js";

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

@Controller("bills")
export class BillScanController {
  constructor(
    private readonly billScan: BillScanService,
    private readonly households: HouseholdsService,
  ) {}

  /**
   * Read a signed-in person's Bill photo into an editable draft. Only a short-lived
   * reference to the printed CAN is retained (for Account Linking).
   */
  @Post("scan")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  @UseGuards(SessionGuard)
  @UseInterceptors(FileInterceptor("photo", { limits: { fileSize: MAX_PHOTO_BYTES } }))
  async scan(@Req() request: AuthenticatedRequest, @UploadedFile() photo?: Express.Multer.File) {
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
    // Account Linking: the scanned CAN activates this login's pending link when it is the same CAN.
    const link = await this.households.activateFromScan(request.auth.ownerId, can);
    return link.status === "none" ? result : { ...result, link };
  }
}
