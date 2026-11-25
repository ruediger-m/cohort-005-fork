import { and, desc, eq } from "drizzle-orm";
import { courses, lessons, modules, notes } from "~/db/schema";
import type { Db } from "~/lib/comments.server";
import { MAX_NOTE_LENGTH, NOTE_TOO_LONG_MESSAGE } from "~/lib/notes";

// ─── Notes ───
// A Note is a Student's own plain-text writing about a Lesson, private to the
// Student who wrote it. See GLOSSARY.md. Nothing outside the owning Student's
// Lesson page and Saved page may read a Note body — no Instructor or Platform
// Admin view.
//
// Every function takes the database first, so tests can hand in an in-memory
// one. Content access is checked by the caller (the Lesson page action).

export function getNote(db: Db, userId: number, lessonId: number) {
  return db
    .select({ body: notes.body, updatedAt: notes.updatedAt })
    .from(notes)
    .where(and(eq(notes.userId, userId), eq(notes.lessonId, lessonId)))
    .get();
}

export type SaveNoteResult = { ok: true } | { ok: false; error: string };

/**
 * Creates the Student's Note on a Lesson, or replaces its body and moves
 * `updatedAt` on if one exists. `createdAt` is kept on a re-save. Saving an
 * empty box removes the Note, so the box is empty again next time. The upsert
 * on the (user, lesson) unique index keeps a race from creating a second Note.
 */
export function saveNote(
  db: Db,
  userId: number,
  lessonId: number,
  body: string,
  now: Date
): SaveNoteResult {
  const trimmed = body.trim();
  if (trimmed.length > MAX_NOTE_LENGTH) {
    return { ok: false, error: NOTE_TOO_LONG_MESSAGE };
  }

  if (trimmed.length === 0) {
    db.delete(notes)
      .where(and(eq(notes.userId, userId), eq(notes.lessonId, lessonId)))
      .run();
    return { ok: true };
  }

  const at = now.toISOString();
  db.insert(notes)
    .values({ userId, lessonId, body: trimmed, createdAt: at, updatedAt: at })
    .onConflictDoUpdate({
      target: [notes.userId, notes.lessonId],
      set: { body: trimmed, updatedAt: at },
    })
    .run();
  return { ok: true };
}

/** The Student's Notes, last edited first, each with its Lesson and Course. */
export function listNotes(db: Db, userId: number) {
  return db
    .select({
      id: notes.id,
      body: notes.body,
      updatedAt: notes.updatedAt,
      lessonId: lessons.id,
      lessonTitle: lessons.title,
      courseTitle: courses.title,
      courseSlug: courses.slug,
    })
    .from(notes)
    .innerJoin(lessons, eq(notes.lessonId, lessons.id))
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(eq(notes.userId, userId))
    .orderBy(desc(notes.updatedAt), desc(notes.id))
    .all();
}
