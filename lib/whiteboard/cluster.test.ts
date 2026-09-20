/**
 * Cutting a page of drawings into one molecule each.
 *
 *   node --experimental-strip-types lib/whiteboard/cluster.test.ts
 */
import { clusterByGap } from "./cluster.ts";
import type { Bounds } from "./strokes.ts";

let pass = 0, total = 0;
function check(label: string, got: unknown, want: unknown) {
  total++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${ok ? "" : `   (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`}`);
}
const box = (minX: number, minY: number, maxX: number, maxY: number): Bounds => ({ minX, minY, maxX, maxY });

// 2-butanol: three zigzag bonds, a bond up to the label, and the "OH" a few px clear of it.
const butanol = [box(60, 150, 118, 200), box(118, 152, 178, 203), box(178, 150, 236, 203), box(117, 92, 121, 150), box(98, 56, 150, 84)];
// chlorobenzene, far to the right: ring, three inner lines, bond, label.
const ring = [box(497, 120, 624, 266), box(566, 138, 606, 162), box(513, 170, 513, 218), box(622, 126, 676, 157), box(682, 100, 730, 132)];

const members = (strokes: Bounds[]) => clusterByGap(strokes).map((c) => c.members);
check("one molecule, label included", members(butanol), [[0, 1, 2, 3, 4]]);
check("two molecules side by side", members([...butanol, ...ring]), [[0, 1, 2, 3, 4], [5, 6, 7, 8, 9]]);
check("drawing order does not matter", members([ring[0], butanol[0], ring[4], butanol[4], butanol[1], butanol[3], ring[3]]), [[1, 3, 4, 5], [0, 2, 6]]);
check("stacked vertically", members([...butanol, ...butanol.map((b) => ({ ...b, minY: b.minY + 300, maxY: b.maxY + 300 }))]).length, 2);
check("bounds cover the label", clusterByGap(butanol)[0].bounds, box(60, 56, 236, 203));
check("nothing drawn", clusterByGap([]), []);

console.log(`\n${pass}/${total} correct`);
if (pass !== total) process.exit(1);
