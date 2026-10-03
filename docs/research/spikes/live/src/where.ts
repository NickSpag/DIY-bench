import { parts } from "./model2.ts";
for (const p of parts) console.log(p.id, "->", p.src && `${p.src.file.split("/").slice(-2).join("/")}:${p.src.line}:${p.src.col}`);
