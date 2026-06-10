# Changelog

All notable changes to the AgentCompose contract are documented here. The format
is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this
project adheres to [Semantic Versioning](https://semver.org). See
[VERSIONING.md](./VERSIONING.md) for how changes are classified.

## [0.1.1] - 2026-06-10

### Added
- The package is now **importable at runtime**: `@agentcompose/spec` ships a
  compiled entry exporting the canonical schemas as objects (`schemas`,
  `schemaList`, `schemaIds`), a `schemaFor(idOrName)` lookup, `registerSchemas(ajv)`
  to load them (with cross-`$ref`s) into a validator, and `SCHEMA_BASE` /
  `AGENTCOMPOSE_VERSION` constants. The JSON files remain available under the
  `./schemas/*` subpath. No contract/schema changes.

## [0.1.0] - 2026-06-10

First release of the AgentCompose contract: a language-neutral, schema-first
protocol for configuring autonomous agents as **reusable components** and
composing them.

### Component model
- Agents are **reusable, configurable components**: internals stay private; the
  **configuration surface** (model/provider, system prompt, tools, resources,
  limits) is public, typed, and declared. Component → configured instance → tasks.

### Configuration
- `configSchema` on the descriptor (JSON Schema + `default`s) declares accepted
  configuration; `agent/configure` supplies values, validated, returning the
  effective config (secrets redacted) or `-32007 InvalidConfiguration`.
- Well-known config vocabulary (`schemas/config.json`): `Provider` (selection and
  bring-your-own-model injection), `SystemPrompt`, `Sampling`, `ToolGrant`,
  `ResourceRef`, `Limits`, and `SecretRef` (secrets by reference, never inline).
- Normative `spec/configuration.md`; instantiation lifecycle and per-binding
  config delivery (stdio: `agent/configure` after spawn, secrets via env).

### Core model
- Concepts, agent descriptor, capabilities, tasks, and the task lifecycle state
  machine (`submitted`, `working`, `input-required`, `completed`, `failed`,
  `canceled`).
- JSON Schemas: descriptor, capability, task, task-submit, task-ref, task-provide-input,
  artifact, result, error, event, common, config, agent-configure, and JSON-RPC
  envelopes (`jsonrpc.json`, including the `Message` union).

### Methods
- `agent/describe`, `agent/configure`, `tasks/submit`, `tasks/get`,
  `tasks/cancel`, `tasks/provideInput`, `tasks/subscribe`, published as an OpenRPC
  catalog (`openrpc.json`).
- `tasks/submit` always returns a Task; async by default, may return a terminal
  state for fast work. Optional `idempotencyKey` makes submission safe to retry.
- `tasks/provideInput` resolves the `input-required` state.

### Transport
- **Transport-neutral core** with two pluggable bindings carrying identical
  JSON-RPC messages:
  - **HTTP** (`spec/transport.md`): JSON-RPC over HTTP(S), SSE streaming with
    ordering/termination, reconnection (`Last-Event-ID`), heartbeats, and the
    reserved error-code table.
  - **stdio** (`spec/transport-stdio.md`): local child process over NDJSON on
    stdin/stdout, `agent/describe` discovery, pushed `task/event` notifications,
    stdin-EOF shutdown. Enables local and polyglot composition with no network.
- Incremental result streaming via `message` events carrying result `delta` chunks.
- Task retention (`taskRetention`) with `tasks/get` polling guidance (`Retry-After`).
- Version negotiation via `-32006 UnsupportedVersion`.

### Authentication
- Schemes `none` / `bearer` / `apiKey` (header) / `oauth2` (`metadataUrl` +
  `scopes`, per RFC 8414); credentials in HTTP headers, TLS required for non-`none`.

### Governance & tooling
- Apache-2.0 license + NOTICE, VERSIONING, CONTRIBUTING.
- Validated examples and `scripts/validate.mjs` (positive, negative, and NDJSON
  cases); GitHub Actions CI on every push and pull request.
- Security Considerations (TLS, SSRF, untrusted content, tenancy).
