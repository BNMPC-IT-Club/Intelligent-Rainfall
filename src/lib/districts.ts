export type DistrictPoint = {
  name: string;
  division: string;
  /** Approximate reference point (district headquarters area), in decimal degrees. */
  latitude: number;
  longitude: number;
};

/**
 * Approximate reference coordinates for Bangladesh's 64 districts.
 *
 * These are used ONLY to query a gridded reanalysis product (NASA POWER,
 * ~0.5° x 0.625° cells). A gridded cell covers roughly 55 km x 69 km, so a
 * coordinate does not need to be survey-grade — but it is an approximation,
 * not an official geodetic centroid. Do not present these as authoritative
 * boundary data.
 */
export const DISTRICT_POINTS: DistrictPoint[] = [
  { name: "Barguna", division: "Barishal", latitude: 22.15, longitude: 90.12 },
  { name: "Barishal", division: "Barishal", latitude: 22.7, longitude: 90.37 },
  { name: "Bhola", division: "Barishal", latitude: 22.68, longitude: 90.65 },
  { name: "Jhalokati", division: "Barishal", latitude: 22.64, longitude: 90.2 },
  { name: "Patuakhali", division: "Barishal", latitude: 22.35, longitude: 90.33 },
  { name: "Pirojpur", division: "Barishal", latitude: 22.58, longitude: 89.97 },

  { name: "Bandarban", division: "Chattogram", latitude: 22.2, longitude: 92.22 },
  { name: "Brahmanbaria", division: "Chattogram", latitude: 23.96, longitude: 91.11 },
  { name: "Chandpur", division: "Chattogram", latitude: 23.23, longitude: 90.67 },
  { name: "Chattogram", division: "Chattogram", latitude: 22.34, longitude: 91.83 },
  { name: "Cumilla", division: "Chattogram", latitude: 23.46, longitude: 91.18 },
  { name: "Cox's Bazar", division: "Chattogram", latitude: 21.45, longitude: 92.0 },
  { name: "Feni", division: "Chattogram", latitude: 23.02, longitude: 91.4 },
  { name: "Khagrachhari", division: "Chattogram", latitude: 23.12, longitude: 91.97 },
  { name: "Lakshmipur", division: "Chattogram", latitude: 22.95, longitude: 90.83 },
  { name: "Noakhali", division: "Chattogram", latitude: 22.87, longitude: 91.1 },
  { name: "Rangamati", division: "Chattogram", latitude: 22.65, longitude: 92.17 },

  { name: "Dhaka", division: "Dhaka", latitude: 23.81, longitude: 90.41 },
  { name: "Faridpur", division: "Dhaka", latitude: 23.6, longitude: 89.84 },
  { name: "Gazipur", division: "Dhaka", latitude: 23.99, longitude: 90.42 },
  { name: "Gopalganj", division: "Dhaka", latitude: 23.01, longitude: 89.83 },
  { name: "Kishoreganj", division: "Dhaka", latitude: 24.44, longitude: 90.78 },
  { name: "Madaripur", division: "Dhaka", latitude: 23.17, longitude: 90.19 },
  { name: "Manikganj", division: "Dhaka", latitude: 23.86, longitude: 90.0 },
  { name: "Munshiganj", division: "Dhaka", latitude: 23.55, longitude: 90.53 },
  { name: "Narayanganj", division: "Dhaka", latitude: 23.62, longitude: 90.5 },
  { name: "Narsingdi", division: "Dhaka", latitude: 23.92, longitude: 90.72 },
  { name: "Rajbari", division: "Dhaka", latitude: 23.76, longitude: 89.64 },
  { name: "Shariatpur", division: "Dhaka", latitude: 23.21, longitude: 90.35 },
  { name: "Tangail", division: "Dhaka", latitude: 24.25, longitude: 89.92 },

  { name: "Bagerhat", division: "Khulna", latitude: 22.66, longitude: 89.79 },
  { name: "Chuadanga", division: "Khulna", latitude: 23.64, longitude: 88.86 },
  { name: "Jashore", division: "Khulna", latitude: 23.17, longitude: 89.21 },
  { name: "Jhenaidah", division: "Khulna", latitude: 23.54, longitude: 89.17 },
  { name: "Khulna", division: "Khulna", latitude: 22.82, longitude: 89.55 },
  { name: "Kushtia", division: "Khulna", latitude: 23.9, longitude: 89.12 },
  { name: "Magura", division: "Khulna", latitude: 23.49, longitude: 89.42 },
  { name: "Meherpur", division: "Khulna", latitude: 23.77, longitude: 88.63 },
  { name: "Narail", division: "Khulna", latitude: 23.16, longitude: 89.5 },
  { name: "Satkhira", division: "Khulna", latitude: 22.72, longitude: 89.07 },

  { name: "Jamalpur", division: "Mymensingh", latitude: 24.92, longitude: 89.95 },
  { name: "Mymensingh", division: "Mymensingh", latitude: 24.75, longitude: 90.4 },
  { name: "Netrokona", division: "Mymensingh", latitude: 24.88, longitude: 90.73 },
  { name: "Sherpur", division: "Mymensingh", latitude: 25.03, longitude: 90.02 },

  { name: "Bogura", division: "Rajshahi", latitude: 24.85, longitude: 89.37 },
  { name: "Chapainawabganj", division: "Rajshahi", latitude: 24.6, longitude: 88.27 },
  { name: "Joypurhat", division: "Rajshahi", latitude: 25.1, longitude: 89.03 },
  { name: "Naogaon", division: "Rajshahi", latitude: 24.82, longitude: 88.94 },
  { name: "Natore", division: "Rajshahi", latitude: 24.42, longitude: 89.0 },
  { name: "Pabna", division: "Rajshahi", latitude: 24.0, longitude: 89.24 },
  { name: "Rajshahi", division: "Rajshahi", latitude: 24.37, longitude: 88.6 },
  { name: "Sirajganj", division: "Rajshahi", latitude: 24.45, longitude: 89.7 },

  { name: "Dinajpur", division: "Rangpur", latitude: 25.63, longitude: 88.64 },
  { name: "Gaibandha", division: "Rangpur", latitude: 25.33, longitude: 89.53 },
  { name: "Kurigram", division: "Rangpur", latitude: 25.81, longitude: 89.65 },
  { name: "Lalmonirhat", division: "Rangpur", latitude: 25.92, longitude: 89.45 },
  { name: "Nilphamari", division: "Rangpur", latitude: 25.93, longitude: 88.85 },
  { name: "Panchagarh", division: "Rangpur", latitude: 26.34, longitude: 88.56 },
  { name: "Rangpur", division: "Rangpur", latitude: 25.75, longitude: 89.25 },
  { name: "Thakurgaon", division: "Rangpur", latitude: 26.03, longitude: 88.46 },

  { name: "Habiganj", division: "Sylhet", latitude: 24.38, longitude: 91.42 },
  { name: "Moulvibazar", division: "Sylhet", latitude: 24.48, longitude: 91.77 },
  { name: "Sunamganj", division: "Sylhet", latitude: 25.07, longitude: 91.4 },
  { name: "Sylhet", division: "Sylhet", latitude: 24.9, longitude: 91.87 },
];

export const DISTRICT_DIVISIONS = DISTRICT_POINTS.reduce<Record<string, string>>((acc, district) => {
  acc[district.name] = district.division;
  return acc;
}, {});

export function findDistrictPoint(name: string): DistrictPoint | undefined {
  const target = name.trim().toLowerCase();
  return DISTRICT_POINTS.find((district) => district.name.toLowerCase() === target);
}

/** Great-circle distance in kilometres (haversine formula). */
function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const earthRadiusKm = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const deltaLat = toRad(bLat - aLat);
  const deltaLon = toRad(bLon - aLon);
  const sinLat = Math.sin(deltaLat / 2);
  const sinLon = Math.sin(deltaLon / 2);
  const haversine = sinLat * sinLat + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * sinLon * sinLon;
  return 2 * earthRadiusKm * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

/** Finds the nearest district reference point to a given coordinate, with its distance in km. */
export function findNearestDistrict(latitude: number, longitude: number): { district: DistrictPoint; distanceKm: number } {
  let nearest = DISTRICT_POINTS[0];
  let nearestDistance = Infinity;
  for (const district of DISTRICT_POINTS) {
    const distance = distanceKm(latitude, longitude, district.latitude, district.longitude);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = district;
    }
  }
  return { district: nearest, distanceKm: nearestDistance };
}

/** Days in a given calendar month, honouring leap years. */
export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}
