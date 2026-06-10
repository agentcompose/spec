// Validates the AgentCompose schemas and example payloads.
//   1. Loads every schema (ajv compiles them -> structural self-validation).
//   2. Validates each positive example against its schema.
//   3. Runs negative cases that MUST be rejected.
// Usage: npm run validate
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const schemasDir = join(root, "schemas");
const examplesDir = join(root, "examples");
const B = "https://agentcompose.dev/schemas/";

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

// 1. Load + compile every schema.
let loaded = 0;
for (const file of readdirSync(schemasDir).filter((f) => f.endsWith(".json"))) {
  try {
    ajv.addSchema(JSON.parse(readFileSync(join(schemasDir, file), "utf8")));
    loaded++;
  } catch (e) {
    console.error(`✗ schema ${file} failed to load: ${e.message}`);
    process.exit(1);
  }
}
console.log(`Loaded ${loaded} schemas.`);

let failed = 0;
const get = (id) => {
  const v = ajv.getSchema(id);
  if (!v) { console.error(`✗ schema not found: ${id}`); failed++; }
  return v;
};

// 2. Positive examples: { file: schema $id (with optional #fragment) }.
const positives = {
  "agent-descriptor.example.json": B + "agent-descriptor.json",
  "agent-configure.example.json": B + "agent-configure.json",
  "task-submit.example.json": B + "task-submit.json",
  "task-submit-idempotent.example.json": B + "task-submit.json",
  "task.example.json": B + "task.json",
  "task-provide-input.example.json": B + "task-provide-input.json",
  "event-progress.example.json": B + "event.json",
  "event-message.example.json": B + "event.json",
  "event-status-input-required.example.json": B + "event.json",
  "auth-oauth2.example.json": B + "common.json#/$defs/AuthScheme",
  "jsonrpc-submit-request.example.json": B + "jsonrpc.json#/$defs/Request",
  "jsonrpc-task-response.example.json": B + "jsonrpc.json#/$defs/Response",
  "jsonrpc-error-response.example.json": B + "jsonrpc.json#/$defs/Response"
};

for (const [file, id] of Object.entries(positives)) {
  const validate = get(id);
  if (!validate) continue;
  const data = JSON.parse(readFileSync(join(examplesDir, file), "utf8"));
  if (validate(data)) {
    console.log(`✓ ${file}`);
  } else {
    console.error(`✗ ${file}`, validate.errors);
    failed++;
  }
}

// 3. Negative cases: these MUST be rejected by their schema.
const negatives = [
  { name: "task completed without result", id: B + "task.json",
    data: { id: "t", state: "completed", createdAt: "2026-06-10T00:00:00Z", updatedAt: "2026-06-10T00:00:00Z" } },
  { name: "task failed without error", id: B + "task.json",
    data: { id: "t", state: "failed", createdAt: "2026-06-10T00:00:00Z", updatedAt: "2026-06-10T00:00:00Z" } },
  { name: "jsonrpc request missing method", id: B + "jsonrpc.json#/$defs/Request",
    data: { jsonrpc: "2.0", id: "1" } },
  { name: "invalid task state", id: B + "task.json",
    data: { id: "t", state: "bogus", createdAt: "2026-06-10T00:00:00Z", updatedAt: "2026-06-10T00:00:00Z" } },
  { name: "provideInput with empty input", id: B + "task-provide-input.json",
    data: { id: "t", input: [] } },
  { name: "oauth2 auth without metadataUrl", id: B + "common.json#/$defs/AuthScheme",
    data: { type: "oauth2" } },
  { name: "secret ref without secretRef key", id: B + "config.json#/$defs/SecretRef",
    data: { value: "inline-secret" } },
  { name: "limits with negative budget", id: B + "config.json#/$defs/Limits",
    data: { maxBudgetUsd: -1 } },
  { name: "configure params missing config", id: B + "agent-configure.json",
    data: {} }
];

for (const { name, id, data } of negatives) {
  const validate = get(id);
  if (!validate) continue;
  if (!validate(data)) {
    console.log(`✓ (rejected) ${name}`);
  } else {
    console.error(`✗ negative case wrongly accepted: ${name}`);
    failed++;
  }
}

// 4. NDJSON stdio session: every line MUST be a valid JSON-RPC Message.
const msg = get(B + "jsonrpc.json#/$defs/Message");
if (msg) {
  const lines = readFileSync(join(examplesDir, "stdio-session.jsonl"), "utf8")
    .split("\n").filter((l) => l.trim().length > 0);
  let bad = 0;
  for (const [i, line] of lines.entries()) {
    if (!msg(JSON.parse(line))) { console.error(`✗ stdio-session line ${i + 1}`, msg.errors); bad++; }
  }
  if (bad === 0) console.log(`✓ stdio-session.jsonl (${lines.length} messages)`);
  failed += bad;
}

if (failed > 0) {
  console.error(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll checks passed.");
