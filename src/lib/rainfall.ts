export const DISTRICT_GROUPS = [
  { division: "Barishal", districts: ["Barguna", "Barishal", "Bhola", "Jhalokati", "Patuakhali", "Pirojpur"] },
  { division: "Chattogram", districts: ["Bandarban", "Brahmanbaria", "Chandpur", "Chattogram", "Cumilla", "Cox's Bazar", "Feni", "Khagrachhari", "Lakshmipur", "Noakhali", "Rangamati"] },
  { division: "Dhaka", districts: ["Dhaka", "Faridpur", "Gazipur", "Gopalganj", "Kishoreganj", "Madaripur", "Manikganj", "Munshiganj", "Narayanganj", "Narsingdi", "Rajbari", "Shariatpur", "Tangail"] },
  { division: "Khulna", districts: ["Bagerhat", "Chuadanga", "Jashore", "Jhenaidah", "Khulna", "Kushtia", "Magura", "Meherpur", "Narail", "Satkhira"] },
  { division: "Mymensingh", districts: ["Jamalpur", "Mymensingh", "Netrokona", "Sherpur"] },
  { division: "Rajshahi", districts: ["Bogura", "Chapainawabganj", "Joypurhat", "Naogaon", "Natore", "Pabna", "Rajshahi", "Sirajganj"] },
  { division: "Rangpur", districts: ["Dinajpur", "Gaibandha", "Kurigram", "Lalmonirhat", "Nilphamari", "Panchagarh", "Rangpur", "Thakurgaon"] },
  { division: "Sylhet", districts: ["Habiganj", "Moulvibazar", "Sunamganj", "Sylhet"] },
] as const;

export const DISTRICTS = DISTRICT_GROUPS.flatMap((group) => [...group.districts]);
export const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
export const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

export const ROOF_COEFFICIENTS = {
  concrete: 0.8,
  metal: 0.9,
  tiles: 0.75,
  other: 0.7,
} as const;

export type RoofType = keyof typeof ROOF_COEFFICIENTS;
export type RainfallPeriod = "annual" | "event";
export type RainfallOrigin = "user" | "imported" | "illustrative" | "api";
export type RainfallCategory = "measurement" | "historical-average" | "forecast" | "illustrative";

export type Scenario = {
  id: string;
  name: string;
  district: string;
  roofAreaM2: number;
  roofType: RoofType;
  runoffCoefficient: number;
  customCoefficient: boolean;
  collectionLossPercent: number;
  rainfallPeriod: RainfallPeriod;
  rainfallMm: number;
  rainfallOrigin: RainfallOrigin;
  rainfallSource: string;
  monthlyRainfallMm: (number | null)[] | null;
  householdMembers: number;
  demandPerPerson: number;
  additionalDailyDemand: number;
  tankCapacityLitres: number;
  startingStoragePercent: number;
  dryGapDays: number;
  targetBufferDays: number;
};

export type RainfallRecord = {
  id: string;
  district: string;
  period: string;
  rainfallMm: number;
  source: string;
  category: RainfallCategory;
  addedAt: string;
};

export type MonthlyBalance = {
  month: string;
  rainfallMm: number;
  inflow: number;
  demand: number;
  delivered: number;
  shortage: number;
  overflow: number;
  endingStorage: number;
};

export type StorageSimulation = {
  months: MonthlyBalance[];
  totalInflow: number;
  totalDemand: number;
  totalDelivered: number;
  totalShortage: number;
  totalOverflow: number;
  endingStorage: number;
};

export function createScenario(id: string, name = "Untitled analysis"): Scenario {
  return {
    id,
    name,
    district: "Dhaka",
    roofAreaM2: 100,
    roofType: "concrete",
    runoffCoefficient: ROOF_COEFFICIENTS.concrete,
    customCoefficient: false,
    collectionLossPercent: 10,
    rainfallPeriod: "annual",
    rainfallMm: 0,
    rainfallOrigin: "user",
    rainfallSource: "",
    monthlyRainfallMm: null,
    householdMembers: 4,
    demandPerPerson: 50,
    additionalDailyDemand: 0,
    tankCapacityLitres: 5000,
    startingStoragePercent: 0,
    dryGapDays: 7,
    targetBufferDays: 3,
  };
}

export function hasCompleteMonthlyRainfall(scenario: Scenario): boolean {
  return scenario.rainfallPeriod === "annual" && scenario.monthlyRainfallMm?.length === 12 &&
    scenario.monthlyRainfallMm.every((amount) => amount !== null && Number.isFinite(amount) && amount >= 0);
}

export function getRainfallTotal(scenario: Scenario): number {
  if (hasCompleteMonthlyRainfall(scenario)) {
    return scenario.monthlyRainfallMm!.reduce<number>((sum, amount) => sum + safeNonNegative(amount as number), 0);
  }
  return safeNonNegative(scenario.rainfallMm);
}

export function calculateHarvest(scenario: Scenario) {
  const area = safeNonNegative(scenario.roofAreaM2);
  const rainfall = getRainfallTotal(scenario);
  const coefficient = clamp(scenario.runoffCoefficient, 0, 1);
  const lossPercent = clamp(scenario.collectionLossPercent, 0, 100);
  const theoreticalLitres = area * rainfall * coefficient;
  const usableLitres = theoreticalLitres * (1 - lossPercent / 100);
  const collectionLossLitres = theoreticalLitres - usableLitres;
  const dailyDemandLitres =
    safeNonNegative(scenario.householdMembers) * safeNonNegative(scenario.demandPerPerson) +
    safeNonNegative(scenario.additionalDailyDemand);
  const annualDemandLitres = dailyDemandLitres * 365;
  const isAnnual = scenario.rainfallPeriod === "annual";

  return {
    rainfallMm: rainfall,
    theoreticalLitres,
    usableLitres,
    collectionLossLitres,
    dailyDemandLitres,
    annualDemandLitres,
    annualCoveragePercent: isAnnual && annualDemandLitres > 0 ? (usableLitres / annualDemandLitres) * 100 : null,
    averageDailyEquivalentLitres: isAnnual ? usableLitres / 365 : null,
    isAnnual,
  };
}

export function simulateMonthlyStorage(scenario: Scenario): StorageSimulation | null {
  if (!hasCompleteMonthlyRainfall(scenario) || !scenario.rainfallSource.trim()) return null;

  const capacity = safeNonNegative(scenario.tankCapacityLitres);
  const dailyDemand =
    safeNonNegative(scenario.householdMembers) * safeNonNegative(scenario.demandPerPerson) +
    safeNonNegative(scenario.additionalDailyDemand);
  const area = safeNonNegative(scenario.roofAreaM2);
  const coefficient = clamp(scenario.runoffCoefficient, 0, 1);
  const collectionFactor = 1 - clamp(scenario.collectionLossPercent, 0, 100) / 100;
  let storage = capacity * clamp(scenario.startingStoragePercent, 0, 100) / 100;
  const months: MonthlyBalance[] = MONTH_NAMES.map((month, index) => {
    const rainfallMm = safeNonNegative(scenario.monthlyRainfallMm?.[index] ?? 0);
    const inflow = rainfallMm * area * coefficient * collectionFactor;
    const demand = dailyDemand * MONTH_DAYS[index];
    const available = storage + inflow;
    const delivered = Math.min(demand, available);
    const shortage = Math.max(0, demand - available);
    const afterDemand = Math.max(0, available - demand);
    const overflow = Math.max(0, afterDemand - capacity);
    storage = Math.min(capacity, afterDemand);
    return { month, rainfallMm, inflow, demand, delivered, shortage, overflow, endingStorage: storage };
  });

  return {
    months,
    totalInflow: months.reduce((sum, month) => sum + month.inflow, 0),
    totalDemand: months.reduce((sum, month) => sum + month.demand, 0),
    totalDelivered: months.reduce((sum, month) => sum + month.delivered, 0),
    totalShortage: months.reduce((sum, month) => sum + month.shortage, 0),
    totalOverflow: months.reduce((sum, month) => sum + month.overflow, 0),
    endingStorage: storage,
  };
}

export function safeNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));
}
