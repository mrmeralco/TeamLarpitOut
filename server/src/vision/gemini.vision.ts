import { GoogleGenAI } from "@google/genai";
import type { BillImage, RawBillReading, VisionProvider } from "./vision.js";
import { VisionUnavailableError } from "./vision.js";

const PROMPT = `You are reading a photo of a Meralco (Philippines) electricity bill.
Extract only what is printed. Never guess or compute a value that is not printed; use null instead.
- period: the billing month as "YYYY-MM" (the month the billing period ends in).
- billingDays: number of days in the billing period.
- kwh: total kWh consumed this period.
- dueDate: "YYYY-MM-DD".
- previousReading / presentReading: meter readings.
- serviceIdNumber: the Service ID Number (SIN), digits only.
- chargeLines: every charge line with its peso amount, as printed (label in the bill's own words).
- history: the printed monthly consumption history (kWh per month), if the bill shows one.
Set readable=false with a short problem if this is not a Meralco bill or the key numbers cannot be read.`;

const nullable = (type: string) => ({ type: [type, "null"] });

const SCHEMA = {
  type: "object",
  properties: {
    readable: { type: "boolean" },
    problem: nullable("string"),
    serviceIdNumber: nullable("string"),
    period: nullable("string"),
    billingDays: nullable("integer"),
    kwh: nullable("number"),
    dueDate: nullable("string"),
    previousReading: nullable("number"),
    presentReading: nullable("number"),
    chargeLines: {
      type: ["array", "null"],
      items: {
        type: "object",
        properties: { label: { type: "string" }, amount: { type: "number" } },
        required: ["label", "amount"],
      },
    },
    history: {
      type: ["array", "null"],
      items: {
        type: "object",
        properties: { period: { type: "string" }, kwh: { type: "number" } },
        required: ["period", "kwh"],
      },
    },
  },
  required: ["readable"],
};

/** Reads Bill photos with Gemini. Needs GEMINI_API_KEY; model from GEMINI_MODEL. */
export class GeminiVisionProvider implements VisionProvider {
  private client: GoogleGenAI | null;

  constructor(
    apiKey = process.env.GEMINI_API_KEY,
    private readonly model = process.env.GEMINI_MODEL ?? "gemini-3.8-flash",
  ) {
    this.client = apiKey ? new GoogleGenAI({ apiKey }) : null;
  }

  async readBill(image: BillImage): Promise<RawBillReading> {
    if (!this.client) throw new VisionUnavailableError("GEMINI_API_KEY is not set");
    const res = await this.client.models.generateContent({
      model: this.model,
      contents: [
        { inlineData: { mimeType: image.mimeType, data: image.data.toString("base64") } },
        { text: PROMPT },
      ],
      config: { responseMimeType: "application/json", responseJsonSchema: SCHEMA },
    });
    try {
      return JSON.parse(res.text ?? "") as RawBillReading;
    } catch {
      return { readable: false, problem: "Model returned no readable result" };
    }
  }
}
