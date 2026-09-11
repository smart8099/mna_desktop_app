import { round2 } from "@/lib/money";

/**
 * Daily tuition rate for one Present day. Mirrors the SQL used by the Fees
 * screen (see `features/fees/api.ts`) so it can be unit-tested.
 *
 * @param dayOfWeek 0 = Sunday … 6 = Saturday
 */
export function tuitionRateForDay(
  dayOfWeek: number,
  isVacationDay: boolean,
  weekendRate: number,
  vacationRate: number,
): number {
  if (dayOfWeek === 0 || dayOfWeek === 6) return weekendRate;
  if ((dayOfWeek === 1 || dayOfWeek === 2 || dayOfWeek === 3) && isVacationDay) {
    return vacationRate;
  }
  return 0;
}

export function balance(due: number, paid: number): number {
  return round2((due || 0) - (paid || 0));
}

export type PaymentStatus = "paid" | "partial" | "unpaid";

export function paymentStatus(due: number, paid: number): PaymentStatus {
  if ((paid || 0) <= 0) return "unpaid";
  if ((paid || 0) >= (due || 0)) return "paid";
  return "partial";
}

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  paid: "Paid in full",
  partial: "Partly paid",
  unpaid: "Unpaid",
};

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function dayName(dayOfWeek: number): string {
  return DOW[dayOfWeek] ?? "";
}
