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
  Query,
  ServiceUnavailableException,
  UnprocessableEntityException,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { VisionUnavailableError } from "../vision/vision-provider.interface.js";
import { BillScanService } from "./bill-scan.service.js";

import { SessionGuard, type AuthenticatedRequest } from "../auth/session.guard.js";
import { AccountLinkingService } from "../account-linking/account-linking.module.js";

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

@Controller("bills")
export class BillScanController {
  constructor(
    private readonly billScan: BillScanService,
    private readonly linking: AccountLinkingService,
  ) {}

  /**
   * Simulate reading a Bill without calling the vision AI model (useful when quota is exhausted or for demo/offline).
   */
  @Post("simulate")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  @UseGuards(SessionGuard)
  async simulate(@Req() request: AuthenticatedRequest, @Body() body?: { can?: string; meterType?: "traditional" | "smart" }) {
    let can = body?.can;
    if (!can && body?.meterType === "smart") {
      can = "3901567213";
    } else if (!can) {
      const previewTraditional = await this.linking.preview(request.auth.ownerId, "3901234482");
      if (previewTraditional.status === "alreadyLinked") {
        const previewSmart = await this.linking.preview(request.auth.ownerId, "3901567213");
        if (previewSmart.status !== "alreadyLinked") {
          can = "3901567213";
        } else {
          can = `39${Math.abs(request.auth.ownerId.split("").reduce((a, c) => (a << 5) - a + c.charCodeAt(0), 0) % 90000000 + 10000000)}`;
        }
      }
    }
    const scanned = await this.billScan.simulate(can);
    const { result, can: readCan } = scanned;
    if (result.status === "unreadable") throw new UnprocessableEntityException(result);
    return { ...result, account: await this.linking.preview(request.auth.ownerId, readCan) };
  }

  /**
   * Read a signed-in person's Bill photo into an editable draft. Only a short-lived
   * reference to the printed CAN is retained (for Account Linking).
   */
  @Post("scan")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  @UseGuards(SessionGuard)
  @UseInterceptors(FileInterceptor("photo", { limits: { fileSize: MAX_PHOTO_BYTES } }))
  async scan(
    @Req() request: AuthenticatedRequest,
    @UploadedFile() photo?: Express.Multer.File,
    @Query("simulate") simulate?: string,
  ) {
    if (simulate === "true" || (!photo && simulate !== undefined)) {
      return this.simulate(request);
    }
    if (!photo) throw new BadRequestException({ error: "No photo (field: photo)" });
    if (!IMAGE_TYPES.includes(photo.mimetype)) {
      throw new BadRequestException({ error: `The file is not an image (${photo.mimetype})` });
    }

    let scanned;
    try {
      scanned = await this.billScan.scan({ mimeType: photo.mimetype, data: photo.buffer });
    } catch (err) {
      if (err instanceof VisionUnavailableError) {
        throw new ServiceUnavailableException({
          status: "unavailable",
          error: "Bill scan is not set up yet. You can use simulated bill data to proceed.",
        });
      }
      const isQuota =
        (err as any)?.status === 429 ||
        /quota|rate limit|resourceexhausted/i.test((err as Error)?.message ?? "");
      if (isQuota) {
        throw new BadGatewayException({
          status: "unavailable",
          error: "Vision AI quota limit reached. Please use simulated bill data to proceed.",
        });
      }
      console.error(err);
      throw new BadGatewayException({
        status: "unavailable",
        error: "We couldn't read the photo right now. Please try again or use simulated bill data.",
      });
    }
    const { result, can } = scanned;
    if (result.status === "unreadable") throw new UnprocessableEntityException(result);
    // Account Linking: what the printed CAN points to. Nothing is linked until the person confirms.
    return { ...result, account: await this.linking.preview(request.auth.ownerId, can) };
  }
}
