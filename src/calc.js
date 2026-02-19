function toDateOnly(d) {
  // local timezone date-only
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addMonths(date, months) {
  return new Date(date.getFullYear(), date.getMonth() + months, date.getDate());
}

function lastDayOfMonth(year, monthIndex) {
  // monthIndex: 0-11
  return new Date(year, monthIndex + 1, 0).getDate();
}

function clampDay(year, monthIndex, day) {
  return Math.min(day, lastDayOfMonth(year, monthIndex));
}

export function getMonthPeriod(containingDate, monthStartDay) {
  const d = toDateOnly(containingDate);
  const S = monthStartDay;

  const y = d.getFullYear();
  const m = d.getMonth();
  const day = d.getDate();

  let start;
  if (day >= S) start = new Date(y, m, S);
  else start = new Date(y, m - 1, S);

  const endExclusive = addMonths(start, 1);
  return { start, endExclusive };
}

export function dateFromISO(iso) {
  // iso: YYYY-MM-DD
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function isWithin(date, startInclusive, endExclusive) {
  const t = date.getTime();
  return t >= startInclusive.getTime() && t < endExclusive.getTime();
}

function isActiveInPeriod(item, periodStart, periodEndExclusive) {
  // For recurring items: active if overlap exists
  const start = item.startDate ? dateFromISO(item.startDate) : null;
  const end = item.endDate ? dateFromISO(item.endDate) : null;

  const activeStart = start ?? new Date(-8640000000000000);
  const activeEndExclusive = end ? new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1) : new Date(8640000000000000);

  // overlap check: [activeStart, activeEndExclusive) intersects [periodStart, periodEndExclusive)
  return activeStart < periodEndExclusive && activeEndExclusive > periodStart;
}

function getPayDateForMonth(year, monthIndex, payDayOrNull) {
  const effective = payDayOrNull == null ? 1 : payDayOrNull;
  const dd = clampDay(year, monthIndex, effective);
  return new Date(year, monthIndex, dd);
}

export function calcTotalThisPeriod(items, settings, now = new Date()) {
  const { start, endExclusive } = getMonthPeriod(now, settings.monthStartDay);
  const mode = settings.yearlyMode ?? "forecast";

  let sum = 0;

  for (const item of items) {
    if (!item || typeof item.amount !== "number") continue;

    if (item.cycle === "one_time") {
      if (!item.payDate) continue;
      const pay = dateFromISO(item.payDate);
      if (isWithin(pay, start, endExclusive)) sum += item.amount;
      continue;
    }

    // recurring: monthly/yearly
    if (!isActiveInPeriod(item, start, endExclusive)) continue;

    // Determine pay date that falls within this period (by calendar month)
    // Strategy: check pay dates for the two calendar months that can intersect the custom period.
    // (Because a custom month period can span two calendar months.)
    const candidates = [];
    const a = start; // period start date
    const b = new Date(endExclusive.getFullYear(), endExclusive.getMonth(), endExclusive.getDate() - 1); // last day in period
    candidates.push(getPayDateForMonth(a.getFullYear(), a.getMonth(), item.payDay));
    candidates.push(getPayDateForMonth(b.getFullYear(), b.getMonth(), item.payDay));

    const payInPeriod = candidates.some((pd) => isWithin(pd, start, endExclusive));

    if (!payInPeriod) continue;

    if (item.cycle === "monthly") {
      sum += item.amount;
    } else if (item.cycle === "yearly") {
      if (mode === "cashflow") sum += item.amount;
      else sum += item.amount / 12;
    }
  }

  return sum;
}
