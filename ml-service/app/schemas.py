"""API shapes. BillReading mirrors RawBillReading in server/src/vision/vision-provider.interface.ts,
so the NestJS backend can use this service as its VisionProvider without changes downstream."""

from pydantic import BaseModel, Field


class ChargeLine(BaseModel):
    label: str = Field(description="The charge as printed, e.g. 'Generation'.")
    amount: float = Field(description="Pesos as printed (negative for credits).")


class HistoryEntry(BaseModel):
    period: str = Field(description="YYYY-MM")
    kwh: int


class OcrText(BaseModel):
    """Raw OCR lines, only when ?debug=true. Contains everything printed, name and address included:
    for local debugging only, never forward it."""

    left: str
    right: str


class BillReading(BaseModel):
    readable: bool
    problem: str | None = Field(None, description="Why the photo could not be read.")
    period: str | None = Field(None, description="Billing month, YYYY-MM (month the period ends in).")
    billingDays: int | None = None
    kwh: int | None = Field(None, description="Actual Consumption printed on the Bill.")
    dueDate: str | None = Field(None, description="YYYY-MM-DD")
    previousReading: int | None = None
    presentReading: int | None = None
    estimated: bool | None = None
    serviceIdNumber: str | None = None
    customerAccountNumber: str | None = Field(None, description="CAN, 10 digits.")
    chargeLines: list[ChargeLine] | None = None
    history: list[HistoryEntry] | None = Field(None, description="Printed monthly kWh history (last 12 months).")
    chargesTotal: float | None = Field(None, description="'Charges for this billing period' as printed.")
    chargesAddUp: bool | None = Field(None, description="True when the charge lines add up to chargesTotal.")
    seconds: float | None = Field(None, description="Time spent reading the photo.")
    ocrText: OcrText | None = None


class RagQuery(BaseModel):
    lineLabel: str = Field("", max_length=120, description="The charge line tapped, e.g. 'Generation'.")
    question: str = Field("", max_length=300, description="The customer's question (any language).")
    k: int = Field(2, ge=1, le=5)


class Passage(BaseModel):
    id: str
    title: str
    text: str
    source: str = Field(description="Official meralco.com.ph page the text comes from.")
    score: float


class RagResult(BaseModel):
    passages: list[Passage]


class Health(BaseModel):
    status: str
    ocrModelLoaded: bool
    knowledgePassages: int
