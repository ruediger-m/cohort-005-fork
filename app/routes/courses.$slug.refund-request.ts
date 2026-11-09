import { data, redirect } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/courses.$slug.refund-request";
import { getCurrentUserId } from "~/lib/session";
import { db } from "~/db";
import {
  courses,
  refundRequests,
  users,
  RefundRequestStatus,
} from "~/db/schema";
import { eq } from "drizzle-orm";
import { parseFormData, parseParams } from "~/lib/validation";
import { formatPrice } from "~/lib/utils";
import {
  RefundIneligibleReason,
  refundIneligibleMessages,
} from "~/lib/refund-eligibility";
import { getRefundEligibility } from "~/lib/refund-eligibility.server";

const refundRequestParamsSchema = z.object({
  slug: z.string().min(1),
});

const refundRequestActionSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, "Tell us a little more about why you'd like a refund.")
    .max(1000, "Please keep your reason under 1000 characters."),
});

const ineligibleStatus: Record<RefundIneligibleReason, number> = {
  [RefundIneligibleReason.NoPurchase]: 403,
  [RefundIneligibleReason.RequestAlreadyOpen]: 409,
  [RefundIneligibleReason.ClaimedTeamSeat]: 403,
  [RefundIneligibleReason.WindowClosed]: 403,
  [RefundIneligibleReason.TooMuchCompleted]: 403,
  [RefundIneligibleReason.TooMuchWatched]: 403,
};

/**
 * The confirmation the learner gets in their inbox. There is no mail
 * transport wired up yet, so the built message goes to the server log.
 */
function buildRefundRequestReceivedEmail(input: {
  learnerName: string;
  learnerEmail: string;
  courseTitle: string;
  amount: number;
}) {
  return {
    to: input.learnerEmail,
    subject: `Refund request received: ${input.courseTitle}`,
    body: [
      `Hi ${input.learnerName},`,
      "",
      `We've received your refund request for "${input.courseTitle}".`,
      `If it's approved, we'll refund ${formatPrice(input.amount)}, the amount you paid, and your access to the course will end.`,
      "",
      "Our team reviews every request by hand. You do not need to do anything else — we'll email you again once it's decided.",
      "",
      "— The Cadence team",
    ].join("\n"),
  };
}

export async function action({ params, request }: Route.ActionArgs) {
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data("You must be logged in to request a refund.", { status: 401 });
  }

  const { slug } = parseParams(params, refundRequestParamsSchema);
  const course = db
    .select()
    .from(courses)
    .where(eq(courses.slug, slug))
    .get();

  if (!course) {
    throw data("Course not found", { status: 404 });
  }

  const learner = db
    .select()
    .from(users)
    .where(eq(users.id, currentUserId))
    .get();

  if (!learner) {
    throw data("User not found", { status: 404 });
  }

  const eligibility = getRefundEligibility(
    currentUserId,
    course.id
  );

  if (!eligibility.eligible) {
    throw data(refundIneligibleMessages[eligibility.reason], {
      status: ineligibleStatus[eligibility.reason],
    });
  }

  const formData = await request.formData();
  const parsed = parseFormData(formData, refundRequestActionSchema);

  if (!parsed.success) {
    return data({ errors: parsed.errors }, { status: 400 });
  }

  db.insert(refundRequests)
    .values({
      purchaseId: eligibility.purchaseId,
      status: RefundRequestStatus.Requested,
      reason: parsed.data.reason,
    })
    .run();

  const email = buildRefundRequestReceivedEmail({
    learnerName: learner.name,
    learnerEmail: learner.email,
    courseTitle: course.title,
    amount: eligibility.amount,
  });

  console.log(
    `[email] to=${email.to} subject=${email.subject}\n${email.body}`
  );

  return redirect("/settings");
}
