import {
  BadGatewayException,
  BadRequestException,
  Body,
  Controller,
  Header,
  HttpCode,
  Module,
  Post,
  Req,
  ServiceUnavailableException,
  UnprocessableEntityException,
  UploadedFile,
  UseInterceptors,
  UseGuards,
} from "@nestjs/common";
import { SessionGuard, type AuthenticatedRequest } from "../auth/session.guard.js";
import { HouseholdsModule } from "../households/households.module.js";
import { HouseholdsService } from "../households/households.service.js";
import { ScanContextStore } from "./scan-context.store.js";
import { ScanLinkageDto } from "./scan-linkage.dto.js";
import { FileInterceptor } from "@nestjs/platform-express";
import { VISION_PROVIDER } from "../tokens.js";
import { BillScanService } from "./bill-scan.service.js";
import { GeminiVisionProvider } from "./gemini.vision.js";
import { VisionUnavailableError } from "./vision.js";

const MAX_BYTES = 10 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

@Controller("bills")
export class BillScanController {
  constructor(private readonly scanner: BillScanService, private readonly contexts: ScanContextStore, private readonly households: HouseholdsService) {}

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
   * reference is retained; no image or Bill is saved or decoded here.
   */
  @Post("scan")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  @UseInterceptors(FileInterceptor("photo", { limits: { fileSize: MAX_BYTES } }))
  async scan(@UploadedFile() photo?: Express.Multer.File) {
    if (!photo) throw new BadRequestException({ error: "Walang litrato (field: photo)" });
    if (!IMAGE_TYPES.includes(photo.mimetype)) {
      throw new BadRequestException({ error: `Hindi larawan ang file (${photo.mimetype})` });
    }

    let result;
    try {
      result = await this.scanner.scan({ mimeType: photo.mimetype, data: photo.buffer });
    } catch (err) {
      if (err instanceof VisionUnavailableError) {
        throw new ServiceUnavailableException({ status: "unavailable", error: "Hindi pa naka-set up ang bill scan. I-type na lang ang Bill." });
      }
      console.error(err);
      throw new BadGatewayException({ status: "unavailable", error: "Hindi nabasa ang litrato ngayon. Subukan ulit o i-type ang Bill." });
    }
    if (result.status === "unreadable") throw new UnprocessableEntityException(result);
    return result;
  }
}

@Module({
  imports: [HouseholdsModule],
  controllers: [BillScanController],
  providers: [BillScanService, ScanContextStore, { provide: VISION_PROVIDER, useFactory: () => new GeminiVisionProvider() }],
})
export class VisionModule {}
