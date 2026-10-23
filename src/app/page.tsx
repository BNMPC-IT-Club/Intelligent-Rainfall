"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import {
  calculateHarvest,
  clamp,
  createScenario,
  DISTRICT_GROUPS,
  DISTRICTS,
  getRainfallTotal,
  hasCompleteMonthlyRainfall,
  MONTH_NAMES,
  ROOF_COEFFICIENTS,
  simulateMonthlyStorage,
} from "@/lib/rainfall";
import { completeMonthlySeries, fetchDistrictClimate, fetchForecast, locateBrowser, requestInsight, reverseGeocode } from "@/lib/climate";
import type { ClimateDataset, DetectedPlace, ForecastDataset, InsightResponse } from "@/lib/climate";
import { findDistrictPoint, findNearestDistrict } from "@/lib/districts";
import { describeWeatherCode, weatherCodeIcon } from "@/lib/weathercodes";

import type {
  RainfallCategory,
  RainfallOrigin,
  RainfallRecord,
  RoofType,
  Scenario,
} from "@/lib/rainfall";

const STORAGE_KEY = "intelligent-rainfall-workspace-v1";

type Section = "overview" | "calculator" | "storage" | "explorer" | "forecast" | "scenarios" | "reports" | "insights" | "science" | "about";
type GeoStatus = "idle" | "locating" | "done" | "denied" | "error";
type ExplorerCategory = RainfallCategory | "all";
type IconName =
  | "grid" | "cloud" | "calculator" | "tank" | "map" | "compare" | "folder" | "book"
  | "info" | "search" | "plus" | "arrow" | "check" | "shield" | "chevron" | "menu"
  | "close" | "sun" | "moon" | "upload" | "download" | "save" | "trash" | "copy"
  | "printer" | "external" | "alert" | "drop" | "target" | "refresh" | "edit" | "file" | "spark" | "spinner";

type PersistedState = {
  activeScenario?: unknown;
  savedProjects?: unknown;
  rainfallRecords?: unknown;
  darkMode?: unknown;
  dataMode?: unknown;
  analysisYear?: unknown;
  explorerDistrict?: unknown;
};

type DataMode = "auto" | "manual";
type ClimateStatus = "idle" | "loading" | "ready" | "error";

const NAV_ITEMS: { id: Section; label: string; icon: IconName }[] = [
  { id: "overview", label: "Overview", icon: "grid" },
  { id: "explorer", label: "Rainfall explorer", icon: "cloud" },
  { id: "calculator", label: "Harvest calculator", icon: "calculator" },
  { id: "storage", label: "Storage planner", icon: "tank" },
  { id: "forecast", label: "Weather forecast", icon: "sun" },
  { id: "scenarios", label: "Scenario studio", icon: "compare" },
  { id: "reports", label: "Reports & projects", icon: "folder" },
  { id: "insights", label: "AI explanation", icon: "spark" },
  { id: "science", label: "Science & method", icon: "book" },
  { id: "about", label: "About", icon: "info" },
];

const CATEGORY_LABELS: Record<RainfallCategory, string> = {
  measurement: "Measurement · uploader-labelled",
  "historical-average": "Historical average · uploader-labelled",
  forecast: "Forecast · uploader-labelled",
  illustrative: "Illustrative scenario",
};

const CATEGORY_SHORT: Record<RainfallCategory, string> = {
  measurement: "Measurement",
  "historical-average": "Historical average",
  forecast: "Forecast",
  illustrative: "Illustrative",
};

function Icon({ name, size = 18, className = "" }: { name: IconName; size?: number; className?: string }) {
  let content: ReactNode;
  switch (name) {
    case "grid": content = <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>; break;
    case "cloud": content = <><path d="M7 18h10.5a3.5 3.5 0 0 0 .4-7A5.5 5.5 0 0 0 7.5 9.5 4.3 4.3 0 0 0 7 18Z" /><path d="m9 20-1 2m6-2-1 2m6-2-1 2" /></>; break;
    case "calculator": content = <><rect x="5" y="2.5" width="14" height="19" rx="2" /><path d="M8 6h8M8 11h1m3 0h1m3 0h.01M8 15h1m3 0h1m3 0h.01M8 19h1m3 0h1m3 0h.01" /></>; break;
    case "tank": content = <><path d="M5 5h14M7 5V3h10v2m-11 0 1 16h10l1-16" /><path d="M8 13c2-1.6 6-1.6 8 0m-7 3c1.5-1 4.5-1 6 0" /></>; break;
    case "map": content = <><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z" /><path d="M9 3v15m6-12v15" /></>; break;
    case "compare": content = <><path d="M4 19V9m5 10V5m6 14v-7m5 7V3" /><path d="M2 19h20" /></>; break;
    case "folder": content = <><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" /><path d="M3 10h18" /></>; break;
    case "book": content = <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Z" /><path d="M4 17a2.5 2.5 0 0 1 2.5-2.5H20M8 7h8m-8 3h6" /></>; break;
    case "info": content = <><circle cx="12" cy="12" r="9" /><path d="M12 11v5m0-9h.01" /></>; break;
    case "search": content = <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></>; break;
    case "plus": content = <><path d="M12 5v14M5 12h14" /></>; break;
    case "arrow": content = <><path d="M7 17 17 7M7 7h10v10" /></>; break;
    case "check": content = <><path d="m5 12 4 4L19 6" /></>; break;
    case "shield": content = <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" /><path d="m9 12 2 2 4-4" /></>; break;
    case "chevron": content = <><path d="m9 18 6-6-6-6" /></>; break;
    case "menu": content = <><path d="M4 6h16M4 12h16M4 18h16" /></>; break;
    case "close": content = <><path d="m18 6-12 12M6 6l12 12" /></>; break;
    case "sun": content = <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></>; break;
    case "moon": content = <><path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z" /></>; break;
    case "upload": content = <><path d="M12 16V4m-4 4 4-4 4 4" /><path d="M4 16v4h16v-4" /></>; break;
    case "download": content = <><path d="M12 4v12m-4-4 4 4 4-4" /><path d="M4 17v3h16v-3" /></>; break;
    case "save": content = <><path d="M5 3h12l4 4v14H3V3h2Z" /><path d="M7 3v6h10V3M7 21v-8h10v8" /></>; break;
    case "trash": content = <><path d="M3 6h18m-2 0-.8 14H5.8L5 6m4 0V4h6v2m-5 4v6m4-6v6" /></>; break;
    case "copy": content = <><rect x="8" y="8" width="13" height="13" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></>; break;
    case "printer": content = <><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><path d="M6 14h12v7H6zM18 12h.01" /></>; break;
    case "external": content = <><path d="M14 3h7v7m-1-6L10 14" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></>; break;
    case "alert": content = <><path d="M10.3 3.9 2.7 17a2 2 0 0 0 1.7 3h15.2a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4m0 4h.01" /></>; break;
    case "drop": content = <><path d="M12 22a7 7 0 0 0 7-7c0-4-7-13-7-13S5 11 5 15a7 7 0 0 0 7 7Z" /><path d="M9 16a3 3 0 0 0 3 3" /></>; break;
    case "target": content = <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>; break;
    case "refresh": content = <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.6 9A7 7 0 0 1 18 6l2 6M4 12l2 6a7 7 0 0 0 12.4-3" /></>; break;
    case "edit": content = <><path d="m15 5 4 4M4 20l4-.8L19 8a2.8 2.8 0 0 0-4-4L4 15v5Z" /></>; break;
    case "file": content = <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6M8 13h8m-8 4h8" /></>; break;
    case "spark": content = <><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" /><path d="M18.5 15.5 19 17l1.5.5L19 18l-.5 1.5L18 18l-1.5-.5L18 17l.5-1.5ZM6 4l.5 1.5L8 6l-1.5.5L6 8l-.5-1.5L4 6l1.5-.5L6 4Z" /></>; break;
    case "spinner": content = <><path d="M12 3a9 9 0 1 0 9 9" /></>; break;
    default: content = <circle cx="12" cy="12" r="8" />;
  }
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{content}</svg>;
}

function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `rw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normaliseScenario(value: unknown): Scenario | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<Scenario>;
  const base = createScenario(typeof raw.id === "string" ? raw.id : makeId(), typeof raw.name === "string" ? raw.name : "Imported analysis");
  const roofTypes: RoofType[] = ["concrete", "metal", "tiles", "other"];
  const origins: RainfallOrigin[] = ["user", "imported", "illustrative", "api"];
  const rainfallPeriods = ["annual", "event"];
  const monthly = Array.isArray(raw.monthlyRainfallMm) && raw.monthlyRainfallMm.length === 12
    ? raw.monthlyRainfallMm.map((item) => item === null || item === undefined ? null : Number.isFinite(Number(item)) ? Number(item) : null)
    : null;
  return {
    ...base,
    id: typeof raw.id === "string" && raw.id ? raw.id : base.id,
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name.slice(0, 100) : base.name,
    district: typeof raw.district === "string" && DISTRICTS.some((district) => district === raw.district) ? raw.district : base.district,
    roofAreaM2: Number.isFinite(Number(raw.roofAreaM2)) ? Number(raw.roofAreaM2) : base.roofAreaM2,
    roofType: roofTypes.includes(raw.roofType as RoofType) ? raw.roofType as RoofType : base.roofType,
    runoffCoefficient: Number.isFinite(Number(raw.runoffCoefficient)) ? Number(raw.runoffCoefficient) : base.runoffCoefficient,
    customCoefficient: Boolean(raw.customCoefficient),
    collectionLossPercent: Number.isFinite(Number(raw.collectionLossPercent)) ? Number(raw.collectionLossPercent) : base.collectionLossPercent,
    rainfallPeriod: rainfallPeriods.includes(String(raw.rainfallPeriod)) ? raw.rainfallPeriod as Scenario["rainfallPeriod"] : base.rainfallPeriod,
    rainfallMm: Number.isFinite(Number(raw.rainfallMm)) ? Number(raw.rainfallMm) : base.rainfallMm,
    rainfallOrigin: origins.includes(raw.rainfallOrigin as RainfallOrigin) ? raw.rainfallOrigin as RainfallOrigin : base.rainfallOrigin,
    rainfallSource: typeof raw.rainfallSource === "string" ? raw.rainfallSource.slice(0, 240) : base.rainfallSource,
    monthlyRainfallMm: monthly,
    householdMembers: Number.isFinite(Number(raw.householdMembers)) ? Number(raw.householdMembers) : base.householdMembers,
    demandPerPerson: Number.isFinite(Number(raw.demandPerPerson)) ? Number(raw.demandPerPerson) : base.demandPerPerson,
    additionalDailyDemand: Number.isFinite(Number(raw.additionalDailyDemand)) ? Number(raw.additionalDailyDemand) : base.additionalDailyDemand,
    tankCapacityLitres: Number.isFinite(Number(raw.tankCapacityLitres)) ? Number(raw.tankCapacityLitres) : base.tankCapacityLitres,
    startingStoragePercent: Number.isFinite(Number(raw.startingStoragePercent)) ? Number(raw.startingStoragePercent) : base.startingStoragePercent,
    dryGapDays: Number.isFinite(Number(raw.dryGapDays)) ? Number(raw.dryGapDays) : base.dryGapDays,
    targetBufferDays: Number.isFinite(Number(raw.targetBufferDays)) ? Number(raw.targetBufferDays) : base.targetBufferDays,
  };
}

function normaliseRecord(value: unknown): RainfallRecord | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<RainfallRecord>;
  const categories: RainfallCategory[] = ["measurement", "historical-average", "forecast", "illustrative"];
  if (typeof raw.district !== "string" || !DISTRICTS.some((district) => district === raw.district)) return null;
  if (typeof raw.period !== "string" || !raw.period.trim()) return null;
  if (!Number.isFinite(Number(raw.rainfallMm)) || Number(raw.rainfallMm) < 0) return null;
  if (typeof raw.source !== "string" || !raw.source.trim()) return null;
  return {
    id: typeof raw.id === "string" ? raw.id : makeId(),
    district: raw.district,
    period: raw.period.slice(0, 48),
    rainfallMm: Number(raw.rainfallMm),
    source: raw.source.slice(0, 240),
    category: categories.includes(raw.category as RainfallCategory) ? raw.category as RainfallCategory : "measurement",
    addedAt: typeof raw.addedAt === "string" ? raw.addedAt : new Date().toISOString(),
  };
}

function scenarioHasRainfallValue(scenario: Scenario): boolean {
  const hasSourceNote = scenario.rainfallSource.trim().length > 0;
  const isUnfinishedMonthlyDraft = scenario.monthlyRainfallMm !== null && !hasCompleteMonthlyRainfall(scenario) && scenario.rainfallSource === "Monthly rainfall distribution in progress";
  return hasSourceNote && !isUnfinishedMonthlyDraft;
}

function formatNumber(value: number, maximumFractionDigits = 0): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits }).format(value);
}

function formatLitres(value: number): string {
  return `${formatNumber(value)} L`;
}

function escapeCsv(value: string | number): string {
  const text = String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function parseCsv(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"' && quoted && source[index + 1] === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      row.push(cell.trim());
      if (row.some((part) => part.length > 0)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  row.push(cell.trim());
  if (row.some((part) => part.length > 0)) rows.push(row);
  return rows;
}

function categoryFromText(value: string): RainfallCategory {
  const text = value.trim().toLowerCase().replaceAll("_", "-").replaceAll(" ", "-");
  if (text.includes("forecast")) return "forecast";
  if (text.includes("average") || text.includes("climatology")) return "historical-average";
  if (text.includes("illustrative") || text.includes("demo")) return "illustrative";
  return "measurement";
}

function SectionHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="section-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action ? <div className="section-action">{action}</div> : null}
    </div>
  );
}

function PanelTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="panel-title-row">
      <div>
        <h2>{title}</h2>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {action ? <div className="panel-title-action">{action}</div> : null}
    </div>
  );
}

function EmptyState({ icon = "cloud", title, description, action }: { icon?: IconName; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon"><Icon name={icon} size={21} /></div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action ? <div className="empty-state-action">{action}</div> : null}
    </div>
  );
}

function BarChart({ items, unit, emptyTitle, emptyDescription }: {
  items: { label: string; value: number; detail?: string }[];
  unit: string;
  emptyTitle: string;
  emptyDescription: string;
}) {
  const max = Math.max(0, ...items.map((item) => Math.max(0, item.value)));
  if (!items.length) return <EmptyState icon="compare" title={emptyTitle} description={emptyDescription} />;
  return (
    <div className="chart-wrap" role="img" aria-label={`${items.length} bar chart, unit ${unit}`}>
      <div className="chart-unit">{unit}</div>
      <div className="chart-grid-lines"><span /><span /><span /><span /></div>
      <div className="chart-bars">
        {items.map((item, index) => {
          const height = max > 0 ? Math.max(0, item.value) / max * 100 : 0;
          return (
            <div className="chart-column" key={`${item.label}-${index}`} title={`${item.label}: ${formatNumber(item.value, 1)} ${unit}${item.detail ? ` · ${item.detail}` : ""}`}>
              <span className="chart-value">{formatNumber(item.value, 0)}</span>
              <div className="chart-bar-track"><span className={index % 4 === 2 ? "chart-bar alt" : "chart-bar"} style={{ height: `${height}%` }} /></div>
              <span className="chart-label">{item.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NumberField({ label, value, unit, onChange, min = 0, max, step = 1, hint, id, disabled = false }: {
  label: string;
  value: number;
  unit?: string;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
  id: string;
  disabled?: boolean;
}) {
  return (
    <label className={`field${disabled ? " field-disabled" : ""}`} htmlFor={id}>
      <span className="field-label">{label}</span>
      <span className="field-input-wrap">
        <input id={id} type="number" inputMode="decimal" min={min} max={max} step={step} value={Number.isFinite(value) ? value : 0} onChange={(event) => onChange(event.target.value === "" ? 0 : Number(event.target.value))} disabled={disabled} />
        {unit ? <span className="field-unit">{unit}</span> : null}
      </span>
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

function OriginBadge({ origin }: { origin: RainfallOrigin }) {
  const label = origin === "api" ? "NASA POWER · live" : origin === "illustrative" ? "Illustrative" : origin === "imported" ? "User import" : "User-entered";
  const icon: IconName = origin === "api" ? "cloud" : origin === "illustrative" ? "info" : origin === "imported" ? "upload" : "edit";
  return <span className={`origin-badge origin-${origin}`}><Icon name={icon} size={13} />{label}</span>;
}

function MethodNote({ children }: { children: ReactNode }) {
  return <div className="method-note"><Icon name="info" size={16} /><span>{children}</span></div>;
}

export default function HomePage() {
  const [activeSection, setActiveSection] = useState<Section>("overview");
  const [activeScenario, setActiveScenario] = useState<Scenario>(() => createScenario("draft-local"));
  const [savedProjects, setSavedProjects] = useState<Scenario[]>([]);
  const [rainfallRecords, setRainfallRecords] = useState<RainfallRecord[]>([]);
  const [darkMode, setDarkMode] = useState(false);
  const [ready, setReady] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [storageWarning, setStorageWarning] = useState(false);
  const [notice, setNotice] = useState("");
  const [areaUnit, setAreaUnit] = useState<"m2" | "ft2">("m2");
  const [monthlyEditorOpen, setMonthlyEditorOpen] = useState(false);
  const [recordFormOpen, setRecordFormOpen] = useState(false);
  const [recordSearch, setRecordSearch] = useState("");
  const [districtFilter, setDistrictFilter] = useState("");
  const [explorerDistrict, setExplorerDistrict] = useState("Dhaka");
  const [explorerCategory, setExplorerCategory] = useState<ExplorerCategory>("all");
  const [comparisonCategory, setComparisonCategory] = useState<RainfallCategory>("measurement");
  const [comparisonPeriod, setComparisonPeriod] = useState("");
  const [recordDraft, setRecordDraft] = useState({ district: "Dhaka", period: "", rainfallMm: "", source: "", category: "measurement" as RainfallCategory });
  const [dataMode, setDataMode] = useState<DataMode>("auto");
  const [analysisYear, setAnalysisYear] = useState<number>(() => new Date().getFullYear() - 1);
  const [climate, setClimate] = useState<ClimateDataset | null>(null);
  const [climateStatus, setClimateStatus] = useState<ClimateStatus>("idle");
  const [climateError, setClimateError] = useState("");
  const [climateCache, setClimateCache] = useState<Record<string, ClimateDataset>>({});
  const [insight, setInsight] = useState<InsightResponse | null>(null);
  const [insightStatus, setInsightStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [insightError, setInsightError] = useState("");
  const [geoStatus, setGeoStatus] = useState<GeoStatus>("idle");
  const [geoError, setGeoError] = useState("");
  const [forecastPoint, setForecastPoint] = useState<{ latitude: number; longitude: number } | null>(null);
  const [detectedPlace, setDetectedPlace] = useState<DetectedPlace | null>(null);
  const [forecast, setForecast] = useState<ForecastDataset | null>(null);
  const [forecastStatus, setForecastStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [forecastError, setForecastError] = useState("");
  const [forecastDistrict, setForecastDistrict] = useState("Dhaka");
  const rainfallUploadRef = useRef<HTMLInputElement>(null);
  const projectUploadRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as PersistedState;
        const active = normaliseScenario(parsed.activeScenario);
        if (active) setActiveScenario(active);
        if (Array.isArray(parsed.savedProjects)) {
          setSavedProjects(parsed.savedProjects.map(normaliseScenario).filter((item): item is Scenario => item !== null));
        }
        if (Array.isArray(parsed.rainfallRecords)) {
          setRainfallRecords(parsed.rainfallRecords.map(normaliseRecord).filter((item): item is RainfallRecord => item !== null));
        }
        if (typeof parsed.darkMode === "boolean") setDarkMode(parsed.darkMode);
        if (parsed.dataMode === "auto" || parsed.dataMode === "manual") setDataMode(parsed.dataMode);
        if (typeof parsed.analysisYear === "number" && Number.isFinite(parsed.analysisYear)) {
          setAnalysisYear(Math.min(Math.max(Math.round(parsed.analysisYear), 1981), new Date().getFullYear()));
        }
        if (typeof parsed.explorerDistrict === "string" && DISTRICTS.some((district) => district === parsed.explorerDistrict)) {
          setExplorerDistrict(parsed.explorerDistrict);
        }
      }
    } catch {
      setStorageWarning(true);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ activeScenario, savedProjects, rainfallRecords, darkMode, dataMode, analysisYear, explorerDistrict }));
      setStorageWarning(false);
    } catch {
      setStorageWarning(true);
    }
  }, [ready, activeScenario, savedProjects, rainfallRecords, darkMode, dataMode, analysisYear, explorerDistrict]);

  const newestAvailableYear = Math.max(1981, new Date().getFullYear() - 1);
  const trendEndYear = Math.min(newestAvailableYear, Math.max(1981, analysisYear));
  const trendStartYear = Math.max(1981, trendEndYear - 9);

  useEffect(() => {
    if (!ready) return;
    const cacheKey = `${explorerDistrict}|${trendStartYear}|${trendEndYear}`;
    const cachedDataset = climateCache[cacheKey];
    if (cachedDataset) {
      setClimate(cachedDataset);
      setClimateStatus("ready");
      setClimateError("");
      return;
    }
    const controller = new AbortController();
    setClimateStatus("loading");
    setClimateError("");
    fetchDistrictClimate(explorerDistrict, trendStartYear, trendEndYear, controller.signal)
      .then((response) => {
        if (controller.signal.aborted) return;
        if (response.ok) {
          setClimate(response);
          setClimateCache((cache) => ({ ...cache, [cacheKey]: response }));
          setClimateStatus("ready");
        } else {
          setClimate(null);
          setClimateStatus("error");
          setClimateError(response.error);
        }
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setClimate(null);
        setClimateStatus("error");
        setClimateError(error instanceof Error ? error.message : "Could not load rainfall data.");
      });
    return () => controller.abort();
  }, [ready, explorerDistrict, trendStartYear, trendEndYear, climateCache]);

  const selectedClimateYear = climate ? Math.min(Math.max(analysisYear, climate.startYear), climate.endYear) : analysisYear;
  const selectedClimateMonths = climate?.monthlyByYear[String(selectedClimateYear)] ?? null;
  const selectedClimateComplete = completeMonthlySeries(selectedClimateMonths ?? undefined);
  const selectedAnnualRainfall = useMemo(() => {
    if (!climate) return null;
    return climate.annual.find((entry) => entry.year === selectedClimateYear)?.mm ?? null;
  }, [climate, selectedClimateYear]);

  function applyClimateToScenario(dataset: ClimateDataset, year: number) {
    const months = dataset.monthlyByYear[String(year)];
    if (!completeMonthlySeries(months)) {
      notify(`NASA POWER has no complete 12-month series for ${dataset.district} in ${year}. Pick another year or enter rainfall manually.`);
      return;
    }
    const total = months.reduce<number>((sum, value) => sum + value, 0);
    setActiveScenario((current) => ({
      ...current,
      district: dataset.district,
      rainfallPeriod: "annual",
      rainfallMm: Number(total.toFixed(1)),
      monthlyRainfallMm: months,
      rainfallOrigin: "api",
      rainfallSource: `NASA POWER PRECTOTCORR ${year} · MERRA-2 gridded reanalysis · ${dataset.point.latitude.toFixed(2)}°N, ${dataset.point.longitude.toFixed(2)}°E`,
    }));
    setDataMode("auto");
    setAnalysisYear(year);
    setMonthlyEditorOpen(false);
    notify(`Loaded real ${year} rainfall for ${dataset.district} from NASA POWER.`);
  }

  useEffect(() => {
    if (!ready || !climate) return;
    const year = Math.min(Math.max(analysisYear, climate.startYear), climate.endYear);
    if (!completeMonthlySeries(climate.monthlyByYear[String(year)])) return;
    const expectedPrefix = `NASA POWER PRECTOTCORR ${year}`;
    const alreadyApplied = activeScenario.rainfallOrigin === "api"
      && activeScenario.district === climate.district
      && activeScenario.rainfallSource.startsWith(expectedPrefix);
    if (alreadyApplied || dataMode !== "auto") return;
    setActiveScenario((current) => ({
      ...current,
      district: climate.district,
      rainfallPeriod: "annual",
      rainfallMm: Number(climate.monthlyByYear[String(year)]!.reduce<number>((sum, value) => sum + (value ?? 0), 0).toFixed(1)),
      monthlyRainfallMm: climate.monthlyByYear[String(year)]!,
      rainfallOrigin: "api",
      rainfallSource: `NASA POWER PRECTOTCORR ${year} · MERRA-2 gridded reanalysis · ${climate.point.latitude.toFixed(2)}°N, ${climate.point.longitude.toFixed(2)}°E`,
    }));
    // Intentionally excludes activeScenario: this auto-fill must not fight manual edits.
  }, [ready, climate, analysisYear, dataMode]);

  async function loadForecastFor(latitude: number, longitude: number) {
    setForecastPoint({ latitude, longitude });
    setForecastStatus("loading");
    setForecastError("");
    const nearest = findNearestDistrict(latitude, longitude);
    setForecastDistrict(nearest.district.name);
    const response = await fetchForecast(latitude, longitude);
    if (response.ok) {
      setForecast(response);
      setForecastStatus("ready");
    } else {
      setForecast(null);
      setForecastStatus("error");
      setForecastError(response.error);
    }
  }

  async function detectMyLocation() {
    setGeoStatus("locating");
    setGeoError("");
    setDetectedPlace(null);
    try {
      const position = await locateBrowser();
      const { latitude, longitude } = position.coords;
      setGeoStatus("done");
      void loadForecastFor(latitude, longitude);
      const place = await reverseGeocode(latitude, longitude);
      if (place) setDetectedPlace(place);
    } catch (error) {
      const permissionDenied = error instanceof GeolocationPositionError && error.code === error.PERMISSION_DENIED;
      setGeoStatus(permissionDenied ? "denied" : "error");
      setGeoError(
        permissionDenied
          ? "Location access was denied. Allow location permission in your browser, or pick a district below instead."
          : error instanceof Error ? error.message : "Could not detect your location.",
      );
    }
  }

  function loadForecastForDistrict(districtName: string) {
    const point = findDistrictPoint(districtName);
    if (!point) return;
    setForecastDistrict(districtName);
    setDetectedPlace({ label: `${districtName} (district reference point)`, city: districtName, region: null, country: "Bangladesh" });
    void loadForecastFor(point.latitude, point.longitude);
  }

  async function generateInsight() {
    setInsightStatus("loading");
    setInsightError("");
    const response = await requestInsight({
      district: activeScenario.district,
      year: activeScenario.rainfallPeriod === "annual" ? String(selectedClimateYear) : "not applicable",
      dataOrigin: activeScenario.rainfallOrigin,
      rainfallSource: activeScenario.rainfallSource || "Not specified",
      annualRainfallMm: getRainfallTotal(activeScenario),
      monthlyRainfallMm: activeScenario.monthlyRainfallMm ?? Array.from({ length: 12 }, () => null),
      roofAreaM2: activeScenario.roofAreaM2,
      roofType: activeScenario.roofType,
      runoffCoefficient: activeScenario.runoffCoefficient,
      collectionLossPercent: activeScenario.collectionLossPercent,
      theoreticalLitres: result.theoreticalLitres,
      usableLitres: result.usableLitres,
      dailyDemandLitres: result.dailyDemandLitres,
      annualDemandLitres: result.annualDemandLitres,
      annualCoveragePercent: result.annualCoveragePercent,
      tankCapacityLitres: activeScenario.tankCapacityLitres,
      storageShortfallLitres: monthlySimulation?.totalShortage ?? null,
      storageOverflowLitres: monthlySimulation?.totalOverflow ?? null,
    });
    setInsight(response);
    setInsightStatus(response.ok ? "done" : "error");
    if (!response.ok) setInsightError(response.error);
  }

  const result = useMemo(() => calculateHarvest(activeScenario), [activeScenario]);
  const monthlyDataComplete = hasCompleteMonthlyRainfall(activeScenario);
  const monthlySimulation = useMemo(() => simulateMonthlyStorage(activeScenario), [activeScenario]);
  const hasRainfallInput = scenarioHasRainfallValue(activeScenario);
  const inputErrors = useMemo(() => {
    const errors: string[] = [];
    if (activeScenario.roofAreaM2 <= 0 || activeScenario.roofAreaM2 > 100000) errors.push("Roof area must be greater than 0 and no more than 100,000 m².");
    if (activeScenario.runoffCoefficient < 0 || activeScenario.runoffCoefficient > 1) errors.push("Runoff coefficient must be between 0 and 1.");
    if (activeScenario.collectionLossPercent < 0 || activeScenario.collectionLossPercent > 100) errors.push("Collection losses must be between 0% and 100%.");
    if (activeScenario.rainfallMm < 0 || activeScenario.rainfallMm > 10000) errors.push("Rainfall must be between 0 and 10,000 mm for this input.");
    if (activeScenario.householdMembers < 0 || activeScenario.demandPerPerson < 0 || activeScenario.additionalDailyDemand < 0) errors.push("Demand values cannot be negative.");
    if (activeScenario.tankCapacityLitres < 0) errors.push("Tank capacity cannot be negative.");
    if (activeScenario.monthlyRainfallMm?.some((value) => value !== null && (value < 0 || value > 10000))) errors.push("Each monthly rainfall value must be from 0 to 10,000 mm.");
    return errors;
  }, [activeScenario]);
  const calculationReady = hasRainfallInput && inputErrors.length === 0;
  const currentTitle = NAV_ITEMS.find((item) => item.id === activeSection)?.label ?? "Overview";
  const isCurrentSaved = savedProjects.some((project) => project.id === activeScenario.id);

  function notify(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3200);
  }

  function updateScenario(patch: Partial<Scenario>) {
    setActiveScenario((current) => ({ ...current, ...patch }));
  }

  function changeRainfall(value: number) {
    const source = activeScenario.rainfallOrigin === "imported"
      ? `User-edited value · previous source label: ${activeScenario.rainfallSource}`
      : activeScenario.rainfallOrigin === "illustrative"
        ? "User-edited illustrative scenario"
        : activeScenario.rainfallSource || "User-entered value";
    updateScenario({ rainfallMm: value, monthlyRainfallMm: null, rainfallSource: source, rainfallOrigin: "user" });
    setDataMode("manual");
    setMonthlyEditorOpen(false);
  }

  function changeMonthlyRainfall(index: number, value: number | null) {
    const months: (number | null)[] = activeScenario.monthlyRainfallMm ? [...activeScenario.monthlyRainfallMm] : Array.from({ length: 12 }, () => null);
    months[index] = value;
    const complete = months.every((amount) => amount !== null && Number.isFinite(amount) && amount >= 0);
    const total = complete ? months.reduce<number>((sum, amount) => sum + (amount ?? 0), 0) : activeScenario.rainfallMm;
    let source = activeScenario.rainfallSource;
    if (activeScenario.rainfallOrigin === "imported") source = `Manually edited monthly values · previous source label: ${activeScenario.rainfallSource}`;
    if (!source || source === "Monthly rainfall distribution in progress") source = complete ? "User-entered monthly rainfall values" : "Monthly rainfall distribution in progress";
    updateScenario({ monthlyRainfallMm: months, rainfallPeriod: "annual", rainfallMm: total, rainfallOrigin: "user", rainfallSource: source });
    setDataMode("manual");
  }

  function toggleMonthlyEditor() {
    if (monthlyEditorOpen) {
      setMonthlyEditorOpen(false);
    } else {
      updateScenario({ rainfallPeriod: "annual" });
      setMonthlyEditorOpen(true);
    }
  }

  function goTo(section: Section) {
    setActiveSection(section);
    setMobileNavOpen(false);
  }

  function saveCurrentScenario() {
    const current = { ...activeScenario, name: activeScenario.name.trim() || "Rainwater plan" };
    setActiveScenario(current);
    setSavedProjects((items) => {
      const index = items.findIndex((item) => item.id === current.id);
      if (index === -1) return [current, ...items];
      return items.map((item) => item.id === current.id ? current : item);
    });
    notify("Analysis saved in this browser.");
  }

  function startNewScenario() {
    setActiveScenario(createScenario(makeId(), "New analysis"));
    setAreaUnit("m2");
    setMonthlyEditorOpen(false);
    goTo("calculator");
  }

  function loadScenario(scenario: Scenario) {
    setActiveScenario({ ...scenario });
    setMonthlyEditorOpen(Boolean(scenario.monthlyRainfallMm));
    goTo("overview");
    notify(`Opened “${scenario.name}”.`);
  }

  function duplicateScenario(scenario: Scenario) {
    const duplicate = { ...scenario, id: makeId(), name: `${scenario.name} · copy` };
    setSavedProjects((items) => [duplicate, ...items]);
    setActiveScenario(duplicate);
    goTo("calculator");
    notify("A separate copy was created.");
  }

  function deleteScenario(id: string) {
    if (!window.confirm("Delete this saved analysis from this browser? This cannot be undone.")) return;
    setSavedProjects((items) => items.filter((item) => item.id !== id));
    if (activeScenario.id === id) setActiveScenario(createScenario(makeId(), "New analysis"));
    notify("Saved analysis deleted.");
  }

  function loadWorkedExample() {
    const example = createScenario(makeId(), "Illustrative 100 × 100 × 0.8 example");
    example.district = "Dhaka";
    example.roofAreaM2 = 100;
    example.roofType = "concrete";
    example.runoffCoefficient = 0.8;
    example.collectionLossPercent = 0;
    example.rainfallPeriod = "event";
    example.rainfallMm = 100;
    example.rainfallOrigin = "illustrative";
    example.rainfallSource = "Illustrative formula example only; no district attribution";
    setActiveScenario(example);
    setDataMode("manual");
    setMonthlyEditorOpen(false);
    goTo("calculator");
    notify("Loaded the labelled calculation example. Automatic data will not overwrite it while manual mode is on.");
  }

  function applyRecordToCalculator(record: RainfallRecord) {
    const periodType = /^\d{4}$/.test(record.period.trim()) ? "annual" : "event";
    setActiveScenario((current) => ({
      ...current,
      district: record.district,
      rainfallMm: record.rainfallMm,
      rainfallPeriod: periodType,
      monthlyRainfallMm: null,
      rainfallOrigin: "imported",
      rainfallSource: `${record.source} · ${record.period} · ${CATEGORY_SHORT[record.category]}`,
    }));
    setDataMode("manual");
    setMonthlyEditorOpen(false);
    goTo("calculator");
    notify("Rainfall value copied into the active estimate. Source remains unverified by this app.");
  }

  function deleteRainfallRecord(id: string) {
    if (!window.confirm("Remove this rainfall record from this browser?")) return;
    setRainfallRecords((items) => items.filter((item) => item.id !== id));
    notify("Rainfall record removed.");
  }

  function addRainfallRecord(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = Number(recordDraft.rainfallMm);
    if (!DISTRICTS.some((district) => district === recordDraft.district) || !recordDraft.period.trim() || !recordDraft.source.trim() || !Number.isFinite(value) || value < 0) {
      notify("Add a district, period, non-negative rainfall amount, and source label.");
      return;
    }
    const record: RainfallRecord = {
      id: makeId(),
      district: recordDraft.district,
      period: recordDraft.period.trim(),
      rainfallMm: value,
      source: recordDraft.source.trim(),
      category: recordDraft.category,
      addedAt: new Date().toISOString(),
    };
    setRainfallRecords((items) => [record, ...items]);
    setExplorerDistrict(record.district);
    setRecordDraft({ district: record.district, period: "", rainfallMm: "", source: "", category: "measurement" });
    setRecordFormOpen(false);
    notify("Record added. Its source and classification are saved as supplied by you.");
  }

  async function importRainfallCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const rows = parseCsv(await file.text());
      if (rows.length < 2) throw new Error("CSV has no data rows.");
      const headers = rows[0].map((header) => header.trim().toLowerCase());
      const indexes = {
        district: headers.indexOf("district"),
        period: headers.indexOf("period"),
        rainfall: headers.indexOf("rainfall_mm"),
        source: headers.indexOf("source"),
        category: headers.indexOf("category"),
      };
      if ([indexes.district, indexes.period, indexes.rainfall, indexes.source].some((index) => index < 0)) {
        throw new Error("Required headers: district, period, rainfall_mm, source. Optional: category.");
      }
      const imported: RainfallRecord[] = [];
      let rejected = 0;
      rows.slice(1).forEach((row) => {
        const districtCell = row[indexes.district]?.trim();
        const district = DISTRICTS.find((item) => item.toLowerCase() === districtCell?.toLowerCase());
        const period = row[indexes.period]?.trim();
        const amount = Number(row[indexes.rainfall]);
        const source = row[indexes.source]?.trim();
        if (!district || !period || !source || !Number.isFinite(amount) || amount < 0) {
          rejected += 1;
          return;
        }
        imported.push({
          id: makeId(), district, period, rainfallMm: amount, source,
          category: categoryFromText(indexes.category >= 0 ? row[indexes.category] ?? "" : "measurement"),
          addedAt: new Date().toISOString(),
        });
      });
      if (!imported.length) throw new Error("No valid rows found. Check district spelling, numeric mm values, period, and source.");
      setRainfallRecords((items) => [...imported, ...items]);
      setExplorerDistrict(imported[0].district);
      notify(`Imported ${imported.length} record${imported.length === 1 ? "" : "s"}${rejected ? `; skipped ${rejected} invalid row${rejected === 1 ? "" : "s"}` : ""}. Uploader metadata is not independently verified.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not read this CSV file.");
    } finally {
      event.target.value = "";
    }
  }

  async function importProjectJson(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as PersistedState;
      const active = normaliseScenario(parsed.activeScenario);
      const importedProjects = Array.isArray(parsed.savedProjects)
        ? parsed.savedProjects.map(normaliseScenario).filter((item): item is Scenario => item !== null).map((item) => ({ ...item, id: makeId(), name: `${item.name} · imported` }))
        : [];
      const importedRecords = Array.isArray(parsed.rainfallRecords)
        ? parsed.rainfallRecords.map(normaliseRecord).filter((item): item is RainfallRecord => item !== null).map((item) => ({ ...item, id: makeId() }))
        : [];
      if (!active && importedProjects.length === 0 && importedRecords.length === 0) {
        throw new Error("This file does not contain a readable analysis, saved project, or rainfall record.");
      }
      if (active) {
        setActiveScenario({ ...active, id: makeId(), name: `${active.name} · imported` });
        setMonthlyEditorOpen(Boolean(active.monthlyRainfallMm));
      }
      if (importedProjects.length) setSavedProjects((items) => [...importedProjects, ...items]);
      if (importedRecords.length) setRainfallRecords((items) => [...importedRecords, ...items]);
      notify("JSON data imported to this browser. Review source labels before using the values.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not import this JSON file.");
    } finally {
      event.target.value = "";
    }
  }

  function exportWorkspaceJson() {
    const payload = {
      app: "Intelligent Rainfall",
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      activeScenario,
      savedProjects,
      rainfallRecords,
      note: "Rainfall source labels are user-supplied and have not been independently verified by this application.",
    };
    downloadFile("intelligent-rainfall-workspace.json", JSON.stringify(payload, null, 2), "application/json");
    notify("Workspace JSON downloaded.");
  }

  function exportCalculationCsv() {
    const rows: (string | number)[][] = [
      ["metric", "value", "unit", "basis"],
      ["project", activeScenario.name, "", "User-named scenario"],
      ["district", activeScenario.district, "", "Selected location; not a rainfall source"],
      ["rainfall", getRainfallTotal(activeScenario), "mm", activeScenario.rainfallPeriod === "annual" ? "Annual total" : "Selected period / event"],
      ["rainfall origin", activeScenario.rainfallOrigin, "", activeScenario.rainfallSource || "No source label supplied"],
      ["roof area", activeScenario.roofAreaM2, "m²", "Input"],
      ["runoff coefficient", activeScenario.runoffCoefficient, "ratio", "Engineering starting assumption / user override"],
      ["collection losses", activeScenario.collectionLossPercent, "%", "Single post-roof loss factor"],
      ["theoretical harvest", result.theoreticalLitres, "L", "Rainfall × area × runoff coefficient"],
      ["estimated usable harvest", result.usableLitres, "L", "Theoretical harvest × (1 − losses)"],
      ["daily demand", result.dailyDemandLitres, "L/day", "Members × per-person demand + additional demand"],
      ["annual demand", result.annualDemandLitres, "L/year", "Daily demand × 365"],
      ["annual coverage", result.annualCoveragePercent ?? "", "%", result.isAnnual ? "Annual volume ratio; not daily reliability" : "Not applicable to a single period/event"],
      ["tank capacity", activeScenario.tankCapacityLitres, "L", "User-entered"],
      ["monthly water-balance simulation", monthlySimulation ? "available" : "not available", "", monthlySimulation ? "Uses user-entered monthly rainfall" : "No 12-month rainfall distribution provided"],
    ];
    const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\r\n");
    downloadFile("intelligent-rainfall-analysis.csv", csv, "text/csv;charset=utf-8");
    notify("Calculation CSV downloaded.");
  }

  function exportRainfallTemplate() {
    downloadFile("rainfall-data-template.csv", "district,period,rainfall_mm,source,category\r\n", "text/csv;charset=utf-8");
  }

  const titleForReport = activeScenario.name.trim() || "Rainwater analysis";
  const selectedRecords = useMemo(() => {
    const search = recordSearch.trim().toLowerCase();
    return rainfallRecords
      .filter((record) => record.district === explorerDistrict)
      .filter((record) => explorerCategory === "all" || record.category === explorerCategory)
      .filter((record) => !search || record.district.toLowerCase().includes(search) || record.period.toLowerCase().includes(search) || record.source.toLowerCase().includes(search))
      .sort((a, b) => a.period.localeCompare(b.period));
  }, [rainfallRecords, explorerDistrict, explorerCategory, recordSearch]);
  const comparisonPeriods = useMemo(() => [...new Set(rainfallRecords
    .filter((record) => record.category === comparisonCategory)
    .map((record) => record.period))].sort((a, b) => b.localeCompare(a)), [rainfallRecords, comparisonCategory]);
  const activeComparisonPeriod = comparisonPeriods.includes(comparisonPeriod) ? comparisonPeriod : comparisonPeriods[0] ?? "";
  const districtComparisons = useMemo(() => {
    if (!activeComparisonPeriod) return [];
    const found = new Map<string, RainfallRecord>();
    rainfallRecords
      .filter((record) => record.period === activeComparisonPeriod && record.category === comparisonCategory)
      .forEach((record) => {
        if (!found.has(record.district)) found.set(record.district, record);
      });
    return [...found.values()].sort((a, b) => b.rainfallMm - a.rainfallMm);
  }, [rainfallRecords, activeComparisonPeriod, comparisonCategory]);

  const recommendations = useMemo(() => {
    const messages: { title: string; body: string; icon: IconName; tone?: "caution" | "positive" }[] = [];
    if (!hasRainfallInput) {
      messages.push({ title: "Start with a rainfall value", body: "Enter a measured, sourced, or clearly illustrative rainfall amount. The district selector alone does not supply rainfall data.", icon: "cloud" });
    } else if (inputErrors.length === 0) {
      if (activeScenario.rainfallPeriod === "annual" && !monthlySimulation) {
        messages.push({ title: "Annual totals do not show dry spells", body: "Add a complete, sourced 12-month rainfall pattern to run the tank balance. Until then, the storage view uses a labelled single-inflow stress test, not a seasonal overflow forecast.", icon: "alert", tone: "caution" });
      }
      if (monthlySimulation && monthlySimulation.totalShortage > 0) {
        messages.push({ title: "The entered monthly pattern shows a shortfall", body: `${formatLitres(monthlySimulation.totalShortage)} of demand is not covered in this 12-month model. Review the demand, tank size, or rainfall inputs; this is only as reliable as the supplied series.`, icon: "target", tone: "caution" });
      }
      if (monthlySimulation && monthlySimulation.totalOverflow > 0) {
        messages.push({ title: "The entered monthly pattern shows overflow", body: `${formatLitres(monthlySimulation.totalOverflow)} spills in the month-by-month model. A larger tank may retain more, but the result depends on your monthly data and water-balance assumptions.`, icon: "drop" });
      }
      if (!monthlySimulation && result.usableLitres > activeScenario.tankCapacityLitres) {
        messages.push({ title: "Check the tank against the selected inflow", body: `The ${formatLitres(result.usableLitres)} period estimate is larger than the selected ${formatLitres(activeScenario.tankCapacityLitres)} tank. This comparison is not an estimate of annual overflow without rainfall timing.`, icon: "tank", tone: "caution" });
      }
      if (activeScenario.collectionLossPercent === 0) {
        messages.push({ title: "Confirm system losses", body: "The current calculation assumes no post-roof collection loss. Gutters, first-flush diversion, leaks, and installation can lower usable yield; enter one overall loss factor if you want to model them.", icon: "shield" });
      }
      messages.push({ title: "Treat water quality separately", body: "This volume estimate does not test water quality. Plan suitable filtration and treatment, and test water before any drinking use.", icon: "shield", tone: "positive" });
    }
    return messages;
  }, [activeScenario, hasRainfallInput, inputErrors.length, monthlySimulation, result.usableLitres]);

  const renderOverview = () => {
    const monthlyItems = monthlyDataComplete
      ? MONTH_NAMES.map((month, index) => ({ label: month, value: activeScenario.monthlyRainfallMm?.[index] ?? 0 }))
      : [];
    return (
      <>
        <section className="overview-hero">
          <div className="hero-copy">
            <div className="hero-eyebrow"><span className="hero-eyebrow-dot" /> RAINWATER PLANNING · BANGLADESH</div>
            <h1>Make rainfall work<br /><span>for every roof.</span></h1>
            <p>Estimate harvest potential, plan storage, and understand demand — using rainfall data you can trace back to its source.</p>
            <div className="hero-actions">
              <button className="button button-primary" onClick={() => goTo("calculator")}>Start a calculation <Icon name="arrow" size={16} /></button>
              <button className="button button-hero-secondary" onClick={() => goTo("explorer")}>Explore rainfall data <Icon name="chevron" size={16} /></button>
            </div>
            <div className="hero-trust"><Icon name="shield" size={15} /> Real NASA POWER rainfall, fetched automatically — sourced and labelled, never invented.</div>
          </div>
          <div className="hero-visual" aria-hidden="true">
            <div className="visual-caption"><span>PLAN WITH PROVENANCE</span><span className="caption-dot" /></div>
            <svg className="rain-illustration" viewBox="0 0 430 290" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M58 123 202 50l144 73v105H58V123Z" fill="#E7F4EC" />
              <path d="m47 124 155-80 155 80-12 20-143-73-143 73-12-20Z" fill="#BDE5CA" />
              <path d="M92 129v83m74-120v120m72-120v120m70-83v83" stroke="#A4D7B7" strokeWidth="2" />
              <path d="M85 150h227M85 180h227" stroke="#D0E9D8" strokeWidth="2" />
              <path d="M346 124v55c0 7 6 13 13 13s13-6 13-13v-22" stroke="#277857" strokeWidth="8" strokeLinecap="round" />
              <path d="M359 192v12" stroke="#277857" strokeWidth="8" strokeLinecap="round" />
              <rect x="288" y="202" width="104" height="62" rx="13" fill="#17523C" />
              <path d="M298 222h84M306 207v49m66-49v49" stroke="#2D7555" strokeWidth="3" />
              <path d="M310 236c10-8 24-8 34 0 10-8 24-8 34 0" stroke="#83D6A4" strokeWidth="3" strokeLinecap="round" />
              <path d="M310 248c10-8 24-8 34 0 10-8 24-8 34 0" stroke="#83D6A4" strokeWidth="3" strokeLinecap="round" opacity=".58" />
              <path d="M114 42c0 6-5 11-11 11S92 48 92 42s11-19 11-19 11 13 11 19Zm60 7c0 5-4 9-9 9s-9-4-9-9 9-16 9-16 9 11 9 16Zm100 0c0 5-4 9-9 9s-9-4-9-9 9-16 9-16 9 11 9 16Z" fill="#55B983" opacity=".78" />
              <circle cx="70" cy="250" r="3" fill="#55B983" /><circle cx="124" cy="263" r="2" fill="#55B983" /><circle cx="230" cy="253" r="2.5" fill="#55B983" /><circle cx="263" cy="231" r="2" fill="#55B983" />
              <path d="M60 229h17m-8.5-8.5v17m135 20h18m-9-9v18" stroke="#86CDA1" strokeWidth="2" strokeLinecap="round" />
              <rect x="24" y="76" width="104" height="42" rx="11" fill="white" stroke="#E2EEE5" />
              <circle cx="43" cy="97" r="7" fill="#E6F5EB" /><path d="M43 92s-4 5-4 7a4 4 0 0 0 8 0c0-2-4-7-4-7Z" fill="#42A874" />
              <path d="M58 94h47m-47 8h30" stroke="#B6CDBF" strokeWidth="3" strokeLinecap="round" />
            </svg>
            <div className="visual-footer"><span><strong>01</strong> Calculate</span><span className="visual-footer-line" /><span><strong>02</strong> Plan</span><span className="visual-footer-line" /><span><strong>03</strong> Conserve</span></div>
          </div>
        </section>

        <div className="overview-status-row">
          <div className={`dataset-status${climateStatus === "ready" ? " status-live" : hasRainfallInput ? " status-entered" : ""}`}>
            <span className="status-pulse" />
            <div>
              <strong>
                {climateStatus === "loading" ? `Fetching ${explorerDistrict} rainfall from NASA POWER…`
                  : climateStatus === "error" ? "Live rainfall unavailable — manual entry still works"
                  : climate && dataMode === "auto" ? `Live rainfall loaded · ${climate.district}, ${selectedClimateYear}`
                  : hasRainfallInput ? "Scenario rainfall ready" : "Waiting for rainfall data"}
              </strong>
              <small>
                {climateStatus === "error" ? climateError
                  : climate ? `${climate.provenance.product} · ${climate.provenance.modelSources.join(", ") || "MERRA-2"} · free, no API key · ${selectedAnnualRainfall !== null ? `${formatNumber(selectedAnnualRainfall, 0)} mm in ${selectedClimateYear}` : "incomplete year in source data"}`
                  : "Rainfall is fetched automatically from NASA POWER when a district is selected."}
              </small>
            </div>
          </div>
          <div className="overview-status-actions">
            <button className="text-button" onClick={() => goTo("explorer")}>{climate ? "Change district or year" : "Open rainfall explorer"} <Icon name="arrow" size={14} /></button>
            <button className="text-button" onClick={() => goTo("science")}>How data is handled <Icon name="arrow" size={14} /></button>
          </div>
        </div>

        <div className="metric-grid">
          <MetricCard icon="drop" label={result.isAnnual ? "Estimated usable harvest" : "Estimated period yield"} value={calculationReady ? formatNumber(result.usableLitres) : "—"} unit={calculationReady ? (result.isAnnual ? "litres / year" : "litres / period") : "Add rainfall to calculate"} tone="green" foot={hasRainfallInput ? `${formatNumber(result.theoreticalLitres)} L before collection losses` : "No value has been assumed"} />
          <MetricCard icon="target" label="Demand coverage" value={calculationReady && result.annualCoveragePercent !== null ? `${formatNumber(result.annualCoveragePercent, 1)}%` : "—"} unit={calculationReady && result.isAnnual ? "annual volume ratio" : "Annual rainfall needed"} tone="aqua" foot={result.annualCoveragePercent !== null ? "Annual ratio is not daily availability" : "A selected period is not year-round supply"} />
          <MetricCard icon="cloud" label="Rainfall input" value={hasRainfallInput ? formatNumber(getRainfallTotal(activeScenario), 1) : "—"} unit={hasRainfallInput ? (activeScenario.rainfallPeriod === "annual" ? "mm / year" : "mm / selected period") : "Not provided"} tone="blue" foot={hasRainfallInput ? activeScenario.district : "District selection alone gives no data"} />
          <MetricCard icon="tank" label="Demand buffer target" value={calculationReady ? formatNumber(result.dailyDemandLitres * activeScenario.targetBufferDays) : "—"} unit={calculationReady ? `litres · ${formatNumber(activeScenario.targetBufferDays)}-day target` : "Based on your demand inputs"} tone="sand" foot="A planning reference, not an optimized design" />
        </div>

        <div className="dashboard-grid">
          <section className="panel chart-panel">
            <PanelTitle title="Monthly rainfall profile" subtitle={monthlyDataComplete ? "Complete user-entered series · mm" : activeScenario.monthlyRainfallMm ? "Incomplete distribution · fill all 12 months" : "Your 12-month pattern, if available"} action={<button className="mini-action" onClick={() => { goTo("calculator"); updateScenario({ rainfallPeriod: "annual" }); setMonthlyEditorOpen(true); }}>{monthlyDataComplete ? "Edit values" : activeScenario.monthlyRainfallMm ? "Complete values" : "Add monthly data"}<Icon name="arrow" size={13} /></button>} />
            {monthlyDataComplete ? <BarChart items={monthlyItems} unit="mm" emptyTitle="No monthly values" emptyDescription="Enter a monthly distribution to see the profile." /> : <EmptyState icon="cloud" title={activeScenario.monthlyRainfallMm ? "Monthly series is incomplete" : "No monthly series loaded"} description={activeScenario.monthlyRainfallMm ? "Missing months are not treated as zero. Complete all 12 values before using the monthly chart or storage balance." : "An annual total cannot tell us when rain falls. Add 12 monthly values to make this chart and storage simulation meaningful."} action={<button className="button button-outline button-small" onClick={() => { goTo("calculator"); updateScenario({ rainfallPeriod: "annual" }); setMonthlyEditorOpen(true); }}>{activeScenario.monthlyRainfallMm ? "Complete monthly values" : "Enter monthly values"} <Icon name="arrow" size={14} /></button>} />}
          </section>
          <section className="panel chart-panel demand-panel">
            <PanelTitle title="Harvest against demand" subtitle={result.isAnnual ? "Annual volumes · estimate, not daily reliability" : "Enter an annual rainfall value to compare annual volumes"} />
            {calculationReady && result.annualCoveragePercent !== null ? <>
              <div className="demand-compare">
                <div className="compare-label-row"><span>Usable harvest</span><strong>{formatLitres(result.usableLitres)}</strong></div>
                <div className="compare-track"><span className="compare-fill harvest-fill" style={{ width: `${Math.min(100, result.annualCoveragePercent)}%` }} /></div>
                <div className="compare-label-row compare-demand"><span>Annual household demand</span><strong>{formatLitres(result.annualDemandLitres)}</strong></div>
                <div className="compare-track"><span className="compare-fill demand-fill" style={{ width: `${Math.min(100, result.annualDemandLitres > 0 ? result.usableLitres / result.annualDemandLitres * 100 : 0)}%` }} /></div>
                <div className="demand-stat"><strong>{formatNumber(result.averageDailyEquivalentLitres ?? 0)} L</strong><span>annual-average daily equivalent — not a daily supply forecast</span></div>
              </div>
              <MethodNote>Coverage is the annual usable-volume ratio. Rainfall timing, tank limits, and dry periods can reduce actual coverage.</MethodNote>
            </> : <EmptyState icon="target" title="A comparison needs annual rainfall" description="Enter an annual rainfall total to compare yearly volumes. A single period/event is not a year of supply." />}
          </section>
        </div>

        <div className="bottom-grid">
          <section className="panel recommendations-panel">
            <PanelTitle title="Planning notes" subtitle="Recommendations are based on your current inputs." />
            <RecommendationList recommendations={recommendations.slice(0, 3)} />
          </section>
          <section className="panel saved-panel">
            <PanelTitle title="Your saved analyses" subtitle="Stored privately in this browser." action={<button className="mini-action" onClick={() => goTo("reports")}>View all<Icon name="arrow" size={13} /></button>} />
            {savedProjects.length ? <div className="saved-list">{savedProjects.slice(0, 3).map((project) => <button className="saved-row" key={project.id} onClick={() => loadScenario(project)}><span className="saved-icon"><Icon name="file" size={16} /></span><span className="saved-info"><strong>{project.name}</strong><small>{project.district} · {scenarioHasRainfallValue(project) ? `${formatNumber(getRainfallTotal(project))} mm` : "rainfall not added"}</small></span><Icon name="chevron" size={16} /></button>)}</div> : <div className="saved-empty"><span className="saved-icon"><Icon name="folder" size={16} /></span><span><strong>No saved analyses yet</strong><small>Save a calculation to return to it later.</small></span></div>}
          </section>
        </div>
      </>
    );
  };

  const renderCalculator = () => {
    const convertedArea = areaUnit === "m2" ? activeScenario.roofAreaM2 : activeScenario.roofAreaM2 / 0.09290304;
    const roofOptions: { value: RoofType; label: string; coefficient: number }[] = [
      { value: "concrete", label: "Concrete / flat slab", coefficient: ROOF_COEFFICIENTS.concrete },
      { value: "metal", label: "Metal sheet", coefficient: ROOF_COEFFICIENTS.metal },
      { value: "tiles", label: "Tiles", coefficient: ROOF_COEFFICIENTS.tiles },
      { value: "other", label: "Other / unknown", coefficient: ROOF_COEFFICIENTS.other },
    ];
    return (
      <>
        <SectionHeader eyebrow="CORE TOOL" title="Harvest calculator" description="Turn a rainfall depth and roof area into a clear, auditable volume estimate." action={<button className="button button-outline" onClick={loadWorkedExample}><Icon name="refresh" size={16} /> Load worked example</button>} />
        {activeScenario.rainfallOrigin === "illustrative" ? <div className="callout callout-illustrative"><Icon name="info" size={18} /><div><strong>Illustrative scenario — not measured rainfall for {activeScenario.district}.</strong><span>This worked example demonstrates the formula only. Change the inputs or clear the source label before describing a local result.</span></div></div> : null}
        <div className={`data-source-bar source-${activeScenario.rainfallOrigin}`}>
          <span className="source-bar-icon"><Icon name={activeScenario.rainfallOrigin === "api" ? "cloud" : activeScenario.rainfallOrigin === "illustrative" ? "info" : "edit"} size={17} /></span>
          <div className="source-bar-copy">
            <strong>{activeScenario.rainfallOrigin === "api" ? "Using automatically fetched rainfall" : activeScenario.rainfallOrigin === "illustrative" ? "Using an illustrative scenario" : activeScenario.rainfallOrigin === "imported" ? "Using a record you imported" : "Using your own rainfall entry"}</strong>
            <span>{activeScenario.rainfallSource || "No rainfall source label yet."}</span>
          </div>
          <div className="source-bar-actions">
            <div className="segmented-control" role="group" aria-label="Rainfall data mode">
              <button className={dataMode === "auto" ? "selected" : ""} onClick={() => { if (climate) applyClimateToScenario(climate, selectedClimateYear); else { setDataMode("auto"); goTo("explorer"); } }}>Auto · NASA</button>
              <button className={dataMode === "manual" ? "selected" : ""} onClick={() => { setDataMode("manual"); notify("Manual mode: automatic rainfall will no longer overwrite your entries."); }}>Manual</button>
            </div>
            {climate ? <select className="year-select" aria-label="Rainfall year" value={selectedClimateYear} onChange={(event) => { const year = Number(event.target.value); setAnalysisYear(year); if (dataMode === "auto") applyClimateToScenario(climate, year); }}>{climate.annual.filter((entry) => entry.mm !== null).map((entry) => <option key={entry.year} value={entry.year}>{entry.year} · {formatNumber(entry.mm ?? 0, 0)} mm</option>)}</select> : null}
          </div>
        </div>
        <div className="calculator-layout">
          <div className="calculator-form-column">
            <section className="panel form-panel">
              <div className="form-section-head"><span className="form-step">01</span><div><h2>Location & rainfall</h2><p>The district is a label, not a rainfall source.</p></div><span className="form-head-icon"><Icon name="map" size={18} /></span></div>
              <div className="field-grid field-grid-two">
                <label className="field" htmlFor="calc-district"><span className="field-label">Bangladesh district</span><span className="field-input-wrap"><select id="calc-district" value={activeScenario.district} onChange={(event) => updateScenario({ district: event.target.value })}>{DISTRICT_GROUPS.map((group) => <optgroup key={group.division} label={group.division}>{group.districts.map((district) => <option key={district} value={district}>{district}</option>)}</optgroup>)}</select><span className="select-chevron"><Icon name="chevron" size={14} /></span></span><span className="field-hint">Select a place to label this scenario. No district dataset is bundled.</span></label>
                <label className="field" htmlFor="calc-rain-origin"><span className="field-label">Rainfall value type</span><span className="field-input-wrap"><select id="calc-rain-origin" value={activeScenario.rainfallOrigin === "illustrative" ? "illustrative" : "user"} onChange={(event) => { const origin = event.target.value as "user" | "illustrative"; updateScenario({ rainfallOrigin: origin, rainfallSource: origin === "illustrative" ? "Illustrative scenario — not a local observation" : "User-entered value" }); }}><option value="user">User-entered / custom</option><option value="illustrative">Illustrative scenario</option></select><span className="select-chevron"><Icon name="chevron" size={14} /></span></span><span className="field-hint">Imported records retain their uploaded source label.</span></label>
              </div>
              <div className="period-control-row">
                <div><span className="field-label">Rainfall period</span><span className="field-hint">Choose the meaning of this rainfall depth.</span></div>
                <div className="segmented-control" role="group" aria-label="Rainfall period"><button className={activeScenario.rainfallPeriod === "annual" ? "selected" : ""} onClick={() => { updateScenario({ rainfallPeriod: "annual" }); }}>Annual total</button><button className={activeScenario.rainfallPeriod === "event" ? "selected" : ""} onClick={() => { updateScenario({ rainfallPeriod: "event", monthlyRainfallMm: null }); setMonthlyEditorOpen(false); }}>Single event / period</button></div>
              </div>
              <div className="field-grid field-grid-two rainfall-entry-row">
                <NumberField id="rainfall-mm" label={activeScenario.rainfallPeriod === "annual" ? "Annual rainfall" : "Selected-period rainfall"} value={getRainfallTotal(activeScenario)} unit="mm" step={0.1} max={10000} hint={activeScenario.rainfallPeriod === "annual" ? "Enter a documented annual total." : "Enter a measured or illustrative depth for one selected period/event."} onChange={changeRainfall} />
                <label className="field" htmlFor="rainfall-source"><span className="field-label">Source / note <span className="optional-label">recommended</span></span><span className="field-input-wrap"><input id="rainfall-source" type="text" maxLength={240} placeholder={activeScenario.rainfallOrigin === "illustrative" ? "Illustrative — not a local measurement" : "e.g. rain gauge, station, year"} value={activeScenario.rainfallSource} onChange={(event) => updateScenario({ rainfallSource: event.target.value, rainfallOrigin: activeScenario.rainfallOrigin })} /></span><span className="field-hint">A text label is not source verification.</span></label>
              </div>
              {activeScenario.rainfallOrigin === "imported" ? <div className="source-inline"><OriginBadge origin="imported" /><span>{activeScenario.rainfallSource || "Imported source metadata"} · not independently verified</span></div> : <div className="source-inline"><OriginBadge origin={activeScenario.rainfallOrigin} /><span>{activeScenario.rainfallOrigin === "illustrative" ? "For explanation only; not a location measurement." : "Rainfall values come from your entry, not a connected weather feed."}</span></div>}
              {activeScenario.rainfallPeriod === "annual" ? <div className="monthly-entry-block"><button className="inline-toggle" onClick={toggleMonthlyEditor}><span className={`toggle-mark${monthlyEditorOpen ? " toggle-open" : ""}`}>{monthlyEditorOpen ? "−" : "+"}</span>{monthlyEditorOpen ? "Hide monthly distribution" : monthlyDataComplete ? "Edit monthly distribution" : "Add monthly distribution"}<span className="inline-toggle-note">optional · needed for seasonal tank balance</span></button>{monthlyEditorOpen ? <><p className="monthly-helper">Enter rainfall in millimetres for all 12 months. Blank months stay missing — they are never assumed to have zero rain. A complete series updates the annual total. These are user-provided values, not verified observations.</p><div className="month-input-grid">{MONTH_NAMES.map((month, index) => <label className="month-input" key={month}><span>{month}</span><input type="number" min="0" max="10000" step="0.1" value={activeScenario.monthlyRainfallMm?.[index] ?? ""} aria-label={`${month} rainfall in millimetres`} onChange={(event) => changeMonthlyRainfall(index, event.target.value === "" ? null : Number(event.target.value))} /></label>)}</div><div className="month-total-row"><span>{monthlyDataComplete ? "Annual total from complete monthly values" : "Complete all 12 months to run monthly balance"}</span><strong>{monthlyDataComplete ? `${formatNumber(getRainfallTotal(activeScenario), 1)} mm` : "Incomplete"}</strong></div>{activeScenario.monthlyRainfallMm ? <button className="inline-toggle monthly-clear" onClick={() => updateScenario({ monthlyRainfallMm: null })}>Clear monthly distribution</button> : null}</> : null}</div> : null}
            </section>

            <section className="panel form-panel">
              <div className="form-section-head"><span className="form-step">02</span><div><h2>Roof & collection system</h2><p>Material coefficients are adjustable starting assumptions.</p></div><span className="form-head-icon"><Icon name="tank" size={18} /></span></div>
              <div className="field-grid field-grid-two">
                <div className="field"><span className="field-label">Catchment / roof area</span><span className="field-input-wrap"><input aria-label="Roof area" type="number" min="0" step="0.1" value={Number.isFinite(convertedArea) ? Number(convertedArea.toFixed(2)) : 0} onChange={(event) => { const value = event.target.value === "" ? 0 : Number(event.target.value); updateScenario({ roofAreaM2: areaUnit === "m2" ? value : value * 0.09290304 }); }} /><span className="field-unit field-unit-select"><select aria-label="Area unit" value={areaUnit} onChange={(event) => setAreaUnit(event.target.value as "m2" | "ft2")}><option value="m2">m²</option><option value="ft2">ft²</option></select></span></span><span className="field-hint">{areaUnit === "ft2" ? `${formatNumber(activeScenario.roofAreaM2, 2)} m² converted for calculations.` : `${formatNumber(activeScenario.roofAreaM2 / 0.09290304, 0)} ft² equivalent.`}</span></div>
                <label className="field" htmlFor="roof-type"><span className="field-label">Roof surface</span><span className="field-input-wrap"><select id="roof-type" value={activeScenario.roofType} onChange={(event) => { const type = event.target.value as RoofType; updateScenario({ roofType: type, runoffCoefficient: activeScenario.customCoefficient ? activeScenario.runoffCoefficient : ROOF_COEFFICIENTS[type] }); }}><option value="concrete">Concrete / flat slab</option><option value="metal">Metal sheet</option><option value="tiles">Tiles</option><option value="other">Other / unknown</option></select><span className="select-chevron"><Icon name="chevron" size={14} /></span></span><span className="field-hint">Starting estimates vary with roof condition and design.</span></label>
              </div>
              <div className="coefficient-row"><div className="coefficient-copy"><span className="field-label">Runoff coefficient</span><span className="field-hint">{activeScenario.customCoefficient ? "Custom value · must be between 0 and 1." : `Starting assumption for ${activeScenario.roofType}: ${ROOF_COEFFICIENTS[activeScenario.roofType].toFixed(2)}.`}</span></div><div className="coefficient-control"><label className="check-control"><input type="checkbox" checked={activeScenario.customCoefficient} onChange={(event) => updateScenario({ customCoefficient: event.target.checked, runoffCoefficient: event.target.checked ? activeScenario.runoffCoefficient : ROOF_COEFFICIENTS[activeScenario.roofType] })} /><span>Override</span></label><NumberField id="runoff-coefficient" label="Coefficient" value={activeScenario.runoffCoefficient} unit="ratio" step={0.01} min={0} max={1} onChange={(value) => updateScenario({ runoffCoefficient: value, customCoefficient: true })} disabled={!activeScenario.customCoefficient} /></div></div>
              <div className="loss-setting"><div className="loss-icon"><Icon name="shield" size={17} /></div><div className="loss-copy"><strong>Post-roof collection losses</strong><span>One combined factor for first flush, conveyance, and handling. Do not subtract the same losses elsewhere.</span></div><NumberField id="collection-loss" label="Loss" value={activeScenario.collectionLossPercent} unit="%" step={1} min={0} max={100} onChange={(value) => updateScenario({ collectionLossPercent: value })} /></div>
              <MethodNote>Illustrative runoff coefficients: concrete 0.80 · metal 0.90 · tiles 0.75 · other 0.70. Actual yield depends on roof slope, cleanliness, first-flush diversion, leakage, and installation.</MethodNote>
            </section>

            <section className="panel form-panel">
              <div className="form-section-head"><span className="form-step">03</span><div><h2>Demand & household</h2><p>Use your own demand estimate; defaults are planning assumptions.</p></div><span className="form-head-icon"><Icon name="target" size={18} /></span></div>
              <div className="field-grid field-grid-three">
                <NumberField id="household-members" label="People" value={activeScenario.householdMembers} unit="people" step={1} min={0} max={1000} hint="Household or user group." onChange={(value) => updateScenario({ householdMembers: value })} />
                <NumberField id="demand-per-person" label="Daily use per person" value={activeScenario.demandPerPerson} unit="L / person / day" step={1} min={0} hint="Editable planning assumption." onChange={(value) => updateScenario({ demandPerPerson: value })} />
                <NumberField id="additional-demand" label="Additional daily use" value={activeScenario.additionalDailyDemand} unit="L / day" step={1} min={0} hint="For gardening or other non-drinking uses." onChange={(value) => updateScenario({ additionalDailyDemand: value })} />
              </div>
              <div className="demand-preview"><span className="demand-preview-icon"><Icon name="drop" size={16} /></span><span>Calculated daily demand</span><strong>{formatLitres(result.dailyDemandLitres)}<small> / day</small></strong></div>
            </section>
            {inputErrors.length > 0 ? <div className="validation-box"><Icon name="alert" size={17} /><div><strong>Check these inputs</strong>{inputErrors.map((error) => <span key={error}>{error}</span>)}</div></div> : null}
          </div>

          <aside className="calculator-result-column">
            <section className="result-card">
              <div className="result-card-head"><span className="result-overline">YOUR ESTIMATE</span><OriginBadge origin={activeScenario.rainfallOrigin} /></div>
              <h2>{calculationReady ? formatNumber(result.usableLitres) : "—"}<small> L</small></h2>
              <p>{activeScenario.rainfallPeriod === "annual" ? "estimated usable harvest per year" : "estimated usable harvest for this event"}</p>
              {!hasRainfallInput ? <div className="result-prompt"><Icon name="cloud" size={16} /> Enter rainfall to calculate an estimate.</div> : null}
              {hasRainfallInput ? <div className="result-breakdown"><div><span>Theoretical roof yield</span><strong>{formatLitres(result.theoreticalLitres)}</strong></div><div><span>Estimated collection losses</span><strong>− {formatLitres(result.collectionLossLitres)}</strong></div><div className="breakdown-total"><span>Usable estimate</span><strong>{formatLitres(result.usableLitres)}</strong></div></div> : null}
              <div className="result-equation"><span>CALCULATION</span><code>{formatNumber(activeScenario.roofAreaM2, 2)} m² × {formatNumber(getRainfallTotal(activeScenario), 1)} mm × {formatNumber(activeScenario.runoffCoefficient, 2)}{activeScenario.collectionLossPercent ? ` × ${formatNumber(1 - activeScenario.collectionLossPercent / 100, 2)}` : ""}</code><small>1 mm × 1 m² = 1 litre</small></div>
              {calculationReady ? <div className="result-secondary-metrics"><div><span>Annual demand</span><strong>{result.isAnnual ? formatLitres(result.annualDemandLitres) : "Not an annual comparison"}</strong></div><div><span>Demand coverage</span><strong>{result.annualCoveragePercent !== null ? `${formatNumber(result.annualCoveragePercent, 1)}% annual ratio` : "Annual input needed"}</strong></div><div><span>Daily equivalent</span><strong>{result.averageDailyEquivalentLitres !== null ? `${formatNumber(result.averageDailyEquivalentLitres)} L/day avg.` : "Period / event only"}</strong></div></div> : null}
              <button className="button button-primary result-save" onClick={saveCurrentScenario}><Icon name="save" size={16} />{isCurrentSaved ? "Update saved analysis" : "Save this analysis"}</button>
              <p className="result-storage-note"><Icon name="shield" size={13} />Saved only in this browser. Not synced to a cloud account.</p>
            </section>
            {activeScenario.rainfallPeriod === "event" && hasRainfallInput ? <div className="example-calculation"><span className="example-icon"><Icon name="info" size={15} /></span><div><strong>Event estimate, not an annual forecast</strong><p>At {formatNumber(activeScenario.rainfallMm, 1)} mm over {formatNumber(activeScenario.roofAreaM2, 1)} m², the roof receives this period&apos;s rainfall volume before roof and system losses.</p></div></div> : null}
            {activeScenario.rainfallOrigin === "illustrative" ? <div className="example-calculation"><span className="example-icon"><Icon name="alert" size={15} /></span><div><strong>Not measured for {activeScenario.district}</strong><p>District selection is for organization only. No rainfall observation was loaded for this location.</p></div></div> : null}
            <div className="recommendation-mini"><h3><Icon name="target" size={16} />What to consider</h3><RecommendationList recommendations={recommendations.slice(0, 3)} compact /></div>
          </aside>
        </div>
      </>
    );
  };

  const renderStorage = () => {
    const baseStorage = activeScenario.tankCapacityLitres * clamp(activeScenario.startingStoragePercent, 0, 100) / 100;
    const preEventDemand = result.dailyDemandLitres * Math.max(0, activeScenario.dryGapDays);
    const remainingBeforeInflow = Math.max(0, baseStorage - preEventDemand);
    const eventShortage = Math.max(0, preEventDemand - baseStorage);
    const singleInflow = result.usableLitres;
    const storageMode = monthlySimulation ? "monthly" : activeScenario.rainfallPeriod === "event" ? "event" : "annual-lump";
    const simplifiedAvailable = storageMode === "event" ? remainingBeforeInflow + singleInflow : baseStorage + singleInflow;
    const simpleStorageAfter = Math.min(Math.max(0, activeScenario.tankCapacityLitres), Math.max(0, simplifiedAvailable));
    const simpleOverflow = Math.max(0, simplifiedAvailable - Math.max(0, activeScenario.tankCapacityLitres));
    const bufferTarget = result.dailyDemandLitres * Math.max(0, activeScenario.targetBufferDays);
    const tankFill = monthlySimulation ? monthlySimulation.endingStorage : simpleStorageAfter;
    const fillPercent = activeScenario.tankCapacityLitres > 0 ? clamp(tankFill / activeScenario.tankCapacityLitres * 100, 0, 100) : 0;
    const daysFromTank = result.dailyDemandLitres > 0 ? tankFill / result.dailyDemandLitres : 0;
    return (
      <>
        <SectionHeader eyebrow="CAPACITY & WATER BALANCE" title="Storage planner" description="Explore what a tank can hold, what demand it can serve, and where a simplified model stops being reliable." action={<button className="button button-primary" onClick={() => goTo("calculator")}><Icon name="edit" size={15} /> Edit inputs</button>} />
        {storageMode === "monthly" ? <div className="callout callout-positive"><Icon name="check" size={18} /><div><strong>12-month water balance is active.</strong><span>Monthly inflows come from the values entered in the calculator. The results are conditional on that user-provided rainfall pattern.</span></div></div> : <div className="callout callout-warning"><Icon name="alert" size={18} /><div><strong>{storageMode === "event" ? "Single-period inflow balance" : "Annual-only scenario — no seasonal simulation"}</strong><span>{storageMode === "event" ? "The single-period view uses one inflow after the user-selected demand gap against the starting tank level; it is not a storm-timing simulation." : "The annual total is shown as one hypothetical inflow for a tank-capacity stress test. Overflow and days of supply are not annual predictions."}</span></div></div>}
        <div className="storage-top-grid">
          <section className="panel storage-input-panel">
            <PanelTitle title="Tank assumptions" subtitle="Adjust the capacity and initial conditions for this scenario." />
            <div className="field-grid field-grid-two">
              <NumberField id="tank-capacity" label="Tank capacity" value={activeScenario.tankCapacityLitres} unit="litres" step={100} min={0} hint="Usable nominal storage volume." onChange={(value) => updateScenario({ tankCapacityLitres: value })} />
              <NumberField id="tank-start" label="Starting tank level" value={activeScenario.startingStoragePercent} unit="% full" step={1} min={0} max={100} hint="Opening volume for the model." onChange={(value) => updateScenario({ startingStoragePercent: value })} />
              {storageMode === "event" ? <NumberField id="dry-gap" label="Demand before selected inflow" value={activeScenario.dryGapDays} unit="days" step={1} min={0} hint="User-defined interval before this selected period/event." onChange={(value) => updateScenario({ dryGapDays: value })} /> : null}
              <NumberField id="buffer-days" label="Demand buffer target" value={activeScenario.targetBufferDays} unit="days" step={1} min={0} hint="A planning reference you choose, not an optimized tank size." onChange={(value) => updateScenario({ targetBufferDays: value })} />
            </div>
            <div className="tank-reference"><div><span>Demand-based planning reference</span><strong>{calculationReady ? formatLitres(bufferTarget) : "—"}</strong><small>{formatNumber(activeScenario.targetBufferDays)} days × {formatLitres(result.dailyDemandLitres)} daily demand</small></div><div className="reference-difference"><span>Selected tank</span><strong>{formatLitres(activeScenario.tankCapacityLitres)}</strong><small>{calculationReady ? (activeScenario.tankCapacityLitres >= bufferTarget ? "At or above your target" : "Below your chosen target") : "Enter rainfall and demand"}</small></div></div>
          </section>
          <section className="panel tank-visual-panel">
            <PanelTitle title="Tank fill snapshot" subtitle={storageMode === "monthly" ? "After month 12 in the entered annual cycle" : storageMode === "event" ? "After one event and the selected pre-event demand" : "Single-inflow stress test · not annual overflow"} />
            <div className="tank-display-row"><div className="tank-vessel"><div className="tank-top-line" /><div className="tank-water" style={{ height: `${fillPercent}%` }} /><div className="tank-tick tick-one" /><div className="tank-tick tick-two" /><div className="tank-tick tick-three" /><span className="tank-fill-label">{formatNumber(fillPercent)}%</span></div><div className="tank-data"><strong>{calculationReady ? formatLitres(tankFill) : "—"}</strong><span>estimated stored volume</span><div className="tank-data-divider" /><strong>{calculationReady ? `${formatNumber(daysFromTank, 1)} days` : "—"}</strong><span>at the stated daily demand</span><small>{storageMode === "annual-lump" ? "Upper-bound snapshot if annual inflow were available at once." : "Not a water-quality or reliability assessment."}</small></div></div>
          </section>
        </div>
        {monthlySimulation ? <section className="panel balance-panel"><PanelTitle title="Monthly water balance" subtitle="Litres · opening storage + collected inflow − demand, capped by tank capacity. Shortage is never stored as negative water." /><div className="balance-summary"><BalanceStat label="Annual inflow" value={formatLitres(monthlySimulation.totalInflow)} /><BalanceStat label="Demand served" value={formatLitres(monthlySimulation.totalDelivered)} /><BalanceStat label="Demand shortfall" value={formatLitres(monthlySimulation.totalShortage)} tone={monthlySimulation.totalShortage > 0 ? "warning" : "good"} /><BalanceStat label="Overflow" value={formatLitres(monthlySimulation.totalOverflow)} tone={monthlySimulation.totalOverflow > 0 ? "warning" : "good"} /></div><div className="balance-chart-wrap"><BarChart items={monthlySimulation.months.map((month) => ({ label: month.month, value: month.endingStorage, detail: `${formatNumber(month.rainfallMm, 1)} mm rain` }))} unit="L in tank" emptyTitle="No monthly simulation" emptyDescription="Add monthly values in the calculator." /></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Month</th><th>Rainfall</th><th>Inflow</th><th>Demand</th><th>Delivered</th><th>Shortfall</th><th>Overflow</th><th>Ending tank</th></tr></thead><tbody>{monthlySimulation.months.map((month) => <tr key={month.month}><td>{month.month}</td><td>{formatNumber(month.rainfallMm, 1)} mm</td><td>{formatNumber(month.inflow)} L</td><td>{formatNumber(month.demand)} L</td><td>{formatNumber(month.delivered)} L</td><td>{formatNumber(month.shortage)} L</td><td>{formatNumber(month.overflow)} L</td><td>{formatNumber(month.endingStorage)} L</td></tr>)}</tbody></table></div><MethodNote>This transparent monthly model uses a representative non-leap year (365 days) and applies demand within each monthly step. It does not resolve day-by-day storm timing.</MethodNote></section> : <section className="panel balance-panel"><PanelTitle title={storageMode === "event" ? "Single-event balance" : "What this estimate can — and cannot — say"} subtitle={storageMode === "event" ? "One event does not predict performance through the year." : "Annual rainfall totals contain no information about the order or spacing of rain and demand."} /><div className="stress-test-grid"><StressCell label="Period inflow estimate" value={calculationReady ? formatLitres(singleInflow) : "—"} /><StressCell label={storageMode === "event" ? "Potential pre-event deficit" : "Hypothetical single-inflow overflow"} value={calculationReady ? formatLitres(storageMode === "event" ? eventShortage : simpleOverflow) : "—"} caution={storageMode === "annual-lump"} /><StressCell label="Water after the simplified step" value={calculationReady ? formatLitres(tankFill) : "—"} /><StressCell label="Monthly simulation" value="Not available" /></div><MethodNote>{storageMode === "event" ? `The event balance subtracts ${formatNumber(preEventDemand)} L of demand from the starting level before adding the event's estimated usable inflow. The output is a scenario, not a forecast.` : "No annual overflow or reliable days-of-supply estimate is inferred from an annual total. Add month-by-month rainfall values to activate the explicit 12-step balance."}</MethodNote></section>}
        <section className="recommendation-strip"><PanelTitle title="Storage planning notes" subtitle="Recommendations use your selected scenario and are not a construction specification." /><RecommendationList recommendations={recommendations} /></section>
      </>
    );
  };

  const renderExplorer = () => {
    const recordsForChart = selectedRecords.slice(-18);
    const districtCounts = new Map<string, number>();
    rainfallRecords.forEach((record) => districtCounts.set(record.district, (districtCounts.get(record.district) ?? 0) + 1));
    const matchesForComparison = districtComparisons.slice(0, 16);
    return (
      <>
        <SectionHeader eyebrow="AUTOMATIC DATA · NASA POWER" title="Bangladesh rainfall explorer" description="Rainfall is fetched automatically from NASA POWER for the selected district. No API key, no manual data entry." action={<div className="header-action-group"><button className="button button-outline" onClick={() => { setClimateCache({}); setClimate(null); notify("Re-fetching rainfall data from NASA POWER."); }} disabled={climateStatus === "loading"}><Icon name="refresh" size={15} />Refresh</button><button className="button button-outline" onClick={exportRainfallTemplate}><Icon name="download" size={15} />CSV template</button><button className="button button-primary" onClick={() => rainfallUploadRef.current?.click()}><Icon name="upload" size={15} />Import CSV</button><input ref={rainfallUploadRef} className="visually-hidden" type="file" accept=".csv,text/csv" onChange={(event) => void importRainfallCsv(event)} /></div>} />
        <div className={`live-data-bar live-${climateStatus}`}>
          <span className="live-status-icon">{climateStatus === "loading" ? <Icon name="spinner" size={17} className="spin" /> : climateStatus === "error" ? <Icon name="alert" size={17} /> : <Icon name="cloud" size={17} />}</span>
          <div className="live-status-copy">
            <strong>
              {climateStatus === "loading" ? `Fetching ${explorerDistrict} rainfall from NASA POWER…`
                : climateStatus === "error" ? "NASA POWER data could not be loaded"
                : climate ? `Live data loaded · ${climate.district}, ${climate.startYear}–${climate.endYear}` : "Waiting for data"}
            </strong>
            <span>
              {climateStatus === "error" ? `${climateError} Manual entry and CSV import still work.`
                : climate ? `${climate.provenance.product} · ${climate.provenance.modelSources.join(", ") || "MERRA-2"} · converted from ${climate.provenance.nativeUnits} to mm per month · ${climate.provenance.gridResolution}`
                : "Rainfall values are requested from the public NASA POWER service when a district is selected."}
            </span>
          </div>
          {climate && selectedClimateComplete ? <button className="button button-soft" onClick={() => { if (climate) applyClimateToScenario(climate, selectedClimateYear); goTo("calculator"); }}><Icon name="calculator" size={15} />Use {selectedClimateYear} data</button> : null}
        </div>
        {climate ? <>
          <div className="explorer-stat-grid">
            <MetricCard icon="cloud" label={`${selectedClimateYear} rainfall`} value={selectedAnnualRainfall !== null ? formatNumber(selectedAnnualRainfall, 1) : "—"} unit={selectedAnnualRainfall !== null ? "mm · NASA POWER" : "Incomplete in source data"} tone="blue" foot={`${climate.district} · ${climate.division} division`} />
            <MetricCard icon="drop" label="Wettest month" value={(() => { const best = (selectedClimateMonths ?? []).reduce<{ label: string; mm: number } | null>((top, mm, index) => mm !== null && (top === null || mm > top.mm) ? { label: MONTH_NAMES[index], mm } : top, null); return best ? `${best.label} · ${formatNumber(best.mm, 0)}` : "—"; })()} unit={selectedClimateComplete ? "mm in that month" : "From available months only"} tone="green" foot="Monsoon timing drives tank sizing" />
            <MetricCard icon="target" label={`${climate.startYear}–${climate.endYear} average`} value={(() => { const complete = climate.annual.filter((entry) => entry.mm !== null); return complete.length ? formatNumber(complete.reduce((sum, entry) => sum + (entry.mm ?? 0), 0) / complete.length, 0) : "—"; })()} unit="mm / year average" tone="aqua" foot={`From ${climate.annual.filter((entry) => entry.mm !== null).length} complete year${climate.annual.filter((entry) => entry.mm !== null).length === 1 ? "" : "s"} of source data`} />
          </div>
          <div className="explorer-controls panel">
            <label className="field" htmlFor="live-district"><span className="field-label">District (auto-fetches data)</span><span className="field-input-wrap"><select id="live-district" value={explorerDistrict} onChange={(event) => setExplorerDistrict(event.target.value)}>{DISTRICT_GROUPS.map((group) => <optgroup key={group.division} label={group.division}>{group.districts.map((district) => <option key={district}>{district}</option>)}</optgroup>)}</select><span className="select-chevron"><Icon name="chevron" size={14} /></span></span><span className="field-hint">Reference point {climate.point.latitude.toFixed(2)}°N, {climate.point.longitude.toFixed(2)}°E</span></label>
            <div className="field"><span className="field-label">Analysis year</span><div className="year-chips">{climate.annual.map((entry) => <button key={entry.year} className={`year-chip${entry.year === selectedClimateYear ? " year-chip-active" : ""}`} disabled={entry.mm === null} onClick={() => setAnalysisYear(entry.year)} title={entry.mm === null ? `Only ${entry.monthsAvailable} of 12 months available in the source data` : `${formatNumber(entry.mm, 1)} mm total`}>{entry.year}</button>)}</div><span className="field-hint">Years with incomplete source data are disabled, never zero-filled.</span></div>
            <label className="field search-field" htmlFor="record-search"><span className="field-label">Search your records</span><span className="field-input-wrap"><Icon name="search" size={16} /><input id="record-search" type="search" placeholder="e.g. 2024, station name" value={recordSearch} onChange={(event) => setRecordSearch(event.target.value)} /></span></label>
            <button className="button button-soft explorer-add" onClick={() => setRecordFormOpen((open) => !open)}><Icon name="plus" size={16} />Add own record</button>
          </div>
          <div className="explorer-main-grid">
            <section className="panel explorer-chart-panel">
              <PanelTitle title={`${climate.district} · monthly rainfall ${selectedClimateYear}`} subtitle="Real fetched values · millimetres per month" action={<span className="record-count-pill">{selectedClimateComplete ? "Complete year" : "Partial year"}</span>} />
              {selectedClimateComplete ? <BarChart items={MONTH_NAMES.map((month, index) => ({ label: month, value: selectedClimateMonths?.[index] ?? 0 }))} unit="mm" emptyTitle="No monthly data" emptyDescription="NASA POWER returned no monthly values." /> : <EmptyState icon="cloud" title={`No complete monthly series for ${selectedClimateYear}`} description="NASA POWER marks unavailable months with a fill value. This app treats them as missing rather than zero, so no chart is drawn. Select another year." />}
              <div className="table-scroll monthly-table"><table className="data-table"><thead><tr><th>Month</th>{MONTH_NAMES.map((month) => <th key={month}>{month}</th>)}<th>Total</th></tr></thead><tbody><tr><td>mm</td>{(selectedClimateMonths ?? Array.from({ length: 12 }, () => null)).map((mm, index) => <td key={MONTH_NAMES[index]}>{mm === null ? "missing" : formatNumber(mm, 1)}</td>)}<td>{selectedAnnualRainfall !== null ? formatNumber(selectedAnnualRainfall, 1) : "—"}</td></tr></tbody></table></div>
            </section>
            <aside className="panel climatology-panel">
              <PanelTitle title="30-year climatology" subtitle="Long-term monthly average from the same NASA POWER product" />
              {completeMonthlySeries(climate.climatology.monthly) ? <><div className="climatology-annual"><strong>{climate.climatology.annual !== null ? formatNumber(climate.climatology.annual, 0) : "—"}</strong><span>mm per year (30-year average)</span></div><div className="climatology-rows">{MONTH_NAMES.map((month, index) => { const mm = climate.climatology.monthly[index]; const max = Math.max(...climate.climatology.monthly.map((value) => value ?? 0)); return <div className="climatology-row" key={month}><span>{month}</span><span className="climatology-track"><span className="climatology-fill" style={{ width: `${mm !== null && max > 0 ? (mm / max) * 100 : 0}%` }} /></span><strong>{mm !== null ? formatNumber(mm, 0) : "—"}</strong></div>; })}</div><button className="button button-outline button-small climatology-use" onClick={() => { setActiveScenario((current) => ({ ...current, district: climate.district, rainfallPeriod: "annual", rainfallMm: climate.climatology.annual ?? 0, monthlyRainfallMm: climate.climatology.monthly as number[], rainfallOrigin: "api", rainfallSource: `NASA POWER 30-year climatology (PRECTOTCORR) · ${climate.point.latitude.toFixed(2)}°N, ${climate.point.longitude.toFixed(2)}°E` })); setDataMode("auto"); goTo("calculator"); notify("30-year average climatology applied. This is a long-term average, not one year's rainfall."); }}><Icon name="calculator" size={14} />Use climatology instead</button></> : <EmptyState icon="cloud" title="Climatology unavailable" description="NASA POWER did not return a complete climatology for this point." />}
            </aside>
          </div>
          <section className="panel district-comparison-panel">
            <PanelTitle title={`${climate.startYear}–${climate.endYear} annual rainfall trend`} subtitle="Each year is the sum of 12 fetched monthly totals · millimetres" action={<span className="record-count-pill">{climate.annual.filter((entry) => entry.mm !== null).length} complete years</span>} />
            <BarChart items={climate.annual.map((entry) => ({ label: String(entry.year).slice(2), value: entry.mm ?? 0 }))} unit="mm / year" emptyTitle="No annual totals" emptyDescription="NASA POWER returned no usable annual totals for this range." />
            <MethodNote>These are historical reanalysis values for past years — not a forecast and not a live weather report. MERRA-2 precipitation is bias-corrected against GPCP, but a ~55 km × 69 km grid cell cannot capture a single rooftop or a short local storm.</MethodNote>
          </section>
          <section className="panel provenance-panel">
            <PanelTitle title="Data provenance" subtitle="Exactly where these numbers came from, and what they are not" />
            <div className="provenance-grid">
              <ProvenanceRow label="Provider" value={climate.provenance.provider} />
              <ProvenanceRow label="Product" value={`${climate.provenance.product} — ${climate.provenance.productDescription}`} />
              <ProvenanceRow label="Model source" value={climate.provenance.modelSources.join(", ") || "MERRA-2"} />
              <ProvenanceRow label="Native units" value={climate.provenance.nativeUnits} />
              <ProvenanceRow label="Conversion applied" value={climate.provenance.returnedUnits} />
              <ProvenanceRow label="Grid resolution" value={climate.provenance.gridResolution} />
              <ProvenanceRow label="Coordinate basis" value={climate.provenance.pointBasis} />
              <ProvenanceRow label="What this is" value={climate.provenance.nature} />
              <ProvenanceRow label="Missing-value marker" value={`${climate.provenance.missingValueMarker} (treated as missing, never as zero)`} />
              <ProvenanceRow label="Access terms" value={climate.provenance.accessTerms} />
              <ProvenanceRow label="Months missing in range" value={String(climate.missingMonths)} />
              <ProvenanceRow label="Fetched at" value={new Date(climate.fetchedAt).toLocaleString("en-GB")} />
            </div>
            <div className="provenance-links"><a href={climate.provenance.documentationUrl} target="_blank" rel="noreferrer">NASA POWER API documentation <Icon name="external" size={13} /></a><a href={climate.provenance.apiUrl} target="_blank" rel="noreferrer">View the exact request used <Icon name="external" size={13} /></a></div>
          </section>
        </> : null}
        <div className="records-divider"><span className="records-divider-line" /><span className="records-divider-label">YOUR OWN RECORDS · OPTIONAL</span><span className="records-divider-line" /></div>
        <div className="explorer-controls panel records-controls"><div className="records-count-note"><Icon name="file" size={16} /><span><strong>{formatNumber(rainfallRecords.length)} of your own records</strong><small>Optional, and kept separate from the automatically fetched NASA POWER data above. Your records are never merged into live values.</small></span></div><label className="field" htmlFor="explorer-category"><span className="field-label">Record category filter</span><span className="field-input-wrap"><select id="explorer-category" value={explorerCategory} onChange={(event) => setExplorerCategory(event.target.value as ExplorerCategory)}><option value="all">All user-provided categories</option><option value="measurement">Measurement · uploader-labelled</option><option value="historical-average">Historical average · uploader-labelled</option><option value="forecast">Forecast · uploader-labelled</option><option value="illustrative">Illustrative scenario</option></select><span className="select-chevron"><Icon name="chevron" size={14} /></span></span></label><button className="button button-soft explorer-add" onClick={() => setRecordFormOpen((open) => !open)}><Icon name="plus" size={16} />Add rainfall record</button></div>
        {recordFormOpen ? <section className="panel record-form-panel"><PanelTitle title="Add a rainfall record" subtitle="Source text and category are supplied by you; the app does not validate the data." action={<button className="icon-button small" aria-label="Close add rainfall form" onClick={() => setRecordFormOpen(false)}><Icon name="close" size={17} /></button>} /><form className="record-form-grid" onSubmit={addRainfallRecord}><label className="field" htmlFor="record-district"><span className="field-label">District</span><span className="field-input-wrap"><select id="record-district" value={recordDraft.district} onChange={(event) => setRecordDraft((draft) => ({ ...draft, district: event.target.value }))}>{DISTRICT_GROUPS.map((group) => <optgroup key={group.division} label={group.division}>{group.districts.map((district) => <option key={district}>{district}</option>)}</optgroup>)}</select><span className="select-chevron"><Icon name="chevron" size={14} /></span></span></label><label className="field" htmlFor="record-period"><span className="field-label">Period</span><span className="field-input-wrap"><input id="record-period" required maxLength={48} placeholder="YYYY or YYYY-MM" value={recordDraft.period} onChange={(event) => setRecordDraft((draft) => ({ ...draft, period: event.target.value }))} /></span><span className="field-hint">Be consistent when comparing records.</span></label><label className="field" htmlFor="record-amount"><span className="field-label">Rainfall</span><span className="field-input-wrap"><input id="record-amount" type="number" min="0" max="10000" step="0.1" required placeholder="e.g. 0.0" value={recordDraft.rainfallMm} onChange={(event) => setRecordDraft((draft) => ({ ...draft, rainfallMm: event.target.value }))} /><span className="field-unit">mm</span></span></label><label className="field" htmlFor="record-category"><span className="field-label">Record type</span><span className="field-input-wrap"><select id="record-category" value={recordDraft.category} onChange={(event) => setRecordDraft((draft) => ({ ...draft, category: event.target.value as RainfallCategory }))}><option value="measurement">Measurement / observation</option><option value="historical-average">Historical average / climatology</option><option value="forecast">Forecast</option><option value="illustrative">Illustrative scenario</option></select><span className="select-chevron"><Icon name="chevron" size={14} /></span></span></label><label className="field record-source-field" htmlFor="record-source"><span className="field-label">Source / citation</span><span className="field-input-wrap"><input id="record-source" required maxLength={240} placeholder="Provider, station, URL, or local gauge" value={recordDraft.source} onChange={(event) => setRecordDraft((draft) => ({ ...draft, source: event.target.value }))} /></span><span className="field-hint">A source label helps trace data; it is not verification.</span></label><div className="record-form-actions"><button type="button" className="button button-outline" onClick={() => setRecordFormOpen(false)}>Cancel</button><button type="submit" className="button button-primary"><Icon name="plus" size={16} />Save record</button></div></form></section> : null}
        <div className="explorer-main-grid"><section className="panel explorer-chart-panel"><PanelTitle title={`${explorerDistrict} · rainfall records`} subtitle="Values are shown with their supplied period and category; periods may not be directly comparable." action={selectedRecords.length ? <span className="record-count-pill">{selectedRecords.length} record{selectedRecords.length === 1 ? "" : "s"}</span> : null} />{recordsForChart.length ? <><BarChart items={recordsForChart.map((record) => ({ label: record.period, value: record.rainfallMm, detail: `${CATEGORY_SHORT[record.category]} · ${record.source}` }))} unit="mm" emptyTitle="No records" emptyDescription="Add or import a rainfall record for this district." /><div className="table-scroll"><table className="data-table"><thead><tr><th>Period</th><th>Rainfall</th><th>Category</th><th>Source label</th><th>Action</th></tr></thead><tbody>{[...selectedRecords].reverse().map((record) => <tr key={record.id}><td>{record.period}</td><td>{formatNumber(record.rainfallMm, 1)} mm</td><td><span className={`category-tag category-${record.category}`}>{CATEGORY_SHORT[record.category]}</span></td><td>{record.source}<small className="table-subtext">Uploader-supplied · not verified</small></td><td><div className="table-actions"><button className="table-link" onClick={() => applyRecordToCalculator(record)}>Use in calculator <Icon name="arrow" size={13} /></button><button className="table-link delete-link" onClick={() => deleteRainfallRecord(record.id)}>Remove</button></div></td></tr>)}</tbody></table></div></> : <EmptyState icon="cloud" title={`No records for ${explorerDistrict}`} description="Add a sourced value or import a CSV. This empty state is intentional — no rainfall measurement has been fabricated." action={<button className="button button-outline button-small" onClick={() => setRecordFormOpen(true)}>Add a record <Icon name="plus" size={14} /></button>} />}</section>
          <aside className="panel district-list-panel"><PanelTitle title="District index" subtitle="Select a district to view your imported records." /><div className="district-search-wrap"><Icon name="search" size={15} /><input type="search" placeholder="Filter 64 districts" value={districtFilter} onChange={(event) => setDistrictFilter(event.target.value)} /></div><div className="district-index-list">{DISTRICT_GROUPS.map((group) => { const filtered = group.districts.filter((district) => district.toLowerCase().includes(districtFilter.trim().toLowerCase())); if (!filtered.length) return null; return <div className="district-group" key={group.division}><div className="district-group-title">{group.division}</div>{filtered.map((district) => <button className={`district-index-row${district === explorerDistrict ? " district-selected" : ""}`} key={district} onClick={() => setExplorerDistrict(district)}><span>{district}</span><span className="district-record-count">{districtCounts.get(district) ?? 0}</span></button>)}</div>; })}</div></aside></div>
        <section className="panel district-comparison-panel"><PanelTitle title="Compare your own records across districts" subtitle="Only your records sharing the same period and category are included. This is a comparison of uploaded data, kept separate from NASA POWER values." action={<div className="comparison-selects">{comparisonPeriods.length ? <select aria-label="Comparison period" value={activeComparisonPeriod} onChange={(event) => setComparisonPeriod(event.target.value)}>{comparisonPeriods.map((period) => <option key={period}>{period}</option>)}</select> : null}<select aria-label="Comparison data category" value={comparisonCategory} onChange={(event) => setComparisonCategory(event.target.value as RainfallCategory)}><option value="measurement">Measurement labels</option><option value="historical-average">Historical-average labels</option><option value="forecast">Forecast labels</option><option value="illustrative">Illustrative labels</option></select></div>} />{matchesForComparison.length > 0 ? <><BarChart items={matchesForComparison.map((record) => ({ label: record.district, value: record.rainfallMm, detail: `${record.period} · ${record.source}` }))} unit="mm" emptyTitle="No comparable records" emptyDescription="Add the same period for multiple districts to compare." /><MethodNote>Comparison values are uploader-labelled and unverified. Station coverage, period definitions, units, and measurement methods should be checked before scientific use.</MethodNote></> : <EmptyState icon="compare" title="No like-for-like district data yet" description="Add records for two or more districts with the same period and category. The chart will only compare those matching entries." />}</section>
        <div className="explorer-source-grid"><SourceCard name="Bangladesh Meteorological Department (BMD)" description="Official climate and rainfall resources are available through BMD portals. Some historical data access may require a formal request or payment; check current terms before reuse." href="https://live6.bmd.gov.bd/" status="External source · not connected" /><SourceCard name="NASA POWER" description="Free public API requiring no key. This app calls it automatically through a server proxy for the selected district. Values are model/satellite-derived reanalysis, not a local rain gauge." href="https://power.larc.nasa.gov/docs/services/api/temporal/monthly/" status="Connected · used automatically" /></div>
        <div className="map-limitation"><span className="map-limitation-icon"><Icon name="map" size={19} /></span><div><strong>Why there is no coloured district map</strong><p>The rainfall values here are real, but drawing a choropleth also needs licensed district-boundary geometry, and a ~55 km grid cell cannot be honestly shaded as a whole district. So the app shows a district index plus per-district charts instead of inventing boundaries or implying precision the grid does not have.</p></div><span className="map-status">BOUNDARIES NOT LOADED</span></div>
      </>
    );
  };

  const renderForecast = () => {
    const todayLabel = forecast?.current?.time ? new Date(forecast.current.time).toLocaleString("en-GB", { weekday: "long", hour: "2-digit", minute: "2-digit" }) : null;
    const next7 = forecast?.days.slice(0, 7) ?? [];
    const next16 = forecast?.days ?? [];
    const sevenDayTotal = next7.reduce((sum, day) => sum + day.precipitationMm, 0);
    const rainyDays = next7.filter((day) => day.precipitationMm >= 1).length;
    return (
      <>
        <SectionHeader eyebrow="LIVE · OPEN-METEO · UPDATED NOW" title="Weather forecast" description="A short-range precipitation forecast for today, the next 7 days, and up to 16 days — detected from your location or a chosen district." />
        <div className="forecast-locate-panel panel">
          <div className="locate-copy">
            <span className="locate-icon"><Icon name="target" size={19} /></span>
            <div>
              <strong>Detect my location</strong>
              <p>Uses your browser&apos;s location permission once, client-side. Coordinates are sent only to fetch forecast + place name; nothing is stored on a server.</p>
            </div>
          </div>
          <div className="locate-actions">
            <button className="button button-primary" onClick={() => void detectMyLocation()} disabled={geoStatus === "locating"}><Icon name={geoStatus === "locating" ? "spinner" : "target"} size={16} className={geoStatus === "locating" ? "spin" : undefined} />{geoStatus === "locating" ? "Detecting…" : "Detect my location"}</button>
            <div className="locate-or">or pick a district</div>
            <select className="year-select" aria-label="Forecast district" value={forecastDistrict} onChange={(event) => loadForecastForDistrict(event.target.value)}>{DISTRICT_GROUPS.map((group) => <optgroup key={group.division} label={group.division}>{group.districts.map((district) => <option key={district}>{district}</option>)}</optgroup>)}</select>
          </div>
        </div>
        {geoStatus === "denied" || geoStatus === "error" ? <div className="callout callout-warning"><Icon name="alert" size={18} /><div><strong>Location detection did not complete</strong><span>{geoError}</span></div></div> : null}
        {!forecastPoint && forecastStatus === "idle" ? <EmptyState icon="sun" title="No location selected yet" description="Press “Detect my location” or choose a district above to load a live forecast." /> : null}
        {forecastStatus === "loading" ? <div className="live-data-bar live-loading"><span className="live-status-icon"><Icon name="spinner" size={17} className="spin" /></span><div className="live-status-copy"><strong>Fetching forecast…</strong><span>Requesting Open-Meteo for {detectedPlace?.label ?? `${forecastDistrict} reference point`}.</span></div></div> : null}
        {forecastStatus === "error" ? <div className="callout callout-warning"><Icon name="alert" size={18} /><div><strong>Forecast could not be loaded</strong><span>{forecastError}</span></div></div> : null}
        {forecast && forecastStatus === "ready" ? <>
          <div className="forecast-location-bar">
            <span className="forecast-location-icon"><Icon name="map" size={16} /></span>
            <div><strong>{detectedPlace?.label ?? `${forecastDistrict}, Bangladesh`}</strong><span>{forecast.point.latitude.toFixed(3)}°N, {forecast.point.longitude.toFixed(3)}°E · timezone {forecast.timezone} · fetched {new Date(forecast.generatedAt).toLocaleTimeString("en-GB")}</span></div>
            <button className="button button-soft button-small" onClick={() => { const nearest = findNearestDistrict(forecast.point.latitude, forecast.point.longitude); setExplorerDistrict(nearest.district.name); goTo("explorer"); }}>See historical data for nearest district <Icon name="arrow" size={13} /></button>
          </div>
          <div className="forecast-current-grid">
            <article className="forecast-current-card">
              <span className="forecast-current-icon"><Icon name={forecast.current?.weatherCode !== null && forecast.current?.weatherCode !== undefined ? weatherCodeIcon(forecast.current.weatherCode) : "cloud"} size={26} /></span>
              <div><strong>{forecast.current?.temperatureC !== null && forecast.current?.temperatureC !== undefined ? `${formatNumber(forecast.current.temperatureC, 1)}°C` : "—"}</strong><span>{forecast.current?.weatherCode !== null && forecast.current?.weatherCode !== undefined ? describeWeatherCode(forecast.current.weatherCode) : "Current conditions"}{todayLabel ? ` · ${todayLabel}` : ""}</span></div>
            </article>
            <MetricCard icon="drop" label="Next 7 days total" value={formatNumber(sevenDayTotal, 1)} unit="mm forecast rainfall" tone="blue" foot={`${rainyDays} of 7 days with ≥1 mm forecast`} />
            <MetricCard icon="cloud" label="Current precipitation" value={forecast.current?.precipitationMm !== null && forecast.current?.precipitationMm !== undefined ? formatNumber(forecast.current.precipitationMm, 1) : "—"} unit="mm right now" tone="aqua" foot="From the same live forecast model" />
            <MetricCard icon="target" label="Forecast horizon" value={String(next16.length)} unit="days available" tone="sand" foot="Confidence drops for days further out" />
          </div>
          <section className="panel forecast-week-panel">
            <PanelTitle title="Next 7 days" subtitle="Daily precipitation forecast · millimetres and probability" />
            <div className="forecast-day-grid">
              {next7.map((day) => (
                <div className="forecast-day-card" key={day.date}>
                  <span className="forecast-day-date">{new Date(day.date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</span>
                  <span className="forecast-day-icon"><Icon name={weatherCodeIcon(day.weatherCode)} size={20} /></span>
                  <strong className="forecast-day-mm">{formatNumber(day.precipitationMm, 1)} mm</strong>
                  <span className="forecast-day-prob">{day.precipitationProbabilityPercent !== null ? `${formatNumber(day.precipitationProbabilityPercent, 0)}% chance` : "—"}</span>
                  <span className="forecast-day-temp">{formatNumber(day.temperatureMaxC, 0)}° / {formatNumber(day.temperatureMinC, 0)}°</span>
                  <span className="forecast-day-desc">{describeWeatherCode(day.weatherCode)}</span>
                </div>
              ))}
            </div>
          </section>
          <section className="panel forecast-week-panel">
            <PanelTitle title="16-day precipitation outlook" subtitle="Longer range · lower confidence the further out it goes" />
            <BarChart items={next16.map((day) => ({ label: new Date(day.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" }), value: day.precipitationMm, detail: `${day.precipitationProbabilityPercent ?? "—"}% chance` }))} unit="mm forecast" emptyTitle="No forecast" emptyDescription="No daily forecast values were returned." />
          </section>
          <section className="panel provenance-panel">
            <PanelTitle title="Forecast provenance" subtitle="This is a prediction, not an observation" />
            <div className="provenance-grid">
              <ProvenanceRow label="Provider" value={forecast.provenance.provider} />
              <ProvenanceRow label="Model" value={forecast.provenance.model} />
              <ProvenanceRow label="What this is" value={forecast.provenance.nature} />
              <ProvenanceRow label="Access terms" value={forecast.provenance.accessTerms} />
            </div>
            <div className="provenance-links"><a href={forecast.provenance.documentationUrl} target="_blank" rel="noreferrer">Open-Meteo documentation <Icon name="external" size={13} /></a><a href={forecast.provenance.apiUrl} target="_blank" rel="noreferrer">View the exact request used <Icon name="external" size={13} /></a></div>
          </section>
          <MethodNote>Forecasts change as new model runs arrive — refresh this page later for an updated outlook. This tab is intentionally separate from the Rainfall Explorer: the explorer shows historical NASA POWER reanalysis, this page shows a live short-range prediction. Neither should be read as the other.</MethodNote>
        </> : null}
      </>
    );
  };

  const renderScenarios = () => {
    const compareProjects = savedProjects.map((project) => ({ project, result: calculateHarvest(project) }));
    const compareWithData = compareProjects.filter(({ project }) => scenarioHasRainfallValue(project));
    return (
      <>
        <SectionHeader eyebrow="COMPARE THE WHAT-IFS" title="Scenario studio" description="Compare your own roof, demand, efficiency, and tank assumptions without blending their rainfall sources." action={<div className="header-action-group"><button className="button button-outline" onClick={startNewScenario}><Icon name="plus" size={15} />New analysis</button><button className="button button-primary" onClick={saveCurrentScenario}><Icon name="save" size={15} />Add current to comparison</button></div>} />
        <div className="scenario-summary-banner"><div className="summary-icon"><Icon name="compare" size={18} /></div><div><strong>{savedProjects.length} saved scenario{savedProjects.length === 1 ? "" : "s"}</strong><span>Save at least two plans to compare their calculated volumes. Each scenario retains its own rainfall source note.</span></div><button className="text-button" onClick={() => goTo("calculator")}>Edit active analysis <Icon name="arrow" size={14} /></button></div>
        {compareWithData.length >= 2 ? <section className="panel scenario-chart-panel"><PanelTitle title="Estimated usable harvest comparison" subtitle="Only scenarios with a rainfall value are charted. Annual totals and single-event results are labeled in each card; avoid comparing unlike periods." /><BarChart items={compareWithData.map(({ project, result: projectResult }) => ({ label: project.name.slice(0, 16), value: projectResult.usableLitres, detail: `${project.rainfallPeriod === "annual" ? "annual" : "selected period / event"} · ${project.district} · ${project.rainfallOrigin}` }))} unit="L · mixed periods may differ" emptyTitle="Add rainfall to scenarios" emptyDescription="Scenarios without rainfall values are not plotted." /></section> : <section className="panel"><EmptyState icon="compare" title="Save two rainfall scenarios to compare" description="The comparison chart appears once two saved analyses have rainfall values. Values are calculated from your own inputs, not sample district statistics." action={<button className="button button-outline button-small" onClick={() => goTo("calculator")}>Set up an analysis <Icon name="arrow" size={14} /></button>} /></section>}
        {savedProjects.length ? <div className="scenario-card-grid">{savedProjects.map((project) => { const projectResult = calculateHarvest(project); const hasValue = scenarioHasRainfallValue(project); return <article className="scenario-card panel" key={project.id}><div className="scenario-card-top"><div className="scenario-card-icon"><Icon name="file" size={18} /></div><div className="scenario-card-menu"><button className="icon-button small" aria-label={`Duplicate ${project.name}`} title="Duplicate" onClick={() => duplicateScenario(project)}><Icon name="copy" size={15} /></button><button className="icon-button small danger-icon" aria-label={`Delete ${project.name}`} title="Delete" onClick={() => deleteScenario(project.id)}><Icon name="trash" size={15} /></button></div></div><div className="scenario-card-eyebrow">{project.district} · {project.rainfallPeriod === "annual" ? "Annual" : "Selected period / event"}</div><h3>{project.name}</h3><div className="scenario-card-metric"><strong>{hasValue ? formatNumber(projectResult.usableLitres) : "—"}</strong><span>{hasValue ? `L ${project.rainfallPeriod === "annual" ? "/ year" : "/ selected period"}` : "Rainfall not entered"}</span></div><div className="scenario-card-details"><span><Icon name="map" size={13} />{formatNumber(project.roofAreaM2)} m² roof</span><span><Icon name="drop" size={13} />{hasValue ? `${formatNumber(getRainfallTotal(project), 1)} mm` : "No rain value"}</span><span><Icon name="tank" size={13} />{formatNumber(project.tankCapacityLitres)} L tank</span><span><Icon name="target" size={13} />{formatNumber(projectResult.dailyDemandLitres)} L/day demand</span></div><div className="scenario-source-line"><OriginBadge origin={project.rainfallOrigin} /><span>{project.rainfallSource || "No rainfall source note"}</span></div><div className="scenario-card-actions"><button className="button button-outline button-small" onClick={() => loadScenario(project)}><Icon name="edit" size={14} />Open & edit</button><button className="button button-soft button-small" onClick={() => duplicateScenario(project)}><Icon name="copy" size={14} />Duplicate</button></div></article>; })}</div> : <section className="panel scenario-empty-panel"><EmptyState icon="folder" title="No saved scenarios yet" description="Build an analysis, name it, and save it to start a comparison. A worked formula example is available, but it is labelled illustrative and is never preloaded." action={<div className="empty-inline-actions"><button className="button button-primary button-small" onClick={() => goTo("calculator")}>Create an analysis <Icon name="arrow" size={14} /></button><button className="button button-outline button-small" onClick={loadWorkedExample}>Load formula example</button></div>} /></section>}
        <MethodNote>Scenarios are comparison cases, not measurements of actual households, schools, or districts. Each result inherits the data provenance and limitations of its inputs.</MethodNote>
      </>
    );
  };

  const renderReports = () => {
    const reportDate = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
    return (
      <>
        <SectionHeader eyebrow="SAVE · EXPORT · SHARE OFFLINE" title="Reports & projects" description="Your work stays in this browser unless you export a file. Print a clean report or export the underlying values." action={<div className="header-action-group"><button className="button button-outline" onClick={exportWorkspaceJson}><Icon name="download" size={15} />Export JSON</button><button className="button button-primary" onClick={() => window.print()}><Icon name="printer" size={15} />Print / save PDF</button></div>} />
        <div className="report-actions-row"><div className="report-active-summary"><span className="report-icon"><Icon name="file" size={18} /></span><div><strong>Active analysis · {activeScenario.name}</strong><small>Current browser workspace · {activeScenario.district}</small></div></div><div className="header-action-group"><button className="button button-soft" onClick={saveCurrentScenario}><Icon name="save" size={15} />{isCurrentSaved ? "Update saved" : "Save active"}</button><button className="button button-outline" onClick={exportCalculationCsv}><Icon name="download" size={15} />Calculation CSV</button><button className="button button-outline" onClick={() => projectUploadRef.current?.click()}><Icon name="upload" size={15} />Import JSON</button><input ref={projectUploadRef} className="visually-hidden" type="file" accept=".json,application/json" onChange={(event) => void importProjectJson(event)} /></div></div>
        <section className="panel report-print-root">
          <div className="report-document-head"><div><div className="eyebrow">INTELLIGENT RAINFALL · ANALYSIS REPORT</div><h2>{titleForReport}</h2><p>Prepared {reportDate} · Local browser report · {activeScenario.district}, Bangladesh</p></div><div className="report-mark"><Icon name="drop" size={23} /><span>IR</span></div></div>
          <div className="report-provenance"><OriginBadge origin={activeScenario.rainfallOrigin} /><strong>{activeScenario.rainfallSource || "No rainfall source has been entered."}</strong><span>Source label is user-supplied and has not been independently verified.</span></div>
          <div className="report-metrics-grid"><ReportMetric label={activeScenario.rainfallPeriod === "annual" ? "Rainfall total" : "Rainfall event"} value={hasRainfallInput ? `${formatNumber(getRainfallTotal(activeScenario), 1)} mm` : "Not provided"} /><ReportMetric label="Theoretical roof yield" value={hasRainfallInput ? formatLitres(result.theoreticalLitres) : "Not calculated"} /><ReportMetric label="Estimated usable yield" value={hasRainfallInput ? formatLitres(result.usableLitres) : "Not calculated"} /><ReportMetric label="Daily demand" value={`${formatLitres(result.dailyDemandLitres)} / day`} /></div>
          <div className="report-section"><h3>Inputs & assumptions</h3><div className="report-data-grid"><ReportRow label="District label" value={activeScenario.district} note="Location selected by user; not rainfall provenance" /><ReportRow label="Catchment area" value={`${formatNumber(activeScenario.roofAreaM2, 2)} m²`} /><ReportRow label="Roof surface" value={`${activeScenario.roofType} · coefficient ${formatNumber(activeScenario.runoffCoefficient, 2)}`} /><ReportRow label="Collection loss factor" value={`${formatNumber(activeScenario.collectionLossPercent, 1)}%`} note="Applied once to theoretical yield" /><ReportRow label="Household / group size" value={`${formatNumber(activeScenario.householdMembers)} people`} /><ReportRow label="Demand per person" value={`${formatNumber(activeScenario.demandPerPerson)} L/person/day`} /><ReportRow label="Additional daily demand" value={`${formatNumber(activeScenario.additionalDailyDemand)} L/day`} /><ReportRow label="Tank capacity" value={formatLitres(activeScenario.tankCapacityLitres)} /></div></div>
          <div className="report-section"><h3>Calculations</h3><div className="equation-report"><code>Theoretical harvest = rainfall (mm) × roof area (m²) × runoff coefficient</code><code>Usable harvest = theoretical harvest × (1 − collection loss %)</code><code>Daily demand = people × litres per person per day + additional daily use</code>{result.annualCoveragePercent !== null ? <code>Annual coverage ratio = usable annual harvest ÷ annual demand × 100 = {formatNumber(result.annualCoveragePercent, 1)}%</code> : <span className="report-muted">Annual coverage is not reported for a single rainfall event.</span>}</div></div>
          {monthlySimulation ? <div className="report-section"><h3>Monthly storage model</h3><div className="report-model-summary"><span>Inflow <strong>{formatLitres(monthlySimulation.totalInflow)}</strong></span><span>Delivered <strong>{formatLitres(monthlySimulation.totalDelivered)}</strong></span><span>Shortfall <strong>{formatLitres(monthlySimulation.totalShortage)}</strong></span><span>Overflow <strong>{formatLitres(monthlySimulation.totalOverflow)}</strong></span></div><p className="report-muted">Based on 12 user-entered monthly values, a 365-day representative year, and the selected tank capacity.</p></div> : <div className="report-section"><h3>Storage model</h3><p className="report-muted">No 12-month series is available. Annual rainfall is not treated as daily rainfall; a single-inflow comparison is not an annual overflow forecast.</p></div>}
          <div className="report-section report-limitations"><h3>Limitations & safe use</h3><ul><li>Rainfall marked “NASA POWER” is fetched automatically from a free public API (PRECTOTCORR, MERRA-2 reanalysis, ~55 km × 69 km grid, converted from mm/day). It is a model-based estimate for a reference point, not a rain-gauge reading at your building, and it is historical — never a forecast. Rainfall marked user-entered or imported has not been independently verified.</li><li>Runoff coefficients and collection losses are planning assumptions. Roof condition, first-flush design, leakage, maintenance, and local rainfall timing affect actual yield.</li><li>Annual volume coverage does not mean rainwater is available every day. A monthly balance is a coarse model and does not resolve daily storm timing.</li><li>This estimate does not assess water quality. Collected rainwater must not be assumed safe to drink without suitable treatment and testing.</li><li>Capacity guidance is an input-based planning reference, not engineering design, a guarantee, a cost estimate, or a financial-savings claim.</li></ul></div>
          <div className="report-footer"><span>Intelligent Rainfall · Estimates only · No cloud storage</span><span>{reportDate}</span></div>
        </section>
        <section className="panel saved-projects-panel"><PanelTitle title={`Saved projects (${savedProjects.length})`} subtitle="Open, duplicate, or remove projects stored in this browser." action={<button className="button button-outline button-small" onClick={exportWorkspaceJson}><Icon name="download" size={14} />Export workspace JSON</button>} />{savedProjects.length ? <div className="table-scroll"><table className="data-table project-table"><thead><tr><th>Project</th><th>District</th><th>Rainfall / provenance</th><th>Yield estimate</th><th>Actions</th></tr></thead><tbody>{savedProjects.map((project) => { const projectResult = calculateHarvest(project); const hasValue = scenarioHasRainfallValue(project); return <tr key={project.id}><td><strong>{project.name}</strong><small className="table-subtext">Saved in this browser</small></td><td>{project.district}</td><td>{hasValue ? `${formatNumber(getRainfallTotal(project), 1)} mm · ${project.rainfallOrigin}` : "No rainfall value"}<small className="table-subtext">{project.rainfallSource || "Source not entered"}</small></td><td>{hasValue ? `${formatLitres(projectResult.usableLitres)}${project.rainfallPeriod === "annual" ? " / year" : " / event"}` : "—"}</td><td><div className="table-actions"><button className="table-link" onClick={() => loadScenario(project)}>Open</button><button className="table-link" onClick={() => duplicateScenario(project)}>Duplicate</button><button className="table-link delete-link" onClick={() => deleteScenario(project.id)}>Delete</button></div></td></tr>; })}</tbody></table></div> : <EmptyState icon="folder" title="Nothing saved yet" description="Save the active analysis above or from the calculator. Data remains on this device." />}</section>
      </>
    );
  };

  const renderInsights = () => {
    const unavailable = insight && insight.ok && !insight.available;
    const done = insight && insight.ok && insight.available;
    return (
      <>
        <SectionHeader eyebrow="OPTIONAL · GROQ POWERED" title="AI explanation" description="Turns your current numbers into plain-language guidance. It explains results — it never changes or invents them." action={<button className="button button-primary" onClick={() => void generateInsight()} disabled={insightStatus === "loading" || !calculationReady}><Icon name={insightStatus === "loading" ? "spinner" : "spark"} size={16} className={insightStatus === "loading" ? "spin" : undefined} />{insightStatus === "loading" ? "Thinking…" : "Explain my results"}</button>} />
        <div className="insight-layout">
          <section className="panel insight-output">
            <PanelTitle title="Plain-language explanation" subtitle="Generated from the exact inputs listed beside it." action={insightStatus === "done" ? <button className="mini-action" onClick={() => void generateInsight()}><Icon name="refresh" size={13} />Regenerate</button> : null} />
            {!calculationReady ? <EmptyState icon="spark" title="Add a rainfall value first" description="Once the calculator has rainfall and a roof area, an explanation can be generated from those numbers." action={<button className="button button-outline button-small" onClick={() => goTo("explorer")}>Load live rainfall data <Icon name="arrow" size={14} /></button>} />
              : insightStatus === "loading" ? <div className="insight-loading"><span className="insight-spinner"><Icon name="spinner" size={20} className="spin" /></span><div><strong>Requesting an explanation…</strong><p>The request is sent to the Groq API from the server. No rainfall data is re-fetched and no calculation changes.</p></div></div>
              : unavailable && insight && insight.ok && !insight.available ? <div className="insight-unavailable"><span className="insight-flag"><Icon name="info" size={17} /></span><div><strong>AI is not enabled on this deployment</strong><p>{insight.reason}</p><p>{insight.guidance}</p><div className="insight-setup"><span>Enable it free: create a key at console.groq.com, add <code>GROQ_API_KEY</code> to your environment, then restart or redeploy. On Vercel use Project → Settings → Environment Variables. <code>GROQ_MODEL</code> is optional.</span></div></div></div>
              : done && insight && insight.ok && insight.available ? <div className="insight-answer"><div className="insight-answer-head"><span className="insight-model"><Icon name="spark" size={14} />{insight.model}</span><span className="insight-flag">AI-GENERATED</span></div><p className="insight-text">{insight.text}</p><div className="insight-disclaimer"><Icon name="alert" size={15} /><span>{insight.disclaimer}</span></div></div>
              : insightStatus === "error" ? <div className="insight-error"><Icon name="alert" size={17} /><div><strong>Explanation could not be generated</strong><p>{insightError}</p></div></div>
              : <EmptyState icon="spark" title="Nothing generated yet" description="Press “Explain my results”. Your inputs are sent to the model; the calculations themselves always run locally in your browser." action={<button className="button button-primary button-small" onClick={() => void generateInsight()} disabled={!calculationReady}>Explain my results <Icon name="spark" size={14} /></button>} />}
          </section>
          <aside className="panel insight-inputs">
            <PanelTitle title="Exactly what was sent" subtitle="No hidden context, no extra data." />
            <div className="insight-input-list">
              <InsightRow label="Rainfall source" value={activeScenario.rainfallSource || "Not specified"} />
              <InsightRow label="Data origin" value={activeScenario.rainfallOrigin} />
              <InsightRow label="District label" value={activeScenario.district} />
              <InsightRow label="Annual rainfall" value={`${formatNumber(getRainfallTotal(activeScenario), 1)} mm`} />
              <InsightRow label="Roof" value={`${formatNumber(activeScenario.roofAreaM2, 1)} m² · ${activeScenario.roofType} · C=${formatNumber(activeScenario.runoffCoefficient, 2)}`} />
              <InsightRow label="Losses" value={`${formatNumber(activeScenario.collectionLossPercent, 1)}%`} />
              <InsightRow label="Usable yield" value={formatLitres(result.usableLitres)} />
              <InsightRow label="Daily demand" value={`${formatLitres(result.dailyDemandLitres)} / day`} />
              <InsightRow label="Annual coverage" value={result.annualCoveragePercent !== null ? `${formatNumber(result.annualCoveragePercent, 1)}%` : "not applicable"} />
              <InsightRow label="Tank" value={formatLitres(activeScenario.tankCapacityLitres)} />
              <InsightRow label="Modelled shortfall" value={monthlySimulation ? formatLitres(monthlySimulation.totalShortage) : "not modelled"} />
              <InsightRow label="Modelled overflow" value={monthlySimulation ? formatLitres(monthlySimulation.totalOverflow) : "not modelled"} />
            </div>
            <MethodNote>The model receives only these numbers. It cannot fetch data, change your inputs, or verify its own claims — treat the wording as an explanation, not as evidence.</MethodNote>
          </aside>
        </div>
      </>
    );
  };

  const renderScience = () => (
    <>
      <SectionHeader eyebrow="TRANSPARENT BY DESIGN" title="Science & methodology" description="The formulas are simple; real-world reliability depends on better data, timing, construction, and water quality." action={<button className="button button-primary" onClick={loadWorkedExample}><Icon name="calculator" size={16} />See worked example</button>} />
      <div className="science-intro panel"><div className="science-intro-icon"><Icon name="book" size={23} /></div><div><h2>From rainfall depth to usable water</h2><p>Rainwater harvesting captures runoff from a catchment, channels it through a collection system, and stores it for later uses. Intelligent Rainfall calculates potential volume from values you provide; it does not measure rain or guarantee system performance.</p></div><span className="science-badge">ESTIMATE · NOT A GUARANTEE</span></div>
      <div className="science-grid">
        <ScienceCard number="01" title="Rainfall × area" formula="1 mm × 1 m² = 1 litre" body="A rainfall depth of one millimetre over one square metre represents one litre of water falling on that area. Roof area and rainfall units must describe the same catchment and period." />
        <ScienceCard number="02" title="Roof runoff" formula="Theoretical yield = P × A × C" body="P is rainfall in millimetres, A is horizontal catchment area in square metres, and C is the runoff coefficient. The coefficient is a planning approximation for losses and incomplete runoff, not a universal material constant." />
        <ScienceCard number="03" title="Collection losses" formula="Usable = theoretical × (1 − loss fraction)" body="This app applies one configurable post-roof collection loss factor after the runoff coefficient. The factor can represent first flush, conveyance, leaks, and handling. Do not enter the same loss twice." />
        <ScienceCard number="04" title="Household demand" formula="Daily = people × L/person/day + other use" body="Annual demand is the entered daily demand multiplied by 365. The daily per-person value is an editable planning assumption; actual demand varies by household, purpose, season, and service level." />
        <ScienceCard number="05" title="Storage balance" formula="End = min(capacity, max(0, start + inflow − demand))" body="When a 12-month series is entered, the model advances month by month, tracks demand shortfall, caps stored volume at tank capacity, and totals overflow. It uses a representative 365-day year and cannot resolve day-by-day storm timing." />
        <ScienceCard number="06" title="Coverage ≠ reliability" formula="Annual ratio = usable annual yield ÷ annual demand" body="An annual total can exceed annual demand while a tank still runs dry during a long rain-free period. Without rainfall timing, an annual total alone cannot show reliable daily supply or actual overflow." />
      </div>
      <section className="panel worked-example-panel"><div className="worked-example-head"><span className="example-number">EXAMPLE</span><div><h2>A checkable event calculation</h2><p>An illustrative input set, not a measured result for a Bangladeshi district.</p></div></div><div className="worked-example-math"><div className="example-input"><span>Roof area</span><strong>100 m²</strong></div><span className="math-operator">×</span><div className="example-input"><span>Rainfall event</span><strong>100 mm</strong></div><span className="math-operator">×</span><div className="example-input"><span>Runoff coefficient</span><strong>0.80</strong></div><span className="math-operator">=</span><div className="example-output"><span>Theoretical yield</span><strong>8,000 L</strong></div></div><p className="example-footnote">If a separate 10% collection loss were assumed, estimated usable yield would be 7,200 L. That is an assumption, not a measured system result.</p><button className="button button-outline button-small" onClick={loadWorkedExample}>Load these illustrative inputs into calculator <Icon name="arrow" size={14} /></button></section>
      <div className="science-data-grid"><section className="panel"><PanelTitle title="Where the data comes from" subtitle="One source is fetched automatically; the other is an official reference you can consult." /><div className="source-list"><SourceCard name="Bangladesh Meteorological Department" description="Official forecasts, observations, climate resources, and rainfall products. Availability and reuse terms vary; some datasets are supplied through formal access or paid requests." href="https://live6.bmd.gov.bd/" status="Official portal · not connected" /><SourceCard name="NASA POWER" description="Public, no-key API. This app queries it automatically through a server proxy for the selected district and converts mm/day into monthly and annual millimetre totals. It is gridded reanalysis, not a local rain-gauge observation." href="https://power.larc.nasa.gov/docs/services/api/temporal/monthly/" status="Connected · fetched automatically" /></div><MethodNote>NASA POWER values are labelled “reanalysis estimate”, which is a different category from a gauge measurement, a forecast, or an illustrative scenario. Missing months arrive as a fill value and are shown as missing — never as zero.</MethodNote></section><section className="panel"><PanelTitle title="Data categories stay separate" subtitle="Each record preserves how its uploader classified it." /><div className="data-category-list"><DataCategory title="Historical observation" detail="A past measurement reported by a source. Check station, date, and instrument." category="measurement" /><DataCategory title="Historical average" detail="A climatological average is not a specific year's rainfall." category="historical-average" /><DataCategory title="Forecast" detail="A forecast is forward-looking and can change; it is not observed rainfall." category="forecast" /><DataCategory title="Illustrative scenario" detail="A teaching or what-if input, never a measured fact." category="illustrative" /></div></section></div>
      <div className="safety-banner"><span className="safety-icon"><Icon name="shield" size={20} /></span><div><strong>Rainwater is not automatically safe to drink.</strong><p>Roof debris, animals, roofing materials, storage conditions, and local contamination can affect quality. Appropriate filtration, treatment, maintenance, and water testing are needed before drinking use. Consider non-potable applications only where locally appropriate.</p></div></div>
    </>
  );

  const renderAbout = () => (
    <>
      <SectionHeader eyebrow="INTELLIGENT RAINFALL" title="Practical clarity for every drop." description="A browser-based planning tool for exploring rooftop rainwater potential — built to be transparent, useful, and honest about what it does not know." />
      <section className="about-hero panel"><div className="about-brand-mark"><Icon name="drop" size={28} /></div><div className="eyebrow">THE IDEA</div><h2>Good water planning starts with good questions.</h2><p>How much rain can a roof catch? How much is lost? How big might a storage target be? Intelligent Rainfall helps answer these questions with editable assumptions and visible math, while keeping the difference between measured data and an illustrative scenario clear.</p><div className="about-pill-row"><span><Icon name="check" size={14} />NASA POWER rainfall fetched automatically</span><span><Icon name="check" size={14} />No API key or paid service needed</span><span><Icon name="check" size={14} />Your projects stay in your browser</span></div></section>
      <div className="about-feature-grid"><AboutFeature icon="calculator" title="Calculate" text="Translate rainfall, roof area, roof runoff, and system loss into theoretical and usable volumes." /><AboutFeature icon="tank" title="Plan storage" text="Use an explicit monthly balance when monthly rainfall is available; otherwise see a clearly limited scenario." /><AboutFeature icon="cloud" title="Live data" text="Rainfall and a short-range forecast are fetched automatically — no manual entry, no API key." /><AboutFeature icon="folder" title="Keep your work" text="Save, compare, print, and export projects from this browser. Nothing is uploaded to a cloud account." /></div>

      <section className="panel user-guide-panel">
        <PanelTitle title="User guide — what each menu does" subtitle="A plain-English walkthrough of every section, in the order they appear in the sidebar." />
        <div className="guide-list">
          <GuideItem icon="grid" step="1" title="Overview" text="Your home screen. Shows whether live rainfall is loaded, a quick summary of your current estimate, your monthly rainfall chart (if entered), harvest-vs-demand comparison, planning notes, and your saved analyses." />
          <GuideItem icon="cloud" step="2" title="Rainfall explorer" text="Pick a district from the dropdown and real historical rainfall loads automatically from NASA POWER — 10 years of monthly totals plus a 30-year average. Click “Use [year] data” to send it straight into the calculator. You can also add your own rainfall records below, separately from the live data." />
          <GuideItem icon="calculator" step="3" title="Harvest calculator" text="The core tool. Set roof area, roof material, collection losses, household size and daily water use. It instantly computes theoretical and usable harvest using Rainfall × Area × Runoff coefficient. Switch between “Auto · NASA” (live data keeps updating it) and “Manual” (your typed numbers are protected from being overwritten)." />
          <GuideItem icon="tank" step="4" title="Storage planner" text="Enter a tank size and see a real month-by-month water balance: how full the tank gets, when it would overflow, and when demand would exceed what's stored. Needs a complete 12-month rainfall series (auto-loaded from NASA POWER, or typed in manually) to run the full simulation." />
          <GuideItem icon="sun" step="5" title="Weather forecast" text="Live, short-range forecast (today, 7 days, 16 days) from Open-Meteo. Press “Detect my location” to use your device's GPS/Wi-Fi location (your browser will ask permission once), or just pick a district instead. Shows rain chance, expected millimetres, and temperature for each day." />
          <GuideItem icon="compare" step="6" title="Scenario studio" text="Save multiple versions of your analysis — e.g. “small roof” vs “school building” — and compare their harvest, demand and tank size side by side as cards and a chart." />
          <GuideItem icon="folder" step="7" title="Reports & projects" text="Turns your current analysis into a clean printable report (use your browser's Print → Save as PDF). Also lets you export/import your whole workspace as JSON, export a calculation as CSV, and manage all saved projects in one table." />
          <GuideItem icon="spark" step="8" title="AI explanation" text="Optional. Press “Explain my results” to get a plain-language summary of your numbers from an AI model (Groq). Only works if the site owner has added a free GROQ_API_KEY — otherwise it tells you honestly that it's off, instead of faking a response." />
          <GuideItem icon="book" step="9" title="Science & method" text="Every formula used in the app, explained with worked examples, plus where the rainfall numbers come from and what their limits are." />
          <GuideItem icon="info" step="10" title="About" text="This page: what the project is for, an honest list of its current limitations, and this user guide." />
        </div>
      </section>

      <section className="about-limitations panel"><PanelTitle title="Current release: honest limits" subtitle="These are intentional product boundaries, not hidden features." /><div className="limitations-grid"><div><span className="limit-number">01</span><strong>Gridded data, not a rain gauge</strong><p>Rainfall comes from NASA POWER (MERRA-2 reanalysis) on a ~55 km × 69 km grid using an approximate district reference point. It is historical, not live or forecast, and can differ from your rooftop.</p></div><div><span className="limit-number">02</span><strong>No choropleth map</strong><p>Drawing shaded districts needs licensed boundary geometry, and one grid cell cannot honestly represent a whole district. The explorer uses a district index instead.</p></div><div><span className="limit-number">03</span><strong>Estimates, not engineering design</strong><p>Coefficients, losses, demand, and storage are assumptions. Validate with local professionals before building.</p></div><div><span className="limit-number">04</span><strong>No water-safety certification</strong><p>The app estimates volume only. It cannot inspect or certify collected water for any use.</p></div></div></section>
      <section className="about-footer-card"><div><span className="eyebrow">READY TO EXPLORE?</span><h2>Start with your roof. Add the data you trust.</h2></div><button className="button button-primary" onClick={() => goTo("calculator")}>Open calculator <Icon name="arrow" size={15} /></button></section>
    </>
  );

  return (
    <div className={`app-shell${darkMode ? " theme-dark" : ""}`} data-theme={darkMode ? "dark" : "light"}>
      {mobileNavOpen ? <button className="mobile-nav-backdrop" aria-label="Close navigation menu" onClick={() => setMobileNavOpen(false)} /> : null}
      <aside className={`sidebar${mobileNavOpen ? " sidebar-open" : ""}`}>
        <div className="brand-lockup"><div className="brand-symbol"><Icon name="drop" size={20} /></div><div className="brand-type"><strong>Intelligent</strong><span>RAINFALL</span></div><button className="sidebar-close icon-button" aria-label="Close menu" onClick={() => setMobileNavOpen(false)}><Icon name="close" size={18} /></button></div>
        <div className="sidebar-project"><span className="sidebar-project-dot" /><span>Bangladesh workspace</span><Icon name="chevron" size={13} /></div>
        <div className="nav-group-label">WORKSPACE</div>
        <nav className="main-nav" aria-label="Main navigation">{NAV_ITEMS.slice(0, 7).map((item) => <button key={item.id} className={`nav-item${activeSection === item.id ? " nav-item-active" : ""}`} onClick={() => goTo(item.id)}><span className="nav-icon"><Icon name={item.icon} size={18} /></span><span>{item.label}</span>{item.id === "reports" && savedProjects.length > 0 ? <span className="nav-count">{savedProjects.length}</span> : null}</button>)}</nav>
        <div className="nav-group-label nav-group-secondary">REFERENCE</div>
        <nav className="main-nav" aria-label="Reference navigation">{NAV_ITEMS.slice(7).map((item) => <button key={item.id} className={`nav-item${activeSection === item.id ? " nav-item-active" : ""}`} onClick={() => goTo(item.id)}><span className="nav-icon"><Icon name={item.icon} size={18} /></span><span>{item.label}</span></button>)}</nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-local-card"><div className="local-card-icon"><Icon name="shield" size={16} /></div><div><strong>Private by default</strong><span>Your work stays in this browser.</span></div><span className="local-status-dot" /></div>
        <div className="sidebar-footer"><span>INTELLIGENT RAINFALL</span><span>ESTIMATES · NOT GUARANTEES</span></div>
      </aside>
      <div className="app-main">
        <header className="topbar"><div className="topbar-left"><button className="mobile-menu-button icon-button" aria-label="Open navigation menu" onClick={() => setMobileNavOpen(true)}><Icon name="menu" size={20} /></button><div className="breadcrumb"><span>Workspace</span><Icon name="chevron" size={13} /><strong>{currentTitle}</strong></div></div><div className="topbar-right"><button className="data-status-chip" onClick={() => goTo("explorer")} title="Open rainfall data explorer"><span className={`top-status-dot${hasRainfallInput ? " top-status-entered" : ""}`} />{hasRainfallInput ? "Scenario data" : "No live data"}<Icon name="chevron" size={12} /></button><span className="topbar-divider" /><button className="icon-button theme-toggle" aria-label={darkMode ? "Switch to light theme" : "Switch to dark theme"} title={darkMode ? "Light mode" : "Dark mode"} onClick={() => setDarkMode((value) => !value)}><Icon name={darkMode ? "sun" : "moon"} size={18} /></button><button className="topbar-new-button" onClick={startNewScenario}><Icon name="plus" size={15} />New analysis</button></div></header>
        <main className="page-content" key={activeSection}>
          {activeSection === "overview" ? renderOverview() : null}
          {activeSection === "calculator" ? renderCalculator() : null}
          {activeSection === "storage" ? renderStorage() : null}
          {activeSection === "explorer" ? renderExplorer() : null}
          {activeSection === "forecast" ? renderForecast() : null}
          {activeSection === "scenarios" ? renderScenarios() : null}
          {activeSection === "reports" ? renderReports() : null}
          {activeSection === "insights" ? renderInsights() : null}
          {activeSection === "science" ? renderScience() : null}
          {activeSection === "about" ? renderAbout() : null}
          {storageWarning ? <div className="storage-warning"><Icon name="alert" size={16} /><span>Browser storage is unavailable or full. Export your work to keep a copy.</span><button onClick={() => setStorageWarning(false)} aria-label="Dismiss storage warning"><Icon name="close" size={14} /></button></div> : null}
        </main>
        <footer className="app-footer"><span>Intelligent Rainfall <span className="footer-dot">·</span> Evidence-led estimates for Bangladesh</span><span>Data entered here is not independently verified.</span></footer>
      </div>
      {notice ? <div className="toast" role="status"><span className="toast-mark"><Icon name="check" size={15} /></span>{notice}</div> : null}
    </div>
  );
}

function MetricCard({ icon, label, value, unit, tone, foot }: { icon: IconName; label: string; value: string; unit: string; tone: "green" | "aqua" | "blue" | "sand"; foot: string }) {
  return <article className="metric-card"><div className="metric-card-top"><span className={`metric-icon metric-${tone}`}><Icon name={icon} size={18} /></span><span className="metric-context">LIVE CALC</span></div><span className="metric-label">{label}</span><strong className="metric-value">{value}</strong><span className="metric-unit">{unit}</span><span className="metric-foot">{foot}</span></article>;
}

function RecommendationList({ recommendations, compact = false }: { recommendations: { title: string; body: string; icon: IconName; tone?: "caution" | "positive" }[]; compact?: boolean }) {
  if (!recommendations.length) return <div className="recommendation-empty">Add a rainfall input to generate scenario-specific planning notes.</div>;
  return <div className={`recommendation-list${compact ? " recommendation-compact" : ""}`}>{recommendations.map((item, index) => <div className={`recommendation-item${item.tone ? ` recommendation-${item.tone}` : ""}`} key={`${item.title}-${index}`}><span className="recommendation-icon"><Icon name={item.icon} size={16} /></span><div><strong>{item.title}</strong><p>{item.body}</p></div></div>)}</div>;
}

function BalanceStat({ label, value, tone }: { label: string; value: string; tone?: "warning" | "good" }) {
  return <div className={`balance-stat${tone ? ` balance-${tone}` : ""}`}><span>{label}</span><strong>{value}</strong></div>;
}

function StressCell({ label, value, caution = false }: { label: string; value: string; caution?: boolean }) {
  return <div className={`stress-cell${caution ? " stress-caution" : ""}`}><span>{label}</span><strong>{value}</strong></div>;
}

function SourceCard({ name, description, href, status }: { name: string; description: string; href: string; status: string }) {
  return <article className="source-card"><div className="source-card-head"><span className="source-mark"><Icon name="external" size={15} /></span><span className="source-status">{status}</span></div><h3>{name}</h3><p>{description}</p><a href={href} target="_blank" rel="noreferrer">Visit source <Icon name="arrow" size={13} /></a></article>;
}

function ProvenanceRow({ label, value }: { label: string; value: string }) {
  return <div className="provenance-row"><span>{label}</span><strong>{value}</strong></div>;
}

function InsightRow({ label, value }: { label: string; value: string }) {
  return <div className="insight-row"><span>{label}</span><strong>{value}</strong></div>;
}

function ReportMetric({ label, value }: { label: string; value: string }) {
  return <div className="report-metric"><span>{label}</span><strong>{value}</strong></div>;
}

function ReportRow({ label, value, note }: { label: string; value: string; note?: string }) {
  return <div className="report-row"><span>{label}</span><strong>{value}</strong>{note ? <small>{note}</small> : null}</div>;
}

function ScienceCard({ number, title, formula, body }: { number: string; title: string; formula: string; body: string }) {
  return <article className="science-card panel"><div className="science-card-top"><span>{number}</span><span className="science-card-line" /></div><h3>{title}</h3><code>{formula}</code><p>{body}</p></article>;
}

function DataCategory({ title, detail, category }: { title: string; detail: string; category: RainfallCategory }) {
  return <div className="data-category-row"><span className={`category-dot category-dot-${category}`} /><div><strong>{title}</strong><p>{detail}</p></div><span className={`category-tag category-${category}`}>{CATEGORY_SHORT[category]}</span></div>;
}

function AboutFeature({ icon, title, text }: { icon: IconName; title: string; text: string }) {
  return <article className="about-feature panel"><span className="about-feature-icon"><Icon name={icon} size={19} /></span><h3>{title}</h3><p>{text}</p></article>;
}

function GuideItem({ icon, step, title, text }: { icon: IconName; step: string; title: string; text: string }) {
  return (
    <div className="guide-item">
      <span className="guide-step">{step}</span>
      <span className="guide-icon"><Icon name={icon} size={17} /></span>
      <div><strong>{title}</strong><p>{text}</p></div>
    </div>
  );
}
