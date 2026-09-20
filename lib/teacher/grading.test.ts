import { describe, expect, it } from "vitest";
import { classSummary, reduce, scoreOf, splitPages, studentFromFile, toCsv, type PageGrade, type Submission } from "./grading";

const page = (studentName: string, statuses: PageGrade["problems"][number]["status"][]): PageGrade => ({
  studentName,
  problems: statuses.map((status, i) => ({ label: String(i + 1), status, note: status === "correct" ? "" : `slip on ${i + 1}` })),
  feedback: "Nice work.",
  marks: [],
});

const queued = (id: string, student: string): Submission => ({ id, student, pages: [], state: { kind: "queued" } });

function gradedClass(): Submission[] {
  let all = reduce([], { type: "add", submissions: [queued("a", "scan 01"), queued("b", "scan 02")] });
  all = reduce(all, { type: "graded", id: "a", pages: [page("Maria, L", ["correct", "partial", "wrong"])] });
  return reduce(all, { type: "graded", id: "b", pages: [page("", ["correct", "wrong", "correct"])] });
}

describe("grading", () => {
  it("scores correct as 1 and partial as a half", () => {
    expect(scoreOf(gradedClass()[0].state)).toEqual({ earned: 1.5, possible: 3 });
  });

  it("takes the name written on the page over the file name, and keeps the file name otherwise", () => {
    expect(gradedClass().map((s) => s.student)).toEqual(["Maria, L", "scan 02"]);
  });

  it("lets the teacher's override change the score, and undoes it when set back", () => {
    const overridden = reduce(gradedClass(), { type: "override", id: "a", problem: 2, status: "correct" });
    expect(scoreOf(overridden[0].state)).toEqual({ earned: 2.5, possible: 3 });
    const undone = reduce(overridden, { type: "override", id: "a", problem: 2, status: "wrong" });
    expect(undone[0].state).toMatchObject({ overrides: {} });
  });

  it("ranks the most-missed problems first with what went wrong", () => {
    expect(classSummary(gradedClass())).toEqual({
      graded: 2,
      average: 59,
      trouble: [
        { label: "2", missed: 2, of: 2, notes: ["slip on 2", "slip on 2"] },
        { label: "3", missed: 1, of: 2, notes: ["slip on 3"] },
      ],
    });
  });

  it("exports a gradebook with quoted commas", () => {
    expect(toCsv(gradedClass())).toBe(
      'Student,Score,Out of,Percent,Q1,Q2,Q3,Feedback\n"Maria, L",1.5,3,50,correct,partial,wrong,Nice work.\nscan 02,2,3,67,correct,wrong,correct,Nice work.',
    );
  });

  it("splits a stacked scan per student and reads a name from a file", () => {
    expect(splitPages([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(studentFromFile("period3_maria-lopez.pdf")).toBe("period3 maria lopez");
  });
});
