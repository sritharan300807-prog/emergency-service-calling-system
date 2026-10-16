import { db } from '../db.js';

// Default sample location (Chennai, India) used for simulation mode.
export const DEFAULT_LOCATION = {
  latitude: 13.0827,
  longitude: 80.2707,
  label: 'Chennai, Tamil Nadu, India',
};

export interface ResolvedLocation {
  latitude: number | null;
  longitude: number | null;
  address: string | null;
}

// Optional reverse geocoding using OpenStreetMap Nominatim.
// Fails gracefully (returns null address) so the app never depends on it.
export async function reverseGeocode(
  latitude: number | null,
  longitude: number | null
): Promise<string | null> {
  if (latitude == null || longitude == null) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=16`,
      { signal: controller.signal, headers: { 'User-Agent': 'emergency-calling-system/1.0' } }
    );
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = (await res.json()) as { display_name?: string; name?: string };
    return data?.display_name || data?.name || null;
  } catch {
    return null;
  }
}

export function updateVehicleLocation(
  vehicleId: string,
  latitude: number | null,
  longitude: number | null
): void {
  db.prepare(
    `UPDATE vehicles
     SET latitude = ?, longitude = ?, location_updated_at = ?
     WHERE id = ?`
  ).run(latitude, longitude, new Date().toISOString(), vehicleId);
}

export function getVehicleLocation(vehicleId: string): ResolvedLocation {
  const row = db
    .prepare('SELECT latitude, longitude FROM vehicles WHERE id = ?')
    .get(vehicleId) as { latitude: number | null; longitude: number | null } | undefined;
  return {
    latitude: row?.latitude ?? null,
    longitude: row?.longitude ?? null,
    address: null,
  };
}
