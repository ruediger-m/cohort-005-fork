import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "~/db";
import {
  coupons,
  lessonProgress,
  lessons,
  LessonProgressStatus,
  modules,
  purchases,
  refundRequests,
  RefundRequestStatus,
  videoWatchEvents,
} from "~/db/schema";
import {
  checkRefundEligibility,
  RefundIneligibleReason,
  type RefundEligibility,
} from "./refund-eligibility";

function getLatestPurchase(userId: number, courseId: number) {
  return db
    .select()
    .from(purchases)
    .where(and(eq(purchases.userId, userId), eq(purchases.courseId, courseId)))
    .orderBy(sql`${purchases.createdAt} desc`)
    .get();
}

function getLessonIdsForCourse(courseId: number): number[] {
  return db
    .select({ id: lessons.id })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(eq(modules.courseId, courseId))
    .all()
    .map((row) => row.id);
}

function hasOpenRefundRequest(purchaseId: number) {
  const open = db
    .select({ id: refundRequests.id })
    .from(refundRequests)
    .where(
      and(
        eq(refundRequests.purchaseId, purchaseId),
        eq(refundRequests.status, RefundRequestStatus.Requested)
      )
    )
    .get();
  return open !== undefined;
}

function isClaimedTeamSeat(purchaseId: number) {
  const claimed = db
    .select({ id: coupons.id })
    .from(coupons)
    .where(and(eq(coupons.purchaseId, purchaseId), isNotNull(coupons.redeemedAt)))
    .get();
  return claimed !== undefined;
}

function getCompletedLessonCount(userId: number, lessonIds: number[]) {
  if (lessonIds.length === 0) return 0;

  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(lessonProgress)
    .where(
      and(
        eq(lessonProgress.userId, userId),
        eq(lessonProgress.status, LessonProgressStatus.Completed),
        inArray(lessonProgress.lessonId, lessonIds)
      )
    )
    .get();

  return result?.count ?? 0;
}

// Watched time is the furthest position reached in each lesson, summed.
function getSecondsWatched(userId: number, lessonIds: number[]) {
  if (lessonIds.length === 0) return 0;

  return db
    .select({
      furthest: sql<number>`max(${videoWatchEvents.positionSeconds})`,
    })
    .from(videoWatchEvents)
    .where(
      and(
        eq(videoWatchEvents.userId, userId),
        inArray(videoWatchEvents.lessonId, lessonIds)
      )
    )
    .groupBy(videoWatchEvents.lessonId)
    .all()
    .reduce((total, row) => total + row.furthest, 0);
}

/**
 * Looks up everything the refund rules need for this learner's latest
 * purchase of the course, and applies them.
 */
export function getRefundEligibility(
  userId: number,
  courseId: number
):
  | (Extract<RefundEligibility, { eligible: true }> & { purchaseId: number })
  | Extract<RefundEligibility, { eligible: false }> {
  const purchase = getLatestPurchase(userId, courseId);

  if (!purchase) {
    return { eligible: false, reason: RefundIneligibleReason.NoPurchase };
  }

  const lessonIds = getLessonIdsForCourse(courseId);

  const eligibility = checkRefundEligibility({
    purchase,
    hasOpenRequest: hasOpenRefundRequest(purchase.id),
    isClaimedTeamSeat: isClaimedTeamSeat(purchase.id),
    completedLessonCount: getCompletedLessonCount(userId, lessonIds),
    lessonCount: lessonIds.length,
    secondsWatched: getSecondsWatched(userId, lessonIds),
  });

  if (!eligibility.eligible) return eligibility;

  return { ...eligibility, purchaseId: purchase.id };
}
