/**
 * Ontario's annual rent increase guideline (RTA s.120(1), published in the
 * Ontario Gazette by August 31 of the preceding year per s.120(3)).
 *
 * Source: https://www.ontario.ca/page/residential-rent-increases (verified 2026-08-17).
 * The Ministry publishes next year's guideline every August — add the new
 * year here when it's announced. Do not guess a future year's value.
 */
export const RENT_INCREASE_GUIDELINES: Record<number, number> = {
  2018: 1.8,
  2019: 1.8,
  2020: 2.2,
  2021: 0,
  2022: 1.2,
  2023: 2.5,
  2024: 2.5,
  2025: 2.5,
  2026: 2.1,
  2027: 1.9,
};

const KNOWN_YEARS = Object.keys(RENT_INCREASE_GUIDELINES).map(Number);
export const EARLIEST_GUIDELINE_YEAR = Math.min(...KNOWN_YEARS);
export const LATEST_GUIDELINE_YEAR = Math.max(...KNOWN_YEARS);

export interface GuidelineLookup {
  year: number;
  percent: number;
  /** True when `year` fell outside the known table and we fell back to the nearest known year. */
  isEstimate: boolean;
}

/**
 * Looks up the guideline percentage for a calendar year. Years before the
 * table are clamped to the earliest known value; years after it (the
 * guideline for next year isn't published yet) fall back to the latest
 * known value and are flagged as an estimate so callers can warn the user.
 */
export function getGuidelineForYear(year: number): GuidelineLookup {
  if (year in RENT_INCREASE_GUIDELINES) {
    return { year, percent: RENT_INCREASE_GUIDELINES[year], isEstimate: false };
  }
  const clampedYear = Math.min(Math.max(year, EARLIEST_GUIDELINE_YEAR), LATEST_GUIDELINE_YEAR);
  return {
    year: clampedYear,
    percent: RENT_INCREASE_GUIDELINES[clampedYear],
    isEstimate: true,
  };
}
