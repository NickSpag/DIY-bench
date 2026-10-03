import { build, params } from "./model.ts";
const p = { ...params, partitionHeight: Number(process.argv[2] ?? params.partitionHeight) };
for (const part of build(p)) console.log(part.id.padEnd(20), part.size.join(" x "));
