import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_FORECAST_DAYS = 16;

function clampCoordinate(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams;
  const latitude = Number(search.get("latitude"));
  const longitude = Number(search.get("longitude"));
  const days = Math.min(MAX_FORECAST_DAYS, Math.max(1, Number(search.get("days")) || MAX_FORECAST_DAYS));

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return NextResponse.json({ ok: false, error: "Provide a valid latitude (-90 to 90) and longitude (-180 to 180)." }, { status: 400 });
  }

  const safeLatitude = clampCoordinate(latitude, -90, 90);
  const safeLongitude = clampCoordinate(longitude, -180, 180);

  const params = new URLSearchParams({
    latitude: safeLatitude.toFixed(4),
    longitude: safeLongitude.toFixed(4),
    daily: "precipitation_sum,precipitation_probability_max,precipitation_hours,temperature_2m_max,temperature_2m_min,weathercode",
    current: "temperature_2m,precipitation,weathercode,is_day",
    forecast_days: String(days),
    timezone: "auto",
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${FORECAST_URL}?${params.toString()}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    const text = await response.text();
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error("Open-Meteo returned a response that was not valid JSON.");
    }
    if (!response.ok) {
      const reason = typeof payload.reason === "string" ? payload.reason : `Open-Meteo responded with status ${response.status}.`;
      throw new Error(reason);
    }

    const daily = payload.daily as Record<string, unknown[]> | undefined;
    const current = payload.current as Record<string, unknown> | undefined;
    const dailyUnits = payload.daily_units as Record<string, string> | undefined;

    if (!daily || !Array.isArray(daily.time)) {
      throw new Error("Open-Meteo did not return a daily forecast for this location.");
    }

    const days7 = (daily.time as string[]).map((date, index) => ({
      date,
      precipitationMm: Number(daily.precipitation_sum?.[index] ?? 0),
      precipitationProbabilityPercent: daily.precipitation_probability_max?.[index] === undefined ? null : Number(daily.precipitation_probability_max[index]),
      precipitationHours: daily.precipitation_hours?.[index] === undefined ? null : Number(daily.precipitation_hours[index]),
      temperatureMaxC: Number(daily.temperature_2m_max?.[index] ?? 0),
      temperatureMinC: Number(daily.temperature_2m_min?.[index] ?? 0),
      weatherCode: Number(daily.weathercode?.[index] ?? 0),
    }));

    return NextResponse.json({
      ok: true,
      point: { latitude: safeLatitude, longitude: safeLongitude },
      timezone: typeof payload.timezone === "string" ? payload.timezone : "auto",
      generatedAt: new Date().toISOString(),
      current: current
        ? {
            time: typeof current.time === "string" ? current.time : null,
            temperatureC: current.temperature_2m === undefined ? null : Number(current.temperature_2m),
            precipitationMm: current.precipitation === undefined ? null : Number(current.precipitation),
            weatherCode: current.weathercode === undefined ? null : Number(current.weathercode),
            isDay: current.is_day === 1,
          }
        : null,
      days: days7,
      units: {
        precipitation: dailyUnits?.precipitation_sum ?? "mm",
        temperature: dailyUnits?.temperature_2m_max ?? "°C",
      },
      provenance: {
        provider: "Open-Meteo",
        model: "National weather model blend (ECMWF / GFS / ICON, best-match by location)",
        nature: "Forecast — a prediction that can change, not an observed measurement",
        accessTerms: "Free for non-commercial use, no API key required",
        documentationUrl: "https://open-meteo.com/en/docs",
        apiUrl: `${FORECAST_URL}?${params.toString()}`,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "Open-Meteo did not respond in time. Try again."
        : error instanceof Error
          ? error.message
          : "Could not reach the forecast service.";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
