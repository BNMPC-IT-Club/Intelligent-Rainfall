import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Groq's OpenAI-compatible chat endpoint. `GROQ_ENDPOINT` lets a deployment point at a
 * compatible gateway (or a local mock in tests) without editing code.
 */
const GROQ_URL = process.env.GROQ_ENDPOINT?.trim() || "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "openai/gpt-oss-20b";
/**
 * Used only when the requested model does not exist on the caller's Groq account.
 * Groq retires model slugs over time (for example llama-3.3-70b-versatile), so the
 * explanation should degrade to another hosted model instead of failing outright.
 */
const FALLBACK_MODELS = ["openai/gpt-oss-120b", "llama-3.1-8b-instant"];

/** Total wall-clock budget for every attempt; stays below maxDuration. */
const DEADLINE_MS = 26_000;
const MIN_ATTEMPT_MS = 6_000;

/**
 * Reasoning models (openai/gpt-oss-*) spend hidden chain-of-thought tokens out of
 * the *same* budget as the visible answer. A small cap is consumed entirely by the
 * reasoning pass and Groq then replies 200 with `content: ""` and
 * `finish_reason: "length"`. The budget below reserves room for both.
 */
const REASONING_TOKEN_BUDGETS = [2048, 4096];
const PLAIN_TOKEN_BUDGETS = [900, 1200];

type ChatMessage = { role: "system" | "user"; content: string };

type Attempt = {
  model: string;
  totalTokens: number;
  reasoningEffort: "low" | null;
  temperature: number;
  /** `max_completion_tokens` is the field reasoning models honour; `max_tokens` is the legacy alias. */
  tokenField: "completion" | "legacy";
};

type CompletionOutcome =
  | { status: "ok"; model: string; text: string; finishReason: string | null }
  | { status: "empty"; model: string; finishReason: string | null; reasoningTokens: number | null }
  | { status: "http-error"; model: string; httpStatus: number; message: string; code: string | null }
  | { status: "bad-json"; model: string; message: string }
  | { status: "timeout"; model: string }
  | { status: "network"; model: string; message: string };

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
    `Answer directly with the explanation text only. Do not restate the data, do not show your working.`,
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

/** Groq-hosted reasoning models: hidden reasoning tokens share the completion budget. */
function isReasoningModel(model: string): boolean {
  const slug = model.toLowerCase();
  return slug.includes("gpt-oss") || slug.includes("qwen3") || slug.includes("deepseek-r1") || /(^|\/)o[134](-|$)/.test(slug);
}

function attemptsFor(model: string): Attempt[] {
  if (isReasoningModel(model)) {
    // OpenAI recommends temperature 1 for gpt-oss; Groq recommends 0.5-0.7 for reasoning models.
    return REASONING_TOKEN_BUDGETS.map((totalTokens) => ({ model, totalTokens, reasoningEffort: "low" as const, temperature: 0.6, tokenField: "completion" as const }));
  }
  return PLAIN_TOKEN_BUDGETS.map((totalTokens) => ({ model, totalTokens, reasoningEffort: null, temperature: 0.4, tokenField: "legacy" as const }));
}

/**
 * Used when a model rejects the reasoning controls. Reasoning models keep their large
 * budget because hidden reasoning still draws from it at the default effort level.
 */
function plainFallbackFor(attempt: Attempt): Attempt {
  const reasoning = isReasoningModel(attempt.model);
  return {
    model: attempt.model,
    totalTokens: reasoning ? REASONING_TOKEN_BUDGETS[0]! : PLAIN_TOKEN_BUDGETS[1]!,
    reasoningEffort: null,
    temperature: 1,
    tokenField: reasoning ? "completion" : "legacy",
  };
}

function buildRequestBody(attempt: Attempt, messages: ChatMessage[]): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: attempt.model,
    temperature: attempt.temperature,
    messages,
    stream: false,
  };
  if (attempt.tokenField === "completion") body.max_completion_tokens = attempt.totalTokens;
  else body.max_tokens = attempt.totalTokens;
  // Only the reasoning families accept this field; sending it elsewhere is a 400.
  if (attempt.reasoningEffort) body.reasoning_effort = attempt.reasoningEffort;
  return body;
}

type Choice = {
  finish_reason?: string | null;
  text?: string | null;
  message?: { content?: string | null; reasoning?: string | null; reasoning_content?: string | null };
};

type ChatResponse = {
  choices?: Choice[];
  usage?: { completion_tokens_details?: { reasoning_tokens?: number | null } | null };
  error?: { message?: string; type?: string; code?: string | number | null };
};

async function callGroq(apiKey: string, attempt: Attempt, messages: ChatMessage[], timeoutMs: number): Promise<CompletionOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(MIN_ATTEMPT_MS, timeoutMs));
  let response: Response;
  let raw: string;
  try {
    response = await fetch(GROQ_URL, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(buildRequestBody(attempt, messages)),
    });
    raw = await response.text();
  } catch (error) {
    if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
      return { status: "timeout", model: attempt.model };
    }
    return { status: "network", model: attempt.model, message: error instanceof Error ? error.message : "Could not reach the AI provider." };
  } finally {
    clearTimeout(timer);
  }

  let parsed: ChatResponse;
  try {
    parsed = JSON.parse(raw) as ChatResponse;
  } catch {
    return {
      status: "bad-json",
      model: attempt.model,
      message: `The AI provider returned a response that was not valid JSON (HTTP ${response.status}).`,
    };
  }

  if (!response.ok) {
    const message = parsed.error?.message?.trim() || `The AI provider responded with status ${response.status}.`;
    const code = parsed.error?.code === null || parsed.error?.code === undefined ? null : String(parsed.error.code);
    return { status: "http-error", model: attempt.model, httpStatus: response.status, message, code };
  }

  const choice = parsed.choices?.[0];
  const content = choice?.message?.content?.trim() || choice?.text?.trim() || "";
  const finishReason = choice?.finish_reason ?? null;
  const reasoningTokens = parsed.usage?.completion_tokens_details?.reasoning_tokens ?? null;

  if (!content) return { status: "empty", model: attempt.model, finishReason, reasoningTokens };
  return { status: "ok", model: attempt.model, text: content, finishReason };
}

function isModelUnavailable(outcome: Extract<CompletionOutcome, { status: "http-error" }>): boolean {
  if (outcome.code?.toLowerCase().includes("model_not_found")) return true;
  if (outcome.httpStatus !== 404 && outcome.httpStatus !== 400) return false;
  // Deliberately narrow: a rejected *parameter* also mentions the model name, and must
  // retry without that parameter rather than abandoning the model.
  return /does not exist|not found|is not available|no longer available|invalid model/.test(outcome.message.toLowerCase());
}

function isUnsupportedParameter(outcome: Extract<CompletionOutcome, { status: "http-error" }>): boolean {
  if (outcome.httpStatus !== 400) return false;
  const haystack = outcome.message.toLowerCase();
  return haystack.includes("reasoning_effort") || haystack.includes("unsupported parameter") || haystack.includes("unsupported value") || haystack.includes("not supported");
}

function emptyContentMessage(outcome: Extract<CompletionOutcome, { status: "empty" }>): string {
  const detail = [
    outcome.finishReason ? `finish_reason "${outcome.finishReason}"` : null,
    outcome.reasoningTokens === null ? null : `${outcome.reasoningTokens} reasoning tokens used`,
  ]
    .filter(Boolean)
    .join(", ");
  return `The model spent its whole token budget on internal reasoning and returned no text${detail ? ` (${detail})` : ""}. Try again, or set GROQ_MODEL to a non-reasoning model such as llama-3.1-8b-instant.`;
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

  const requestedModel = process.env.GROQ_MODEL?.trim() || DEFAULT_MODEL;
  // A retired GROQ_MODEL falls back to the known-good default first, then to other hosted models.
  const candidates = [...new Set([requestedModel, DEFAULT_MODEL, ...FALLBACK_MODELS])];

  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "You are a careful environmental engineering communicator. You explain rainwater harvesting estimates honestly, you never fabricate data or citations, and you always treat water quality as unverified unless tested.",
    },
    { role: "user", content: buildPrompt(input) },
  ];

  const queue: Attempt[] = attemptsFor(candidates[0]!);
  const triedModels = new Set<string>();
  const plainRetried = new Set<string>();
  const startedAt = Date.now();
  let lastError = "The AI provider did not return an explanation.";
  let sawTimeout = false;

  while (queue.length > 0) {
    const attempt = queue.shift()!;
    triedModels.add(attempt.model);

    const remaining = DEADLINE_MS - (Date.now() - startedAt);
    if (remaining < MIN_ATTEMPT_MS) break;

    const outcome = await callGroq(apiKey, attempt, messages, remaining);

    if (outcome.status === "ok") {
      return NextResponse.json({
        ok: true,
        available: true,
        model: outcome.model,
        text: outcome.text,
        disclaimer:
          "Generated by an AI language model from your inputs. It can be wrong. It is not professional engineering, medical, or water-safety advice.",
      });
    }

    if (outcome.status === "empty") {
      lastError = emptyContentMessage(outcome);
      // Next queued attempt for this model has a larger budget; nothing else to do here.
      continue;
    }

    if (outcome.status === "timeout") {
      sawTimeout = true;
      lastError = "The AI provider did not respond in time. Try again.";
      continue;
    }

    if (outcome.status === "network") {
      lastError = outcome.message;
      break;
    }

    if (outcome.status === "bad-json") {
      lastError = outcome.message;
      break;
    }

    // http-error
    lastError = outcome.message;

    if (isModelUnavailable(outcome)) {
      // This slug is not on the account (Groq retires models). Move to the next candidate.
      const next = candidates.find((model) => !triedModels.has(model));
      queue.length = 0;
      if (next) {
        lastError = `${outcome.message} Falling back to ${next}.`;
        queue.push(...attemptsFor(next));
      } else {
        lastError = `${outcome.message} No fallback model succeeded either.`;
      }
      continue;
    }

    if (isUnsupportedParameter(outcome) && attempt.reasoningEffort !== null && !plainRetried.has(attempt.model)) {
      // The model rejected the reasoning controls: retry it once as a plain chat completion.
      plainRetried.add(attempt.model);
      queue.length = 0;
      queue.push(plainFallbackFor(attempt));
      continue;
    }

    break;
  }

  return NextResponse.json({ ok: false, available: true, error: lastError }, { status: 502 });
}
