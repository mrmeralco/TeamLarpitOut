import {
  BadGatewayException,
  BadRequestException,
  Controller,
  HttpCode,
  Module,
  Post,
  ServiceUnavailableException,
  UnprocessableEntityException,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { VISION_PROVIDER } from "../tokens.js";
import { BillScanService } from "./bill-scan.service.js";
import { GeminiVisionProvider } from "./gemini.vision.js";
import { VisionUnavailableError } from "./vision.js";

const MAX_BYTES = 10 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

@Controller("bills")
export class BillScanController {
  constructor(private readonly scanner: BillScanService) {}

  /**
   * Read a Bill photo into an editable draft. Stateless: nothing is saved or
   * decoded here; the client sends the confirmed Bill to /api/bakit-ganito.
   */
  @Post("scan")
  @HttpCode(200)
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
  controllers: [BillScanController],
  providers: [BillScanService, { provide: VISION_PROVIDER, useFactory: () => new GeminiVisionProvider() }],
})
export class VisionModule {}
