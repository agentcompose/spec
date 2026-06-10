// Validates every example in examples/ against the AgentCompose schemas.
// Usage: npm run validate
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const schemasDir = join(root, "schemas");
const examplesDir = join(root, "examples");

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

// Load every schema so $ref by $id resolves.
for (const file of readdirSync(schemasDir).filter((f) => f.endsWith(".json"))) {
  ajv.addSchema(JSON.parse(readFileSync(join(schemasDir, file), "utf8")));
}

// Map each example file to the schema $id it should satisfy.
const map = {
  "agent-descriptor.example.json": "https://agentcompose.dev/schemas/agent-descriptor.json",
  "task-submit.example.json": "https://agentcompose.dev/schemas/task-submit.json",
  "task.example.json": "https://agentcompose.dev/schemas/task.json",
  "event-progress.example.json": "https://agentcompose.dev/schemas/event.json"
};

let failed = 0;
for (const [file, schemaId] of Object.entries(map)) {
  const data = JSON.parse(readFileSync(join(examplesDir, file), "utf8"));
  const validate = ajv.getSchema(schemaId);
  if (!validate) {
    console.error(`✗ ${file}: schema ${schemaId} not found`);
    failed++;
    continue;
  }
  if (validate(data)) {
    console.log(`✓ ${file}`);
  } else {
    console.error(`✗ ${file}`);
    console.error(validate.errors);
    failed++;
  }
}

if (failed > 0) {
  console.error(`\n${failed} example(s) failed validation.`);
  process.exit(1);
}
console.log("\nAll examples valid.");
