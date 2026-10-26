/**
 * Seasonal themes and when they switch on automatically (dates in the viewer's local time).
 *
 *   Women's Day  7–8 March
 *   Tết          from 23 tháng Chạp (7 days before) to mùng 7 (6 days after) Lunar New Year
 *   Halloween    24–31 October
 *   Christmas    18–26 December
 */

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
  return [newYear - 7, newYear + 6];
}

/** @returns {{ theme: string, id: string } | null}  id is unique per occurrence, e.g. "tet-2027" */
export function seasonOn(date = new Date()) {
  const year = date.getFullYear(), today = dayNumber(date);
  const windows = [
    ["womensday", [fixed(year, 3, 7), fixed(year, 3, 8)]],
    ["tet", tetWindow(year)],
    ["halloween", [fixed(year, 10, 24), fixed(year, 10, 31)]],
    ["christmas", [fixed(year, 12, 18), fixed(year, 12, 26)]],
  ];
  for (const [theme, range] of windows) {
    if (range && today >= range[0] && today <= range[1]) return { theme, id: `${theme}-${year}` };
  }
  return null;
}
