/**
 * Seasonal themes exist only around their occasion: from 3 weeks before the day until the
 * day itself (Tết: until mùng 7). Outside that period they are neither applied automatically
 * nor offered in Settings. Dates are in the viewer's local time.
 *
 *   Women's Day  15 Feb – 8 Mar
 *   Tết          21 days before mùng 1 – mùng 7
 *   Halloween    10 – 31 Oct
 *   Christmas     4 – 26 Dec
 */
const LEAD_DAYS = 21;

/** First day of Tết (Vietnamese Lunar New Year). Source: Wikipedia "Tết" zodiac table.
 *  Intl's Chinese calendar is not used: it differs from Vietnam's in some years (e.g. 2027). */
const TET = {
  2026: "02-17", 2027: "02-06", 2028: "01-26", 2029: "02-13", 2030: "02-02",
  2031: "01-23", 2032: "02-11", 2033: "01-31", 2034: "02-19", 2035: "02-08", 2036: "01-28",
};
const DAY = 86400000;

const dayNumber = (date) => Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY);
const fixed = (year, month, day) => Date.UTC(year, month - 1, day) / DAY;

function tetWindow(year) {
  const iso = TET[year];
  if (!iso) return null;
  const [m, d] = iso.split("-").map(Number);
  const newYear = fixed(year, m, d);
  return [newYear - LEAD_DAYS, newYear + 6];
}

/** Seasons running on `date`, in priority order (Tết first if it overlaps Women's Day).
 *  @returns {{ theme: string, id: string }[]}  id is unique per occurrence, e.g. "tet-2027" */
export function activeSeasons(date = new Date()) {
  const year = date.getFullYear(), today = dayNumber(date);
  const before = (month, day) => [fixed(year, month, day) - LEAD_DAYS, fixed(year, month, day)];
  const windows = [
    ["tet", tetWindow(year)],
    ["womensday", before(3, 8)],
    ["halloween", before(10, 31)],
    ["christmas", [fixed(year, 12, 25) - LEAD_DAYS, fixed(year, 12, 26)]],
  ];
  return windows
    .filter(([, range]) => range && today >= range[0] && today <= range[1])
    .map(([theme]) => ({ theme, id: `${theme}-${year}` }));
}

/** The season to apply automatically today, or null. */
export const seasonOn = (date = new Date()) => activeSeasons(date)[0] ?? null;

/** Is this seasonal theme available today? */
export const isInSeason = (theme, date = new Date()) => activeSeasons(date).some((s) => s.theme === theme);
