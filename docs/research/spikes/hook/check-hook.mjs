// PostToolUse hook: read the hook input, "validate", fail with exit 2 so stderr reaches the model.
let input = ""; process.stdin.on("data", d => input += d).on("end", () => {
  const j = JSON.parse(input);
  const file = j.tool_input?.file_path ?? "";
  if (!file.endsWith("model.ts")) process.exit(0);
  console.error(`wb check failed for ${file.split("/").pop()}: INVARIANT top-shelf-left overlaps partition-left by 0.5 in on x`);
  process.exit(2);
});
