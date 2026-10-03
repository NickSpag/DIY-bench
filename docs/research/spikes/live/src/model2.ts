import { panel } from "./lib.ts";

type Params = {
  width: number; // with a type annotation the line numbers must still match
  height: number;
};
const p: Params = { width: 80, height: 84 };

export const parts = [
  panel("partition-left", [28, 0, 0], [0.75, p.height, 23.25]),
  panel("partition-right", [51.25, 0, 0], [0.75, p.height, 23.25]),
];
