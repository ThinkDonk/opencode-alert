import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isInQuietHours, resetThrottleState, shouldThrottle } from "./utils.js";

describe("isInQuietHours", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns false when disabled", () => {
    expect(
      isInQuietHours({ enabled: false, start: "00:00", end: "23:59" }),
    ).toBe(false);
  });

  it("returns true within overnight quiet hours (23:00 in 22:00-08:00)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T23:00:00"));
    expect(
      isInQuietHours({ enabled: true, start: "22:00", end: "08:00" }),
    ).toBe(true);
  });

  it("returns true within overnight quiet hours (02:00 in 22:00-08:00)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T02:00:00"));
    expect(
      isInQuietHours({ enabled: true, start: "22:00", end: "08:00" }),
    ).toBe(true);
  });

  it("returns false outside overnight quiet hours", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T14:00:00"));
    expect(
      isInQuietHours({ enabled: true, start: "22:00", end: "08:00" }),
    ).toBe(false);
  });

  it("returns true within same-day quiet hours", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T10:00:00"));
    expect(
      isInQuietHours({ enabled: true, start: "09:00", end: "17:00" }),
    ).toBe(true);
  });

  it("returns false outside same-day quiet hours", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T18:00:00"));
    expect(
      isInQuietHours({ enabled: true, start: "09:00", end: "17:00" }),
    ).toBe(false);
  });

  it("returns true at exact start of overnight range", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T22:00:00"));
    expect(
      isInQuietHours({ enabled: true, start: "22:00", end: "08:00" }),
    ).toBe(true);
  });

  it("returns false at exact end of overnight range", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T08:00:00"));
    expect(
      isInQuietHours({ enabled: true, start: "22:00", end: "08:00" }),
    ).toBe(false);
  });

  it("returns true at exact start of same-day range", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T09:00:00"));
    expect(
      isInQuietHours({ enabled: true, start: "09:00", end: "17:00" }),
    ).toBe(true);
  });

  it("returns false at exact end of same-day range", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T17:00:00"));
    expect(
      isInQuietHours({ enabled: true, start: "09:00", end: "17:00" }),
    ).toBe(false);
  });
});

describe("shouldThrottle", () => {
  beforeEach(() => {
    resetThrottleState();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns false on first call", () => {
    expect(shouldThrottle("first-call", 5)).toBe(false);
  });

  it("returns true if called again within minInterval seconds", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00"));
    shouldThrottle("throttle-test", 5);
    vi.setSystemTime(new Date("2024-01-01T00:00:02"));
    expect(shouldThrottle("throttle-test", 5)).toBe(true);
  });

  it("returns false after minInterval seconds have elapsed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00"));
    shouldThrottle("elapsed-test", 5);
    vi.setSystemTime(new Date("2024-01-01T00:00:06"));
    expect(shouldThrottle("elapsed-test", 5)).toBe(false);
  });

  it("different event types have independent throttle timers", () => {
    shouldThrottle("type-a", 10);
    expect(shouldThrottle("type-b", 10)).toBe(false);
  });

  it("allows call exactly at the interval boundary", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00"));
    shouldThrottle("boundary-test", 5);
    vi.setSystemTime(new Date("2024-01-01T00:00:05"));
    expect(shouldThrottle("boundary-test", 5)).toBe(false);
  });
});
