/*
 * Turns a point on the map into a town name, then forgets the point.
 * Uses postcodes.io, a free public service built on Ordnance Survey and ONS open data.
 */

export type TownResolver = (lat: number, lng: number) => Promise<string | null>;

type PostcodesResult = {
  status: number;
  result:
    | {
        postcode: string;
        admin_ward: string | null;
        admin_district: string | null;
        parish: string | null;
        region: string | null;
        country: string;
      }[]
    | null;
};

/** "Selly Oak, Birmingham": the ward people say, then the district. */
export function townFromPostcodes(body: PostcodesResult): string | null {
  const first = body.result?.[0];
  if (!first) return null;
  const district = first.admin_district?.trim() || null;
  const ward = first.admin_ward?.trim() || null;
  if (ward && district && ward !== district && !/ward|central|& /i.test(ward)) return `${ward}, ${district}`;
  return district ?? ward ?? null;
}

/**
 * About a kilometre: enough to name the town, too coarse to point at a home.
 * The exact point never leaves the server.
 */
export function roughPoint(lat: number, lng: number): [number, number] {
  return [Math.round(lat * 100) / 100, Math.round(lng * 100) / 100];
}

export const postcodesTown: TownResolver = async (lat, lng) => {
  const [roughLat, roughLng] = roughPoint(lat, lng);
  const url = `https://api.postcodes.io/postcodes?lon=${encodeURIComponent(roughLng)}&lat=${encodeURIComponent(roughLat)}&limit=1&radius=2000`;
  // A slow lookup must not hold the person up: after 5 seconds the town is simply asked for instead.
  const response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(5000) });
  if (!response.ok) return null;
  return townFromPostcodes((await response.json()) as PostcodesResult);
};

/** Rough box around the UK, so a point in another country is not sent anywhere. */
export function inUk(lat: number, lng: number): boolean {
  return lat >= 49.8 && lat <= 60.95 && lng >= -8.7 && lng <= 1.8;
}
