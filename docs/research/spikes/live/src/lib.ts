export type Src = { file: string; line: number; col: number };
export function callerSite(depth = 2): Src | null {
  const line = (new Error().stack ?? "").split("\n")[depth + 1] ?? "";
  const m = line.match(/\(?((?:file:\/\/)?[^()\s]+):(\d+):(\d+)\)?$/);
  return m ? { file: m[1].replace(/^file:\/\//, "").replace(/\?.*$/, ""), line: +m[2], col: +m[3] } : null;
}
type Size = [number, number, number];
export function panel(id: string, at: Size, size: Size) { return { id, at, size, src: callerSite() }; }
