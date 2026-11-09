// Whether a learner may make a Refund Request for a purchase, and for how
// much. The course page uses this to decide whether to offer the form; the
// refund-request action uses it to decide whether to accept one. Both must
// agree, so the rules live here and nowhere else.

export const REFUND_WINDOW_DAYS = 14;
export const REFUND_WATCH_LIMIT_SECONDS = 2 * 60 * 60;
export const REFUND_COMPLETION_LIMIT = 0.5;

export enum RefundIneligibleReason {
  NoPurchase = "no_purchase",
  RequestAlreadyOpen = "request_already_open",
  ClaimedTeamSeat = "claimed_team_seat",
  WindowClosed = "window_closed",
  TooMuchCompleted = "too_much_completed",
  TooMuchWatched = "too_much_watched",
}

export const refundIneligibleMessages: Record<RefundIneligibleReason, string> =
  {
    [RefundIneligibleReason.NoPurchase]: "You have not bought this course.",
    [RefundIneligibleReason.RequestAlreadyOpen]:
      "You already have a refund request open for this course.",
    [RefundIneligibleReason.ClaimedTeamSeat]:
      "A claimed team seat can't be refunded.",
    [RefundIneligibleReason.WindowClosed]: `Your ${REFUND_WINDOW_DAYS}-day refund window has closed.`,
    [RefundIneligibleReason.TooMuchCompleted]:
      "You've completed too much of this course to request a refund.",
    [RefundIneligibleReason.TooMuchWatched]:
      "You've watched too much of this course to request a refund.",
  };

export interface RefundFacts {
  purchase: { createdAt: string; amountPaid: number } | null;
  hasOpenRequest: boolean;
  isClaimedTeamSeat: boolean;
  completedLessonCount: number;
  lessonCount: number;
  secondsWatched: number;
}

export type RefundEligibility =
  | { eligible: true; amount: number; lastDayOfRefundWindow: string }
  | { eligible: false; reason: RefundIneligibleReason };

// The window is counted in whole calendar days, not hours — someone who buys
// at 23:00 still gets the whole of their fourteenth day.
export function toCalendarDay(when: Date): string {
  const month = String(when.getMonth() + 1).padStart(2, "0");
  const day = String(when.getDate()).padStart(2, "0");
  return `${when.getFullYear()}-${month}-${day}`;
}

export function lastDayOfRefundWindow(purchasedAtIso: string): string {
  const deadline = new Date(purchasedAtIso);
  deadline.setDate(deadline.getDate() + REFUND_WINDOW_DAYS);
  return toCalendarDay(deadline);
}

export function checkRefundEligibility(
  facts: RefundFacts,
  now: Date = new Date()
): RefundEligibility {
  const { purchase } = facts;

  if (!purchase) {
    return { eligible: false, reason: RefundIneligibleReason.NoPurchase };
  }

  if (facts.hasOpenRequest) {
    return {
      eligible: false,
      reason: RefundIneligibleReason.RequestAlreadyOpen,
    };
  }

  // A seat that came out of a team licence, and has been claimed, belongs to
  // the team — the learner cannot hand it back on their own.
  if (facts.isClaimedTeamSeat) {
    return { eligible: false, reason: RefundIneligibleReason.ClaimedTeamSeat };
  }

  const today = toCalendarDay(now);
  const purchasedDay = toCalendarDay(new Date(purchase.createdAt));
  const lastDay = lastDayOfRefundWindow(purchase.createdAt);

  if (today < purchasedDay || today > lastDay) {
    return { eligible: false, reason: RefundIneligibleReason.WindowClosed };
  }

  if (
    facts.lessonCount > 0 &&
    facts.completedLessonCount / facts.lessonCount >= REFUND_COMPLETION_LIMIT
  ) {
    return { eligible: false, reason: RefundIneligibleReason.TooMuchCompleted };
  }

  if (facts.secondsWatched >= REFUND_WATCH_LIMIT_SECONDS) {
    return { eligible: false, reason: RefundIneligibleReason.TooMuchWatched };
  }

  // A Refund is always the amount the learner actually paid.
  return {
    eligible: true,
    amount: purchase.amountPaid,
    lastDayOfRefundWindow: lastDay,
  };
}
