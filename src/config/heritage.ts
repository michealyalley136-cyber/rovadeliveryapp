export const ghanaRegions = [
  "Greater Accra", "Ashanti", "Central", "Eastern", "Western", "Western North",
  "Volta", "Oti", "Northern", "Savannah", "North East", "Upper East", "Upper West",
  "Bono", "Bono East", "Ahafo",
] as const;
export type GhanaRegion = (typeof ghanaRegions)[number];
export type HeritageLandmark = {
  id: string;
  name: string;
  region: GhanaRegion;
  city?: string;
  image: string | null;
  enabled: boolean;
  description?: string;
  source: string;
  author: string;
  license: string;
  licenseUrl: string;
  modifications?: string;
};
export type HeritageCampaign = {
  landmarkId: string;
  start: string;
  end: string;
  kind: "featured" | "occasion";
  enabled: boolean;
};

// Images remain disabled until their local files and rights have been reviewed.
export const heritageLandmarks: readonly HeritageLandmark[] = [
  {
    id: "kwame-nkrumah-mausoleum", name: "Kwame Nkrumah Mausoleum", region: "Greater Accra", city: "Accra",
    image: null, enabled: false, source: "https://commons.wikimedia.org/wiki/File:Kwame_Nkrumah_Mausoleum_Memorial_Park.jpg",
    author: "WillCole29", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
  },
  {
    id: "independence-arch", name: "Independence Arch", region: "Greater Accra", city: "Accra",
    image: null, enabled: false, source: "https://commons.wikimedia.org/wiki/File:Independence_Arch_-_Accra,_Ghana1.jpg",
    author: "George Appiah", license: "CC BY 2.0", licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
  },
];
export const heritageCampaigns: readonly HeritageCampaign[] = [];

export function selectHeritageLandmark(
  landmarks: readonly HeritageLandmark[], campaigns: readonly HeritageCampaign[], date: string, region?: GhanaRegion,
) {
  const available = landmarks.filter((landmark) => landmark.enabled && landmark.image);
  for (const kind of ["featured", "occasion"] as const) {
    const campaign = campaigns.find((item) => item.enabled && item.kind === kind && item.start <= date && date <= item.end && available.some((landmark) => landmark.id === item.landmarkId));
    if (campaign) return available.find((landmark) => landmark.id === campaign.landmarkId) ?? null;
  }
  const regional = region ? available.filter((landmark) => landmark.region === region) : [];
  const candidates = regional.length ? regional : available;
  if (!candidates.length) return null;
  const day = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(day)) return candidates.find((landmark) => landmark.id === "kwame-nkrumah-mausoleum") ?? candidates[0];
  return candidates[Math.floor(day / 86400000) % candidates.length];
}

export function localDateAndHour(now: Date) {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Africa/Accra";
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}
