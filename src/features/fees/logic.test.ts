import { describe, expect, it } from "vitest";
import { balance, dayName, paymentStatus, tuitionRateForDay } from "./logic";

const WEEKEND = 5;
const VACATION = 3;

describe("tuitionRateForDay", () => {
  it("charges the weekend rate on Saturday and Sunday regardless of vacation", () => {
    expect(tuitionRateForDay(6, false, WEEKEND, VACATION)).toBe(5);
    expect(tuitionRateForDay(0, true, WEEKEND, VACATION)).toBe(5);
  });
  it("charges the vacation rate on Mon–Wed only inside a vacation period", () => {
    expect(tuitionRateForDay(1, true, WEEKEND, VACATION)).toBe(3);
    expect(tuitionRateForDay(3, true, WEEKEND, VACATION)).toBe(3);
    expect(tuitionRateForDay(2, false, WEEKEND, VACATION)).toBe(0);
  });
  it("never charges Thursday or Friday", () => {
    expect(tuitionRateForDay(4, true, WEEKEND, VACATION)).toBe(0);
    expect(tuitionRateForDay(5, true, WEEKEND, VACATION)).toBe(0);
  });
});

describe("balance", () => {
  it("is due minus paid, rounded", () => {
    expect(balance(11, 5)).toBe(6);
    expect(balance(0.3, 0.1)).toBe(0.2);
    expect(balance(0, 0)).toBe(0);
  });
});

describe("dayName", () => {
  it("labels the day of week", () => {
    expect(dayName(0)).toBe("Sun");
    expect(dayName(6)).toBe("Sat");
  });
});

describe("paymentStatus", () => {
  it("is unpaid when nothing has been paid", () => {
    expect(paymentStatus(40, 0)).toBe("unpaid");
    expect(paymentStatus(0, 0)).toBe("unpaid");
  });
  it("is partial when some but not all is paid", () => {
    expect(paymentStatus(40, 20)).toBe("partial");
  });
  it("is paid when the due amount is met or exceeded", () => {
    expect(paymentStatus(40, 40)).toBe("paid");
    expect(paymentStatus(40, 50)).toBe("paid");
    expect(paymentStatus(0, 10)).toBe("paid");
  });
});
