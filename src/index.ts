// Programmatic access to the AgentCompose contract: the canonical JSON Schemas
// as importable objects, plus helpers to look them up and register them with a
// JSON Schema validator (e.g. Ajv). The schemas in schemas/*.json are the source
// of truth; this module is how runtimes consume them.
import { schemas } from "./schemas.generated.ts";
import type { JSONSchema } from "./schemas.generated.ts";

export { schemas };
export type { JSONSchema };

/** The protocol version this contract describes (the `agentcomposeVersion`). */
export const AGENTCOMPOSE_VERSION = "0.1.0";

/** Base `$id` URI all canonical schemas live under. */
export const SCHEMA_BASE = "https://agentcompose.dev/schemas/";

/** Every canonical schema, as an array. */
export const schemaList: JSONSchema[] = Object.values(schemas);

/** Every canonical schema `$id`. */
export const schemaIds: string[] = Object.keys(schemas);

/**
 * Resolve a schema by full `$id` or by short name (`task-submit` or
 * `task-submit.json`). Returns `undefined` if there is no such schema.
 */
export function schemaFor(idOrName: string): JSONSchema | undefined {
  const direct = schemas[idOrName];
  if (direct) return direct;
  const name = idOrName.endsWith(".json") ? idOrName : `${idOrName}.json`;
  return schemas[`${SCHEMA_BASE}${name}`];
}

/** Minimal structural view of the bits of Ajv that {@link registerSchemas} uses. */
export interface SchemaSink {
  addSchema(schema: object): unknown;
  getSchema(id: string): unknown;
}

/**
 * Register every canonical schema with a validator instance so cross-`$ref`s
 * (e.g. a `Part` referenced from task-submit) resolve. Idempotent: a schema
 * already present (by `$id`) is skipped, so this is safe to call more than once
 * on the same instance.
 *
 * @example
 *   import Ajv from "ajv/dist/2020.js";
 *   import { registerSchemas, SCHEMA_BASE } from "@agentcompose/spec";
 *   const ajv = new Ajv({ strict: false });
 *   registerSchemas(ajv);
 *   const validate = ajv.getSchema(`${SCHEMA_BASE}task-submit.json`);
 */
export function registerSchemas(ajv: SchemaSink): void {
  for (const schema of schemaList) {
    const id = (schema as { $id?: unknown }).$id;
    if (typeof id === "string" && !ajv.getSchema(id)) ajv.addSchema(schema);
  }
}
