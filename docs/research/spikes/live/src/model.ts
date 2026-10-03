// Spike model: a few closet parts as axis-aligned boxes.
// Axes: x from the left wall, y up from the floor, z out from the back wall. Inches.
export type Part = { id: string; name: string; at: [number, number, number]; size: [number, number, number] };

const T = 0.75;
export const params = { width: 80, depth: 24, partitionHeight: 84, leftX: 28, rightX: 51.25, topShelfDepth: 12 };

export function build(p = params): Part[] {
  return [
    { id: "partition-left", name: "Partition, left", at: [p.leftX, 0, 0], size: [T, p.partitionHeight, 23.25] },
    { id: "partition-right", name: "Partition, right", at: [p.rightX, 0, 0], size: [T, p.partitionHeight, 23.25] },
    { id: "top-shelf-left", name: "Top shelf, left", at: [0, p.partitionHeight, 0], size: [p.leftX, T, p.topShelfDepth] },
    { id: "top-shelf-center", name: "Top shelf, center", at: [p.leftX, p.partitionHeight, 0], size: [p.rightX + T - p.leftX, T, p.topShelfDepth] },
    { id: "top-shelf-right", name: "Top shelf, right", at: [p.rightX + T, p.partitionHeight, 0], size: [p.width - p.rightX - T, T, p.topShelfDepth] },
    { id: "center-shelf-fixed", name: "Center shelf at 70", at: [p.leftX + T, 70 - T, 0], size: [p.rightX - p.leftX - T, T, 23.25] },
  ];
}
export const parts = build();
