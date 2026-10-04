// Finding the running dev server and the viewer's state from Node (the CLI): .diy-bench/server.json
// is written by tools/vite-plugin.ts while the server runs; .diy-bench/state.json by the app.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ViewerState } from "../core/viewer.ts";
import { EXPIRED_MS } from "../core/viewer-text.ts";
import { stateDir } from "./files.ts";

export type ServerInfo = { url: string; pid: number; startedAt: string; token: string };

export const serverFile = (): string => join(stateDir(), "server.json");
export const stateFile = (): string => join(stateDir(), "state.json");

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** The dev server, when server.json names a live process that answers /__wb/health. */
export async function findServer(timeoutMs = 1500): Promise<ServerInfo | null> {
  const file = serverFile();
  if (!existsSync(file)) return null;
  let info: ServerInfo;
  try {
    info = JSON.parse(readFileSync(file, "utf8")) as ServerInfo;
  } catch {
    return null;
  }
  if (!info.url || !info.token || !Number.isInteger(info.pid) || !pidAlive(info.pid)) return null;
  try {
    const res = await fetch(`${info.url}/__wb/health`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
  } catch {
    return null;
  }
  return info;
}

/** The viewer state, or null when there is none or it is older than 24 h. */
export function readState(now = Date.now()): ViewerState | null {
  const file = stateFile();
  if (!existsSync(file)) return null;
  try {
    const s = JSON.parse(readFileSync(file, "utf8")) as ViewerState;
    if (s.version !== 1) return null;
    const at = Date.parse(s.updatedAt);
    if (!Number.isFinite(at) || now - at > EXPIRED_MS) return null;
    return s;
  } catch {
    return null;
  }
}
