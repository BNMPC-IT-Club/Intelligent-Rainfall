export type ClimateProvenance = {
  provider: string;
  product: string;
  productDescription: string;
  modelSources: string[];
  nativeUnits: string;
  returnedUnits: string;
  climatologyUnits: string;
  gridResolution: string;
  pointBasis: string;
  nature: string;
  missingValueMarker: number;
  accessTerms: string;
  documentationUrl: string;
  apiUrl: string;
};

export type AnnualRainfall = { year: number; mm: number | null; monthsAvailable: number };

export type ClimateDataset = {
  ok: true;
  district: string;
  division: string;
  point: { latitude: number; longitude: number };
  startYear: number;
  endYear: number;
  annual: AnnualRainfall[];
  monthlyByYear: Record<string, (number | null)[]>;
  climatology: { monthly: (number | null)[]; annual: number | null };
  missingMonths: number;
  provenance: ClimateProvenance;
  fetchedAt: string;
  note: string;
};

export type ClimateFailure = { ok: false; error: string; hint?: string };

export async function fetchDistrictClimate(
  district: string,
  startYear: number,
  endYear: number,
  signal?: AbortSignal,
): Promise<ClimateDataset | ClimateFailure> {
  const params = new URLSearchParams({ district, startYear: String(startYear), endYear: String(endYear) });
  try {
    const response = await fetch(`/api/rainfall?${params.toString()}`, { signal, headers: { Accept: "application/json" } });
    const payload = (await response.json()) as ClimateDataset | ClimateFailure;
    if (!response.ok || payload.ok !== true) {
      return { ok: false, error: payload.ok === false ? payload.error : `Request failed with status ${response.status}.`, hint: payload.ok === false ? payload.hint : undefined };
    }
    return payload;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return { ok: false, error: error instanceof Error ? error.message : "Network request failed." };
  }
}

export function completeMonthlySeries(months: (number | null)[] | undefined): months is number[] {
  return Array.isArray(months) && months.length === 12 && months.every((value) => typeof value === "number" && Number.isFinite(value) && value >= 0);
}

export function sumSeries(months: (number | null)[]): number | null {
  if (!completeMonthlySeries(months)) return null;
  return months.reduce<number>((total, value) => total + value, 0);
}

export type ForecastDay = {
  date: string;
  precipitationMm: number;
  precipitationProbabilityPercent: number | null;
  precipitationHours: number | null;
  temperatureMaxC: number;
  temperatureMinC: number;
  weatherCode: number;
};

export type ForecastDataset = {
  ok: true;
  point: { latitude: number; longitude: number };
  timezone: string;
  generatedAt: string;
  current: { time: string | null; temperatureC: number | null; precipitationMm: number | null; weatherCode: number | null; isDay: boolean } | null;
  days: ForecastDay[];
  units: { precipitation: string; temperature: string };
  provenance: {
    provider: string;
    model: string;
    nature: string;
    accessTerms: string;
    documentationUrl: string;
    apiUrl: string;
  };
};

export type ForecastFailure = { ok: false; error: string };

export async function fetchForecast(latitude: number, longitude: number, days = 16, signal?: AbortSignal): Promise<ForecastDataset | ForecastFailure> {
  const params = new URLSearchParams({ latitude: String(latitude), longitude: String(longitude), days: String(days) });
  try {
    const response = await fetch(`/api/forecast?${params.toString()}`, { signal, headers: { Accept: "application/json" } });
    const payload = (await response.json()) as ForecastDataset | ForecastFailure;
    if (!response.ok || payload.ok !== true) {
      return { ok: false, error: payload.ok === false ? payload.error : `Request failed with status ${response.status}.` };
    }
    return payload;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return { ok: false, error: error instanceof Error ? error.message : "Network request failed." };
  }
}

export type DetectedPlace = { label: string; city: string | null; region: string | null; country: string | null };

export async function reverseGeocode(latitude: number, longitude: number, signal?: AbortSignal): Promise<DetectedPlace | null> {
  try {
    const params = new URLSearchParams({ latitude: String(latitude), longitude: String(longitude), localityLanguage: "en" });
    const response = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?${params.toString()}`, { signal });
    if (!response.ok) return null;
    const data = (await response.json()) as { city?: string; locality?: string; principalSubdivision?: string; countryName?: string };
    const city = data.city || data.locality || null;
    const region = data.principalSubdivision || null;
    const country = data.countryName || null;
    const label = [city, region, country].filter(Boolean).join(", ") || "Detected location";
    return { label, city, region, country };
  } catch {
    return null;
  }
}

export type LocationSource = "browser" | "ip";

export type LocationFailureKind =
  | "unsupported"
  | "denied"
  | "unavailable"
  | "timeout"
  | "insecure-context"
  | "unknown";

export type LocateResult =
  | {
      ok: true;
      latitude: number;
      longitude: number;
      accuracyMeters: number | null;
      source: LocationSource;
      /** True when the coordinates come from the network (IP), not from the device. */
      approximated: boolean;
      place: DetectedPlace | null;
      note: string;
    }
  | { ok: false; kind: LocationFailureKind; message: string };

const GEO_ATTEMPTS: PositionOptions[] = [
  { enableHighAccuracy: false, timeout: 15_000, maximumAge: 60_000 },
  // Retry with the GPS/network provider forced on; desktop Wi-Fi lookups often fail first.
  { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
];

function isEmbeddedInFrame(): boolean {
  try {
    return typeof window !== "undefined" && window.self !== window.top;
  } catch {
    return true;
  }
}

/**
 * GeolocationPositionError does not inherit from Error, so `error instanceof Error`
 * is false for it and `error.message` is easy to miss. Every code is mapped to a
 * specific, actionable message instead of a generic failure string.
 */
function describeGeolocationError(error: unknown): { kind: LocationFailureKind; message: string } {
  const code = typeof error === "object" && error !== null && "code" in error ? Number((error as { code?: unknown }).code) : NaN;
  const embeddedHint = isEmbeddedInFrame()
    ? " This page also appears to be embedded in a frame, and frames block location unless the embedding page allows it — try opening the app in its own browser tab."
    : "";

  if (code === 1) {
    return {
      kind: "denied",
      message: `Location access is blocked for this page. Allow location in the browser's address-bar site settings, then press “Detect my location” again.${embeddedHint} Picking a district below always works.`,
    };
  }
  if (code === 2) {
    return {
      kind: "unavailable",
      message:
        "Your device could not produce a position (no GPS/Wi-Fi positioning available to the browser). This is common on desktops and when a VPN is active." + embeddedHint,
    };
  }
  if (code === 3) {
    return { kind: "timeout", message: "Locating took too long and was cancelled. Check your connection and try again, or pick a district below." };
  }
  const detail = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return { kind: "unknown", message: detail ? `Location detection failed: ${detail}` : "Location detection failed for an unknown reason." };
}

function requestBrowserPosition(options: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

type IpLookup = { latitude: number; longitude: number; place: DetectedPlace | null };

const IP_ENDPOINTS: { url: string; parse: (data: Record<string, unknown>) => IpLookup | null }[] = [
  {
    url: "https://ipwho.is/",
    parse: (data) => {
      if (data.success === false) return null;
      const latitude = Number(data.latitude);
      const longitude = Number(data.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
      const city = typeof data.city === "string" ? data.city : null;
      const region = typeof data.region === "string" ? data.region : null;
      const country = typeof data.country === "string" ? data.country : null;
      const label = [city, region, country].filter(Boolean).join(", ") || "Approximate location";
      return { latitude, longitude, place: { label, city, region, country } };
    },
  },
  {
    url: "https://freeipapi.com/api/json",
    parse: (data) => {
      const latitude = Number(data.latitude);
      const longitude = Number(data.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
      const city = typeof data.cityName === "string" ? data.cityName : null;
      const region = typeof data.regionName === "string" ? data.regionName : null;
      const country = typeof data.countryName === "string" ? data.countryName : null;
      const label = [city, region, country].filter(Boolean).join(", ") || "Approximate location";
      return { latitude, longitude, place: { label, city, region, country } };
    },
  },
];

/**
 * Keyless, CORS-enabled IP geolocation. City-level accuracy only — it is used as a
 * fallback when the browser cannot produce a device position, and it is always
 * labelled as approximate in the UI.
 */
async function locateByIp(): Promise<IpLookup | null> {
  for (const endpoint of IP_ENDPOINTS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7_000);
    try {
      const response = await fetch(endpoint.url, { signal: controller.signal, headers: { Accept: "application/json" } });
      if (!response.ok) continue;
      const parsed = endpoint.parse((await response.json()) as Record<string, unknown>);
      if (parsed) return parsed;
    } catch {
      // try the next endpoint
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

type LocateFailure = { ok: false; kind: LocationFailureKind; message: string };

const FAILURE_REASONS: Record<LocationFailureKind, string> = {
  unsupported: "this browser does not support location detection",
  denied: "location permission was denied",
  unavailable: "no positioning signal was available",
  timeout: "the location request timed out",
  "insecure-context": "the page is not served over https",
  unknown: "the location lookup failed",
};

/** Browser Geolocation API only. Never throws: every failure is described instead. */
async function locateWithBrowser(): Promise<LocateResult | LocateFailure> {
  if (typeof window === "undefined" || typeof navigator === "undefined" || !navigator.geolocation) {
    return { ok: false, kind: "unsupported", message: "This browser does not support location detection." };
  }

  if (window.isSecureContext === false) {
    return {
      ok: false,
      kind: "insecure-context",
      message:
        "Browsers only share a device position over https:// or localhost, and this page was loaded over plain http://.",
    };
  }

  let lastFailure: LocateFailure = { ok: false, kind: "unknown", message: "Location detection failed for an unknown reason." };

  for (const options of GEO_ATTEMPTS) {
    try {
      const position = await requestBrowserPosition(options);
      const { latitude, longitude, accuracy } = position.coords;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        lastFailure = { ok: false, kind: "unavailable", message: "Your device returned an invalid position." };
        break;
      }
      return {
        ok: true,
        latitude,
        longitude,
        accuracyMeters: Number.isFinite(accuracy) ? accuracy : null,
        source: "browser",
        approximated: false,
        place: null,
        note: "",
      };
    } catch (error) {
      const described = describeGeolocationError(error);
      lastFailure = { ok: false, kind: described.kind, message: described.message };
      // A denial is the visitor's decision; it is never routed around with an IP lookup.
      if (described.kind === "denied") return lastFailure;
    }
  }

  return lastFailure;
}

/**
 * Detects the visitor's position. Tries the browser Geolocation API (two option sets),
 * then falls back to a keyless IP lookup unless permission was explicitly denied.
 */
export async function detectLocation(): Promise<LocateResult> {
  const attempt = await locateWithBrowser();
  if (attempt.ok) return attempt;
  if (attempt.kind === "denied") return attempt;

  const ip = await locateByIp();
  if (ip) {
    return {
      ok: true,
      latitude: ip.latitude,
      longitude: ip.longitude,
      accuracyMeters: null,
      source: "ip",
      approximated: true,
      place: ip.place ? { ...ip.place, label: `${ip.place.label} · approximate, from your IP` } : null,
      note: `Your device position could not be read (${FAILURE_REASONS[attempt.kind]}), so this forecast uses your approximate city derived from your IP address — not GPS, and often tens of kilometres out. Pick a district below for an exact point.`,
    };
  }

  const hint = /district/i.test(attempt.message) ? "" : " Picking a district below still gives you a full forecast.";
  return { ok: false, kind: attempt.kind, message: `${attempt.message}${hint}` };
}

export type InsightRequest = {
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

export type InsightResponse =
  | { ok: true; available: true; model: string; text: string; disclaimer: string }
  | { ok: true; available: false; reason: string; guidance: string }
  | { ok: false; available: boolean; error: string };

export async function requestInsight(payload: InsightRequest): Promise<InsightResponse> {
  try {
    const response = await fetch("/api/insights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return (await response.json()) as InsightResponse;
  } catch (error) {
    return { ok: false, available: true, error: error instanceof Error ? error.message : "Could not reach the explanation service." };
  }
}
