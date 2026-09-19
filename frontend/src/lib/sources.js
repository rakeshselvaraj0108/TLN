export let SERIES_COLORS = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
  "var(--series-5)",
];
let SOURCE_COLORS = {
  cdr: "var(--series-1)",
  bank: "var(--series-2)",
  ipdr: "var(--series-3)",
  social: "var(--series-4)",
  alpr: "var(--series-5)",
};
let SOURCE_LABELS = {
  cdr: "Call records",
  bank: "Bank transactions",
  ipdr: "Internet sessions",
  social: "Social posts",
  alpr: "Vehicle sightings",
};
export let SOURCE_TYPE_LABELS = {
  cdr: "CDR",
  bank: "Bank statements",
  ipdr: "IPDR",
  social: "Social media",
  alpr: "ANPR / ALPR",
};
let BAND_COLORS = {
  low: "var(--band-low)",
  elevated: "var(--band-elevated)",
  high: "var(--band-high)",
};
let BAND_LABELS = {
  low: "Low",
  elevated: "Needs review",
  high: "Priority",
};
export let RISK_BANDS = ["high", "elevated", "low"];
export function sourceColor(e) {
  let n = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
  return SOURCE_COLORS[e] ?? SERIES_COLORS[n % SERIES_COLORS.length];
}
export function sourceLabel(e) {
  return SOURCE_LABELS[e] ?? e;
}
export function bandColor(e) {
  return BAND_COLORS[e] ?? "var(--series-1)";
}
export function bandLabel(e) {
  return BAND_LABELS[e] ?? e;
}
