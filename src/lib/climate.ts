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

export function locateBrowser(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("This browser does not support location detection."));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, timeout: 12_000, maximumAge: 300_000 });
  });
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
