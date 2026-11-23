interface FormatOptions {
  locale?: string;
}

const DEFAULT_LOCALE = "en-US";

const cache = new Map<string, Intl.NumberFormat | Intl.RelativeTimeFormat>();

function numberFormat(key: string, create: () => Intl.NumberFormat): Intl.NumberFormat {
  if (!cache.has(key)) {
    cache.set(key, create());
  }
  return cache.get(key) as Intl.NumberFormat;
}

export function formatPercent(
  ratio: number,
  options: FormatOptions & { decimals?: number; signed?: boolean } = {},
): string {
  const locale = options.locale ?? DEFAULT_LOCALE;
  const decimals = options.decimals ?? 1;
  const key = `percent|${locale}|${decimals}|${options.signed ? "s" : "u"}`;
  const format = numberFormat(
    key,
    () =>
      new Intl.NumberFormat(locale, {
        style: "percent",
        maximumFractionDigits: decimals,
        minimumFractionDigits: 0,
        signDisplay: options.signed ? "exceptZero" : "auto",
      }),
  );
  return format.format(ratio);
}

const RELATIVE_STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

export function formatRelative(
  value: string | Date,
  now: Date = new Date(),
  options: FormatOptions = {},
): string {
  const locale = options.locale ?? DEFAULT_LOCALE;
  const key = `relative|${locale}`;
  if (!cache.has(key)) {
    cache.set(key, new Intl.RelativeTimeFormat(locale, { numeric: "auto" }));
  }
  const format = cache.get(key) as Intl.RelativeTimeFormat;
  const seconds =
    ((typeof value === "string" ? new Date(value) : value).getTime() - now.getTime()) / 1000;
  for (const [unit, size] of RELATIVE_STEPS) {
    if (Math.abs(seconds) >= size) {
      return format.format(Math.round(seconds / size), unit);
    }
  }
  return format.format(0, "minute");
}

export function change(current: number, previous: number): number | null {
  if (previous === 0) {
    return current === 0 ? 0 : null;
  }
  return (current - previous) / Math.abs(previous);
}
