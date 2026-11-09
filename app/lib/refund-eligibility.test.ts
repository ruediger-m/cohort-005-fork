import { describe, it, expect } from "vitest";
import {
  checkRefundEligibility,
  RefundIneligibleReason,
  REFUND_WATCH_LIMIT_SECONDS,
  type RefundFacts,
} from "./refund-eligibility";

const purchasedAt = new Date(2026, 0, 1, 23, 0); // 1 Jan, 23:00 local time

function facts(overrides: Partial<RefundFacts> = {}): RefundFacts {
  return {
    purchase: { createdAt: purchasedAt.toISOString(), amountPaid: 4900 },
    hasOpenRequest: false,
    isClaimedTeamSeat: false,
    completedLessonCount: 0,
    lessonCount: 10,
    secondsWatched: 0,
    ...overrides,
  };
}

function reasonFor(f: RefundFacts, now = new Date(2026, 0, 2)) {
  const result = checkRefundEligibility(f, now);
  return result.eligible ? null : result.reason;
}

describe("checkRefundEligibility", () => {
  it("offers the amount actually paid, with the last day of the window", () => {
    expect(checkRefundEligibility(facts(), new Date(2026, 0, 2))).toEqual({
      eligible: true,
      amount: 4900,
      lastDayOfRefundWindow: "2026-01-15",
    });
  });

  it("keeps the window open for the whole fourteenth day", () => {
    expect(reasonFor(facts(), new Date(2026, 0, 15, 23, 59))).toBeNull();
  });

  it("closes the window on the fifteenth day", () => {
    expect(reasonFor(facts(), new Date(2026, 0, 16, 0, 1))).toBe(
      RefundIneligibleReason.WindowClosed
    );
  });

  it("refuses without a purchase", () => {
    expect(reasonFor(facts({ purchase: null }))).toBe(
      RefundIneligibleReason.NoPurchase
    );
  });

  it("refuses while a refund request is already open", () => {
    expect(reasonFor(facts({ hasOpenRequest: true }))).toBe(
      RefundIneligibleReason.RequestAlreadyOpen
    );
  });

  it("refuses a claimed team seat", () => {
    expect(reasonFor(facts({ isClaimedTeamSeat: true }))).toBe(
      RefundIneligibleReason.ClaimedTeamSeat
    );
  });

  it("refuses once half the lessons are completed", () => {
    expect(reasonFor(facts({ completedLessonCount: 4 }))).toBeNull();
    expect(reasonFor(facts({ completedLessonCount: 5 }))).toBe(
      RefundIneligibleReason.TooMuchCompleted
    );
  });

  it("refuses once the watch limit is reached", () => {
    expect(
      reasonFor(facts({ secondsWatched: REFUND_WATCH_LIMIT_SECONDS - 1 }))
    ).toBeNull();
    expect(
      reasonFor(facts({ secondsWatched: REFUND_WATCH_LIMIT_SECONDS }))
    ).toBe(RefundIneligibleReason.TooMuchWatched);
  });
});
