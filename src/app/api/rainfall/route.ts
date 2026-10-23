import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { findDistrictPoint } from "@/lib/districts";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const POWER_MONTHLY = "https://power.larc.nasa.gov/api/temporal/monthly/point";
const POWER_CLIMATOLOGY = "https://power.larc.nasa.gov/api/temporal/climatology/point";
const PARAMETER = "PRECTOTCORR";
const COMMUNITY = "AG";
const FILL_VALUE = -999;
const MIN_YEAR = 1981;
const MAX_RANGE_YEARS = 45;
const REQUEST_TIMEOUT_MS = 24_000;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
/** Average calendar month length used only for the 30-year climatology. */
const AVERAGE_MONTH_DAYS = 365 / 12;
const CLIMATOLOGY_MONTH_KEYS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

type CacheEntry = { storedAt: number; payload: unknown };
const responseCache = new Map<string, CacheEntry>();

function daysInMonthOf(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function isUsable(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value !== FILL_VALUE && value >= 0;
}

async function fetchPower(url: string, params: URLSearchParams): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${url}?${params.toString()}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    const text = await response.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("NASA POWER returned a response that was not valid JSON.");
    }
    const record = parsed as Record<string, unknown>;
    if (!response.ok) {
      const messages = Array.isArray(record.messages) ? record.messages.join(" ") : "";
      throw new Error(messages.trim() || `NASA POWER responded with status ${response.status}.`);
    }
    return record;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("NASA POWER did not respond in time. Check the network connection and try again.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function readSeries(payload: Record<string, unknown>): Record<string, unknown> {
  const properties = payload.properties as Record<string, unknown> | undefined;
  const parameter = properties?.parameter as Record<string, unknown> | undefined;
  const series = parameter?.[PARAMETER] as Record<string, unknown> | undefined;
  if (!series || typeof series !== "object") {
    const messages = Array.isArray(payload.messages) ? payload.messages.join(" ") : "";
    throw new Error(messages.trim() || "NASA POWER did not return precipitation values for this location.");
  }
  return series;
}

function sourcesOf(payload: Record<string, unknown>): string[] {
  const header = payload.header as Record<string, unknown> | undefined;
  const sources = header?.sources;
  return Array.isArray(sources) ? sources.filter((item): item is string => typeof item === "string") : [];
}

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams;
  const districtName = (search.get("district") ?? "").trim();
  const district = findDistrictPoint(districtName);

  if (!district) {
    return NextResponse.json(
      { ok: false, error: "Unknown district. Choose one of the 64 supported Bangladesh districts." },
      { status: 400 },
    );
  }

  const currentYear = new Date().getFullYear();
  const maxYear = Math.max(MIN_YEAR, currentYear - 1);
  const requestedEnd = Number(search.get("endYear"));
  const requestedStart = Number(search.get("startYear"));
  const endYear = Number.isFinite(requestedEnd) ? Math.min(maxYear, Math.max(MIN_YEAR, Math.round(requestedEnd))) : maxYear;
  const startYear = Number.isFinite(requestedStart)
    ? Math.min(endYear, Math.max(MIN_YEAR, Math.round(requestedStart)))
    : Math.max(MIN_YEAR, endYear - 9);

  if (endYear - startYear + 1 > MAX_RANGE_YEARS) {
    return NextResponse.json({ ok: false, error: `Requested range is too wide. Use at most ${MAX_RANGE_YEARS} years.` }, { status: 400 });
  }

  const cacheKey = `${district.name}|${startYear}|${endYear}`;
  const cached = responseCache.get(cacheKey);
  if (cached && Date.now() - cached.storedAt < CACHE_TTL_MS) {
    return NextResponse.json(cached.payload, { headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400" } });
  }

  try {
    const monthlyParams = new URLSearchParams({
      parameters: PARAMETER,
      community: COMMUNITY,
      longitude: String(district.longitude),
      latitude: String(district.latitude),
      start: String(startYear),
      end: String(endYear),
      format: "JSON",
    });
    const climatologyParams = new URLSearchParams({
      parameters: PARAMETER,
      community: COMMUNITY,
      longitude: String(district.longitude),
      latitude: String(district.latitude),
      format: "JSON",
    });

    const [monthlyPayload, climatologyPayload] = await Promise.all([
      fetchPower(POWER_MONTHLY, monthlyParams),
      fetchPower(POWER_CLIMATOLOGY, climatologyParams),
    ]);

    const monthlySeries = readSeries(monthlyPayload);
    const climatologySeries = readSeries(climatologyPayload);

    const monthlyByYear: Record<string, (number | null)[]> = {};
    const annual: { year: number; mm: number | null; monthsAvailable: number }[] = [];
    let missingMonths = 0;

    for (let year = startYear; year <= endYear; year += 1) {
      const months: (number | null)[] = [];
      let total = 0;
      let monthsAvailable = 0;
      for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
        const key = `${year}${String(monthIndex + 1).padStart(2, "0")}`;
        const raw = monthlySeries[key];
        if (isUsable(raw)) {
          const monthTotal = raw * daysInMonthOf(year, monthIndex);
          months.push(Number(monthTotal.toFixed(1)));
          total += monthTotal;
          monthsAvailable += 1;
        } else {
          months.push(null);
          missingMonths += 1;
        }
      }
      monthlyByYear[String(year)] = months;
      annual.push({ year, mm: monthsAvailable === 12 ? Number(total.toFixed(1)) : null, monthsAvailable });
    }

    const climatologyMonthly = CLIMATOLOGY_MONTH_KEYS.map((key) => {
      const raw = climatologySeries[key];
      return isUsable(raw) ? Number((raw * AVERAGE_MONTH_DAYS).toFixed(1)) : null;
    });
    const climatologyComplete = climatologyMonthly.every((value) => value !== null);
    const climatologyAnnual = climatologyComplete
      ? Number(climatologyMonthly.reduce<number>((sum, value) => sum + (value ?? 0), 0).toFixed(1))
      : null;

    const payload = {
      ok: true,
      district: district.name,
      division: district.division,
      point: { latitude: district.latitude, longitude: district.longitude },
      startYear,
      endYear,
      annual,
      monthlyByYear,
      climatology: { monthly: climatologyMonthly, annual: climatologyAnnual },
      missingMonths,
      provenance: {
        provider: "NASA POWER (NASA Langley Research Center)",
        product: PARAMETER,
        productDescription: "Precipitation Corrected — MERRA-2 precipitation bias-corrected against GPCP",
        modelSources: [...new Set([...sourcesOf(monthlyPayload), ...sourcesOf(climatologyPayload)])],
        nativeUnits: "mm/day",
        returnedUnits: "mm per month (mm/day multiplied by the number of days in that calendar month)",
        climatologyUnits: `mm per month (mm/day multiplied by an average month of ${AVERAGE_MONTH_DAYS.toFixed(2)} days)`,
        gridResolution: "~0.5° latitude x 0.625° longitude (about 55 km x 69 km)",
        pointBasis: "Approximate district reference point, not an official district centroid",
        nature: "Gridded reanalysis estimate derived from models and satellite-based products — not a local rain-gauge observation",
        missingValueMarker: FILL_VALUE,
        accessTerms: "NASA POWER data are openly available without an API key",
        documentationUrl: "https://power.larc.nasa.gov/docs/services/api/temporal/monthly/",
        apiUrl: `${POWER_MONTHLY}?${monthlyParams.toString()}`,
      },
      fetchedAt: new Date().toISOString(),
      note: "Historical reanalysis for past years. This is not a forecast and not a live weather report.",
    };

    responseCache.set(cacheKey, { storedAt: Date.now(), payload });
    if (responseCache.size > 240) {
      const oldestKey = responseCache.keys().next().value;
      if (oldestKey !== undefined) responseCache.delete(oldestKey);
    }

    return NextResponse.json(payload, {
      headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not reach NASA POWER.";
    return NextResponse.json(
      {
        ok: false,
        error: message,
        district: district.name,
        hint: "NASA POWER is a free public service and can be slow or temporarily unavailable. Manual entry remains available.",
      },
      { status: 502 },
    );
  }
}
