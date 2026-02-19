import { dateFromISO } from "./calc.js";

function lastDayOfMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function clampDay(year, monthIndex, day) {
  return Math.min(day, lastDayOfMonth(year, monthIndex));
}

function monthStart(year, monthIndex) {
  return new Date(year, monthIndex, 1);
}
function monthEndExclusive(year, monthIndex) {
  return new Date(year, monthIndex + 1, 1);
}

function isWithinMonth(date, year, monthIndex) {
  const s = monthStart(year, monthIndex).getTime();
  const e = monthEndExclusive(year, monthIndex).getTime();
  const t = date.getTime();
  return t >= s && t < e;
}

function isActiveInMonth(item, year, monthIndex) {
  const s = monthStart(year, monthIndex);
  const e = monthEndExclusive(year, monthIndex);

  const start = item.startDate ? dateFromISO(item.startDate) : null;
  const end = item.endDate ? dateFromISO(item.endDate) : null;

  const activeStart = start ?? new Date(-8640000000000000);
  const activeEndExclusive = end
    ? new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1)
    : new Date(8640000000000000);

  return activeStart < e && activeEndExclusive > s;
}

function payDateForMonth(year, monthIndex, payDayOrNull) {
  const d = payDayOrNull == null ? 1 : payDayOrNull;
  return new Date(year, monthIndex, clampDay(year, monthIndex, d));
}

/**
 * Returns array length 12: totals for each calendar month.
 * yearlyMode: "forecast" | "cashflow"
 */
export function calcYearByMonth(items, year, yearlyMode = "forecast") {
  const out = Array.from({ length: 12 }, () => 0);

  for (const it of items) {
    if (!it || typeof it.amount !== "number") continue;

    if (it.cycle === "one_time") {
      if (!it.payDate) continue;
      const d = dateFromISO(it.payDate);
      if (d.getFullYear() !== year) continue;
      out[d.getMonth()] += it.amount;
      continue;
    }

    // recurring
    for (let m = 0; m < 12; m++) {
      if (!isActiveInMonth(it, year, m)) continue;

      if (it.cycle === "monthly") {
        // counts if pay date is in that month (always true) - we just need active
        out[m] += it.amount;
      } else if (it.cycle === "yearly") {
        if (yearlyMode === "forecast") {
          out[m] += it.amount / 12;
        } else {
          // cashflow: pay once a year
          // MVP rule: pay in the month of startDate (or Jan if missing)
          const start = it.startDate ? dateFromISO(it.startDate) : new Date(year, 0, 1);
          const payMonth = start.getMonth();

          if (m === payMonth) {
            // additionally ensure pay date day exists (clamped)
            // (not used in total but keeps rule coherent)
            payDateForMonth(year, m, it.payDay);
            out[m] += it.amount;
          }
        }
      }
    }
  }

  return out;
}
