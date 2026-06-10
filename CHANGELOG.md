# Changelog

All notable changes to the AgentCompose contract are documented here. The format
is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this
project adheres to [Semantic Versioning](https://semver.org). See
[VERSIONING.md](./VERSIONING.md) for how changes are classified.

## [Unreleased]

### Added
- **Submission semantics**: `tasks/submit` always returns a Task; async by
  default, may return a terminal state for fast work (`specification.md` §5.1).
- **Idempotency**: optional `idempotencyKey` on `tasks/submit`; safe retries.
- **Task retention**: descriptor `taskRetention`; defined `tasks/get` window and
  polling guidance (`Retry-After`).
- **Version negotiation**: `-32006 UnsupportedVersion` and client-side version
  check against the descriptor.
- **Incremental result streaming**: `message` event carrying result `delta`
  chunks (streamed tokens).
- **Auth profiles**: concrete `bearer` / `apiKey` (header) / `oauth2`
  (`metadataUrl` + `scopes`) mechanics; `oauth2` requires `metadataUrl`.
- New examples (message delta, idempotent submit, oauth2 auth) and validation
  coverage incl. negative cases.

### Fixed
- Reserved error code `-32005` corrected to `InvalidState` (was mislabeled
  `Canceled` in `error.json`), consistent with the transport binding.

### Added (previously)
- JSON-RPC 2.0 envelope schemas (`schemas/jsonrpc.json`): Request, Notification,
  Success/Error Response.
- OpenRPC method catalog (`openrpc.json`) enumerating all agent methods.
- Normative transport binding (`spec/transport.md`): HTTP binding, SSE frame
  format, ordering & termination, reconnection (`Last-Event-ID`), heartbeats, and
  the reserved error-code table.
- `tasks/provideInput` method and `schemas/task-provide-input.json`, resolving the
  previously dead-ended `input-required` state.
- `task-ref.json` shared params schema for `tasks/get` / `cancel` / `subscribe`.
- Optional `message` on `StatusEvent` (describes needed input on `input-required`).
- Security Considerations section (TLS, SSRF, untrusted content, tenancy).
- Negative-case validation and JSON-RPC envelope coverage in `scripts/validate.mjs`.
- GitHub Actions CI running validation on every push and pull request.

## [0.1.0] - 2026-06-10

### Added
- Initial AgentCompose specification: concepts, agent descriptor, capabilities,
  tasks, and the task lifecycle state machine.
- Core JSON Schemas (descriptor, capability, task, task-submit, artifact, result,
  error, event, common).
- Validated examples and `scripts/validate.mjs`.
- Apache-2.0 license + NOTICE, VERSIONING, CONTRIBUTING.
