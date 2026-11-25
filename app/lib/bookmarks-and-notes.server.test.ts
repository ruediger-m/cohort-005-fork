import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { UserRole } from "~/db/schema";
import { isBookmarked, listBookmarks, toggleBookmark } from "./bookmarks.server";
import { getNote, listNotes, saveNote } from "./notes.server";
import { MAX_NOTE_LENGTH } from "./notes";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date(2026, 9, 6, 12, 0, 0);
const LATER = new Date(2026, 9, 7, 9, 30, 0);
const LATEST = new Date(2026, 9, 8, 18, 0, 0);

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let lessonIds: number[];
let otherStudent: typeof schema.users.$inferSelect;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);

  const module = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Basics", position: 1 })
    .returning()
    .get();

  lessonIds = [1, 2, 3].map(
    (position) =>
      db
        .insert(schema.lessons)
        .values({ moduleId: module.id, title: `Lesson ${position}`, position })
        .returning()
        .get().id
  );

  otherStudent = db
    .insert(schema.users)
    .values({ name: "Liam", email: "liam@example.com", role: UserRole.Student })
    .returning()
    .get();
});

describe("toggling a Bookmark", () => {
  it("bookmarks a Lesson with no Bookmark, and un-bookmarks it on the next press", () => {
    expect(toggleBookmark(db, base.user.id, lessonIds[0], NOW)).toBe(true);
    expect(isBookmarked(db, base.user.id, lessonIds[0])).toBe(true);

    expect(toggleBookmark(db, base.user.id, lessonIds[0], LATER)).toBe(false);
    expect(isBookmarked(db, base.user.id, lessonIds[0])).toBe(false);
  });

  it("never leaves a Student with two Bookmarks on one Lesson", () => {
    toggleBookmark(db, base.user.id, lessonIds[0], NOW);
    toggleBookmark(db, base.user.id, lessonIds[0], NOW);
    toggleBookmark(db, base.user.id, lessonIds[0], NOW);

    expect(listBookmarks(db, base.user.id)).toHaveLength(1);
  });

  it("refuses a second Bookmark row at the database", () => {
    toggleBookmark(db, base.user.id, lessonIds[0], NOW);

    expect(() =>
      db
        .insert(schema.bookmarks)
        .values({ userId: base.user.id, lessonId: lessonIds[0] })
        .run()
    ).toThrow();
  });
});

describe("saving a Note", () => {
  it("creates a Note on a Lesson with none, trimmed", () => {
    const result = saveNote(db, base.user.id, lessonIds[0], "  Watch again  ", NOW);

    expect(result).toEqual({ ok: true });
    expect(getNote(db, base.user.id, lessonIds[0])).toEqual({
      body: "Watch again",
      updatedAt: NOW.toISOString(),
    });
  });

  it("replaces the body and moves the last edited time on when saved again", () => {
    saveNote(db, base.user.id, lessonIds[0], "First thought", NOW);
    saveNote(db, base.user.id, lessonIds[0], "Second thought", LATER);

    expect(getNote(db, base.user.id, lessonIds[0])).toEqual({
      body: "Second thought",
      updatedAt: LATER.toISOString(),
    });
    expect(listNotes(db, base.user.id)).toHaveLength(1);
  });

  it("refuses a second Note row at the database", () => {
    saveNote(db, base.user.id, lessonIds[0], "Mine", NOW);

    expect(() =>
      db
        .insert(schema.notes)
        .values({ userId: base.user.id, lessonId: lessonIds[0], body: "Again" })
        .run()
    ).toThrow();
  });

  it("accepts a Note of exactly 2,000 characters", () => {
    const body = "a".repeat(MAX_NOTE_LENGTH);

    expect(saveNote(db, base.user.id, lessonIds[0], body, NOW)).toEqual({ ok: true });
    expect(getNote(db, base.user.id, lessonIds[0])?.body).toBe(body);
  });

  it("refuses a Note over 2,000 characters and keeps the old one", () => {
    saveNote(db, base.user.id, lessonIds[0], "Keep me", NOW);

    const result = saveNote(
      db,
      base.user.id,
      lessonIds[0],
      "a".repeat(MAX_NOTE_LENGTH + 1),
      LATER
    );

    expect(result).toMatchObject({ ok: false });
    expect(getNote(db, base.user.id, lessonIds[0])?.body).toBe("Keep me");
  });

  it("removes the Note when saved empty", () => {
    saveNote(db, base.user.id, lessonIds[0], "Gone soon", NOW);
    saveNote(db, base.user.id, lessonIds[0], "   ", LATER);

    expect(getNote(db, base.user.id, lessonIds[0])).toBeUndefined();
  });
});

describe("the Saved lists", () => {
  it("lists only the Student's own Bookmarks, newest first, with Lesson and Course", () => {
    toggleBookmark(db, base.user.id, lessonIds[0], NOW);
    toggleBookmark(db, base.user.id, lessonIds[2], LATEST);
    toggleBookmark(db, base.user.id, lessonIds[1], LATER);
    toggleBookmark(db, otherStudent.id, lessonIds[0], LATEST);

    expect(listBookmarks(db, base.user.id)).toEqual([
      expect.objectContaining({ lessonId: lessonIds[2], lessonTitle: "Lesson 3" }),
      expect.objectContaining({ lessonId: lessonIds[1], lessonTitle: "Lesson 2" }),
      expect.objectContaining({
        lessonId: lessonIds[0],
        lessonTitle: "Lesson 1",
        courseTitle: "Test Course",
        courseSlug: "test-course",
      }),
    ]);
  });

  it("lists only the Student's own Notes, last edited first, with Lesson and Course", () => {
    saveNote(db, base.user.id, lessonIds[0], "One", NOW);
    saveNote(db, base.user.id, lessonIds[1], "Two", LATER);
    saveNote(db, base.user.id, lessonIds[0], "One, edited", LATEST);
    saveNote(db, otherStudent.id, lessonIds[2], "Not yours", LATEST);

    expect(listNotes(db, base.user.id)).toEqual([
      expect.objectContaining({
        body: "One, edited",
        lessonId: lessonIds[0],
        courseTitle: "Test Course",
        courseSlug: "test-course",
      }),
      expect.objectContaining({ body: "Two", lessonId: lessonIds[1] }),
    ]);
  });
});
