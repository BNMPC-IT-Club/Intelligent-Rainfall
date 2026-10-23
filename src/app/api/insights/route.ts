import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "llama-3.3-70b-versatile";

type InsightInput = {
  district: string;
  year: string;
  dataOrigin: string;
  rainfallSource: string;
  annualRainfallMm: number;
  monthlyRainfallMm: (number | null)[];
  roofAreaM2: number;
  roofType: string;
  runoffCoefficient: number;
  collectionLossPercent: number;
  theoreticalLitres: number;
  usableLitres: number;
  dailyDemandLitres: number;
  annualDemandLitres: number;
  annualCoveragePercent: number | null;
  tankCapacityLitres: number;
  storageShortfallLitres: number | null;
  storageOverflowLitres: number | null;
};

function num(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readBody(raw: unknown): InsightInput {
  const body = (raw ?? {}) as Record<string, unknown>;
  const monthly = Array.isArray(body.monthlyRainfallMm)
    ? body.monthlyRainfallMm.slice(0, 12).map((item) => (item === null || item === undefined ? null : num(item, 0)))
    : [];
  while (monthly.length < 12) monthly.push(null);
  return {
    district: String(body.district ?? "Selected district").slice(0, 60),
    year: String(body.year ?? "not specified").slice(0, 20),
    dataOrigin: String(body.dataOrigin ?? "user").slice(0, 30),
    rainfallSource: String(body.rainfallSource ?? "Not specified").slice(0, 200),
    annualRainfallMm: num(body.annualRainfallMm),
    monthlyRainfallMm: monthly,
    roofAreaM2: num(body.roofAreaM2),
    roofType: String(body.roofType ?? "unknown").slice(0, 30),
    runoffCoefficient: num(body.runoffCoefficient, 0.8),
    collectionLossPercent: num(body.collectionLossPercent, 10),
    theoreticalLitres: num(body.theoreticalLitres),
    usableLitres: num(body.usableLitres),
    dailyDemandLitres: num(body.dailyDemandLitres),
    annualDemandLitres: num(body.annualDemandLitres),
    annualCoveragePercent: body.annualCoveragePercent === null || body.annualCoveragePercent === undefined ? null : num(body.annualCoveragePercent),
    tankCapacityLitres: num(body.tankCapacityLitres),
    storageShortfallLitres: body.storageShortfallLitres === null || body.storageShortfallLitres === undefined ? null : num(body.storageShortfallLitres),
    storageOverflowLitres: body.storageOverflowLitres === null || body.storageOverflowLitres === undefined ? null : num(body.storageOverflowLitres),
  };
}

function buildPrompt(input: InsightInput): string {
  const wettest = input.monthlyRainfallMm.reduce<{ month: number; mm: number } | null>((best, mm, index) => {
    if (mm === null) return best;
    return best === null || mm > best.mm ? { month: index + 1, mm } : best;
  }, null);
  const dryMonths = input.monthlyRainfallMm.filter((mm) => mm !== null && mm < 20).length;
  return [
    `Explain this rooftop rainwater harvesting estimate to a non-technical visitor at a science exhibition in Bangladesh.`,
    `Use plain English, about 150-220 words, short paragraphs, no markdown headings, no bullet lists longer than four items.`,
    `Be honest about uncertainty. Never claim the water is safe to drink without treatment and testing.`,
    `Never invent new numbers, money savings, or guarantees.`,
    ``,
    `DATA ORIGIN: ${input.dataOrigin}`,
    `RAINFALL SOURCE LABEL: ${input.rainfallSource}`,
    `LOCATION LABEL: ${input.district}, Bangladesh (year ${input.year})`,
    `ANNUAL RAINFALL: ${input.annualRainfallMm.toFixed(1)} mm`,
    `WETTEST MONTH: ${wettest ? `month ${wettest.month} with ${wettest.mm.toFixed(1)} mm` : "not available"}`,
    `MONTHS BELOW 20 MM: ${dryMonths} of the supplied months`,
    `ROOF: ${input.roofAreaM2.toFixed(1)} m2, surface ${input.roofType}, runoff coefficient ${input.runoffCoefficient.toFixed(2)}`,
    `COLLECTION LOSSES: ${input.collectionLossPercent.toFixed(1)}%`,
    `THEORETICAL YIELD: ${Math.round(input.theoreticalLitres).toLocaleString("en-US")} litres`,
    `ESTIMATED USABLE YIELD: ${Math.round(input.usableLitres).toLocaleString("en-US")} litres`,
    `DAILY DEMAND: ${Math.round(input.dailyDemandLitres).toLocaleString("en-US")} litres/day`,
    `ANNUAL DEMAND: ${Math.round(input.annualDemandLitres).toLocaleString("en-US")} litres`,
    `ANNUAL COVERAGE: ${input.annualCoveragePercent === null ? "not applicable (not an annual input)" : `${input.annualCoveragePercent.toFixed(1)}% (an annual volume ratio, not daily reliability)`}`,
    `TANK CAPACITY: ${Math.round(input.tankCapacityLitres).toLocaleString("en-US")} litres`,
    `MODELLED SHORTFALL: ${input.storageShortfallLitres === null ? "not modelled" : `${Math.round(input.storageShortfallLitres).toLocaleString("en-US")} litres`}`,
    `MODELLED OVERFLOW: ${input.storageOverflowLitres === null ? "not modelled" : `${Math.round(input.storageOverflowLitres).toLocaleString("en-US")} litres`}`,
    ``,
    `Cover: what the number means, why the seasonal pattern matters more than the annual total, one practical suggestion for storage or use, and one clear caution.`,
  ].join("\n");
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY?.trim();

  if (!apiKey) {
    return NextResponse.json({
      ok: true,
      available: false,
      reason: "No GROQ_API_KEY environment variable is configured on this deployment.",
      guidance:
        "Add a free Groq API key to enable plain-language explanations. Everything else in this app works without it: the rainfall data comes from NASA POWER and all calculations run locally.",
    });
  }

  let input: InsightInput;
  try {
    input = readBody(await request.json());
  } catch {
    return NextResponse.json({ ok: false, available: false, error: "Request body was not valid JSON." }, { status: 400 });
  }

  if (input.roofAreaM2 <= 0 || input.annualRainfallMm <= 0) {
    return NextResponse.json(
      { ok: false, available: true, error: "Add a roof area and a rainfall value before asking for an explanation." },
      { status: 422 },
    );
  }

  const model = process.env.GROQ_MODEL?.trim() || DEFAULT_MODEL;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 40_000);
    const response = await fetch(GROQ_URL, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        max_tokens: 650,
        messages: [
          {
            role: "system",
            content:
              "You are a careful environmental engineering communicator. You explain rainwater harvesting estimates honestly, you never fabricate data or citations, and you always treat water quality as unverified unless tested.",
          },
          { role: "user", content: buildPrompt(input) },
        ],
      }),
    });
    clearTimeout(timer);

    const text = await response.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("The AI provider returned a response that was not valid JSON.");
    }
    if (!response.ok) {
      const record = parsed as { error?: { message?: string } };
      throw new Error(record.error?.message?.trim() || `The AI provider responded with status ${response.status}.`);
    }
    const record = parsed as { choices?: { message?: { content?: string } }[] };
    const content = record.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("The AI provider returned an empty explanation.");

    return NextResponse.json({
      ok: true,
      available: true,
      model,
      text: content,
      disclaimer:
        "Generated by an AI language model from your inputs. It can be wrong. It is not professional engineering, medical, or water-safety advice.",
    });
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "The AI provider did not respond in time. Try again."
        : error instanceof Error
          ? error.message
          : "Could not reach the AI provider.";
    return NextResponse.json({ ok: false, available: true, error: message }, { status: 502 });
  }
}
