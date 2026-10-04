import { expect, test } from "vitest";
import { box } from "../../core/model/index.ts";
import { contains, cylinderBounds, extent, intersect, overlapAmounts, overlaps, projectBox, projectPoint } from "../../core/geometry.ts";

const A = box([0, 10], [0, 10], [0, 10]);

test("overlap needs positive volume on all three axes; touching faces do not overlap", () => {
  expect(overlaps(A, box([5, 15], [5, 15], [5, 15]))).toBe(true);
  expect(overlaps(A, box([10, 20], [0, 10], [0, 10]))).toBe(false);
  expect(overlaps(A, box([9.9999999, 20], [0, 10], [0, 10]))).toBe(false); // within the 1e-6 tolerance
  expect(overlapAmounts(A, box([5, 15], [8, 9], [-1, 2]))).toEqual([5, 1, 2]);
});

test("intersect, extent, contains", () => {
  expect(intersect(A, box([5, 15], [5, 15], [5, 15]))).toEqual(box([5, 10], [5, 10], [5, 10]));
  expect(intersect(A, box([10, 15], [5, 15], [5, 15]))).toBeNull();
  expect(extent([A, box([-1, 2], [3, 30], [4, 5])])).toEqual(box([-1, 10], [0, 30], [0, 10]));
  expect(extent([])).toBeNull();
  expect(contains(A, box([1, 2], [1, 2], [1, 2]))).toBe(true);
  expect(contains(A, box([1, 12], [1, 2], [1, 2]))).toBe(false);
});

test("cylinder bounds use the center on the other two axes in x, y, z order", () => {
  expect(cylinderBounds({ axis: "x", from: 1, to: 27, center: [81.5, 12], diameter: 2 })).toEqual(box([1, 27], [80.5, 82.5], [11, 13]));
  expect(cylinderBounds({ axis: "y", from: 0, to: 5, center: [3, 4], diameter: 1 })).toEqual(box([2.5, 3.5], [0, 5], [3.5, 4.5]));
});

test("view mapping: left parts stay left in the front elevation; the back wall is on the left in a +x section and at the top of the plan", () => {
  const leftBack = box([0, 1], [0, 1], [0, 1]);
  const rightFront = box([10, 11], [0, 1], [10, 11]);
  expect(projectBox(leftBack, "-z").u[1]).toBeLessThan(projectBox(rightFront, "-z").u[0]);
  expect(projectBox(leftBack, "+x").u[1]).toBeLessThan(projectBox(rightFront, "+x").u[0]);
  expect(projectBox(leftBack, "-y").v[0]).toBeGreaterThan(projectBox(rightFront, "-y").v[1]);
  expect(projectPoint([1, 2, 3], "+x")).toEqual([3, 2, -1]);
  // the nearer part has the larger depth
  expect(projectBox(rightFront, "-z").d[0]).toBeGreaterThan(projectBox(leftBack, "-z").d[1]);
});
