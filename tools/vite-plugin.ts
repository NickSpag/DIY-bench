// diyBenchPlugin(): the dev-server side of DIY-bench (section 11.2 of the spec).
// - writes .diy-bench/server.json ({ url, pid, startedAt, token }) while the server runs;
// - POST /__wb/state  (the app; same origin only) → .diy-bench/state.json, written atomically;
// - GET  /__wb/state  (the CLI and hooks) → the last state, or 404;
// - GET  /__wb/health → { ok, projects }.
// The app needs the repo's absolute path for vscode:// links and for mapping stack frames,
// so it is defined as __WB_ROOT__.
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin, ViteDevServer } from "vite";
import { listProjectIds } from "./projects.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const STATE_DIR = join(ROOT, ".diy-bench");
const STATE_FILE = join(STATE_DIR, "state.json");
const SERVER_FILE = join(STATE_DIR, "server.json");
const MAX_BODY = 1 << 20;

/** Writes a file atomically: a temporary file in the same folder, then a rename. */
export function writeAtomic(file: string, text: string): void {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, file);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function send(res: ServerResponse, status: number, body?: unknown): void {
  res.statusCode = status;
  if (body === undefined) {
    res.end();
    return;
  }
  res.setHeader("content-type", "application/json");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

/** The origins the server itself is reachable at (its own pages post from one of these). */
function ownOrigins(server: ViteDevServer): Set<string> {
  const out = new Set<string>();
  const addr = server.httpServer?.address();
  if (addr && typeof addr === "object") {
    out.add(`http://127.0.0.1:${addr.port}`);
    out.add(`http://localhost:${addr.port}`);
  }
  for (const u of server.resolvedUrls?.local ?? []) out.add(new URL(u).origin);
  return out;
}

export function diyBenchPlugin(): Plugin {
  let token = "";
  return {
    name: "diy-bench",
    config() {
      return { define: { __WB_ROOT__: JSON.stringify(ROOT) } };
    },
    configureServer(server) {
      token = randomBytes(16).toString("hex");
      const writeServerFile = () => {
        const url = server.resolvedUrls?.local[0]?.replace(/\/$/, "") ?? "";
        writeAtomic(SERVER_FILE, JSON.stringify({ url, pid: process.pid, startedAt: new Date().toISOString(), token }, null, 2) + "\n");
      };
      server.httpServer?.once("listening", () => setTimeout(writeServerFile, 0));
      const removeServerFile = () => {
        try {
          const cur = JSON.parse(readFileSync(SERVER_FILE, "utf8")) as { token?: string };
          if (cur.token === token) rmSync(SERVER_FILE);
        } catch {
          // already gone
        }
      };
      server.httpServer?.once("close", removeServerFile);
      process.once("exit", removeServerFile);

      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? "";
        if (!url.startsWith("/__wb/")) return next();
        const path = url.split("?")[0];
        try {
          if (path === "/__wb/health" && req.method === "GET") {
            return send(res, 200, { ok: true, projects: listProjectIds() });
          }
          if (path === "/__wb/state" && req.method === "GET") {
            if (!existsSync(STATE_FILE)) return send(res, 404, { error: "no state yet" });
            res.setHeader("content-type", "application/json");
            res.setHeader("cache-control", "no-store");
            res.end(readFileSync(STATE_FILE, "utf8"));
            return;
          }
          if (path === "/__wb/state" && req.method === "POST") {
            const origin = req.headers.origin;
            if (!origin || !ownOrigins(server).has(origin)) return send(res, 403, { error: "foreign origin" });
            const body = await readBody(req);
            let state: unknown;
            try {
              state = JSON.parse(body);
            } catch {
              return send(res, 400, { error: "invalid JSON" });
            }
            if (!state || typeof state !== "object" || (state as { version?: unknown }).version !== 1) {
              return send(res, 400, { error: "expected a ViewerState with version 1" });
            }
            writeAtomic(STATE_FILE, JSON.stringify(state, null, 2) + "\n");
            return send(res, 204);
          }
          return send(res, 404, { error: `no endpoint ${req.method} ${path}` });
        } catch (e) {
          return send(res, 500, { error: (e as Error).message });
        }
      });
    },
  };
}
