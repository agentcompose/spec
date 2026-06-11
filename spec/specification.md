# AgentCompose Specification

**Version:** 0.1.0  
**Status:** Draft  
**License:** Apache-2.0

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHALL NOT**,
**SHOULD**, **SHOULD NOT**, **RECOMMENDED**, **MAY**, and **OPTIONAL** in this
document are to be interpreted as described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).

---

## 1. Introduction

AgentCompose defines a contract that lets independently developed **autonomous
agents** be reused as **configurable components** and composed into larger
workflows by any compliant **orchestrator**.

An agent is a reusable component much like a container image or a Terraform
module: it ships with sensible **defaults** and exposes a set of **typed, declared
configuration knobs** a consumer sets when instantiating it. The contract governs
two surfaces:

- the **configuration surface** — how a component declares its knobs and how a
  consumer supplies values (§8, [`configuration.md`](./configuration.md)); and
- the **interaction surface** — how goals are submitted to a configured instance
  and results stream back (§5–§7).

The contract draws a deliberate line through the agent:

| Aspect | Status |
|--------|--------|
| **How the agent works inside** — planning, internal prompts, how it calls a model, sub-agents | **Private.** The contract does not constrain it. |
| **Its configurable surface** — model/provider, system-prompt additions, granted tools, context resources, limits | **Public, typed, declared.** Standardized by the contract. |

The agent's internals stay a black box; its configuration ports do not.

### 1.1 Design goals

1. **Reusability** — agents are configurable components, runnable as-is or tuned.
2. **Autonomy** — agents receive goals, not step-by-step instructions.
3. **Separation of concerns** — agents own *execution*; orchestrators own
   *coordination*.
4. **Composability** — configured instances can be assembled into workflows.
5. **Implementation agnosticism** — local or remote, OSS or proprietary, any
   language or framework, as long as the contract is honored.
6. **Extensibility** — the contract evolves without breaking existing agents.

### 1.2 Relationship to other standards

AgentCompose is complementary, not competitive:

- **MCP** governs an agent's access to *tools and resources*.
- **A2A** governs *message-level communication* between agents.
- **AgentCompose** governs *orchestration, composition, and the task lifecycle* of
  reusable agent components.

AgentCompose's transport binding intentionally reuses the JSON-RPC 2.0 + SSE family
common to these standards.

---

## 2. Roles

| Role | Definition |
|------|------------|
| **Agent** | A reusable, configurable component that accepts goals and performs work autonomously. |
| **Configured instance** | An agent component bound to a specific configuration, against which tasks run. |
| **Orchestrator** | A client that configures agents and composes them into workflows. |
| **Registry** | An OPTIONAL service that catalogs Agent Descriptors for discovery. |

An orchestrator MAY itself be exposed as an agent (recursive composition).

---

## 3. The Agent Descriptor

Every agent **MUST** publish an **Agent Descriptor**: machine-readable metadata
describing its identity and capabilities.

### 3.1 Discovery

An agent exposes its descriptor in a transport-appropriate way:

- **HTTP binding:** served at the well-known URI `GET /.well-known/agentcompose.json`.
- **stdio binding:** returned from the `agent/describe` method (there is no URL).

Agents **MAY** support the `agent/describe` method under any binding. The response
**MUST** validate against
[`schemas/agent-descriptor.json`](../schemas/agent-descriptor.json).

### 3.2 Required fields

| Field | Type | Description |
|-------|------|-------------|
| `agentcomposeVersion` | string | The contract version the agent implements (SemVer). |
| `id` | string | Stable, globally unique identifier (reverse-DNS RECOMMENDED). |
| `name` | string | Human-readable name. |
| `version` | string | The agent's own version (SemVer). |
| `capabilities` | Capability[] | One or more capabilities (see §4). |
| `endpoint` | string (URI) | Base URL for the HTTP binding. REQUIRED for HTTP; omitted for stdio-only agents. |

### 3.3 Optional fields

`description`, `provider`, `documentationUrl`, `iconUrl`, `auth` (see §9),
`taskRetention`, `configSchema` (see §8), `extensions` (free-form, namespaced).

---

## 4. Capabilities

A **Capability** declares a class of problems the agent can solve. Capabilities are
the unit on which orchestrators perform discovery and matching.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Stable capability identifier within the agent. |
| `description` | string | Natural-language description of what it solves. |
| `inputModes` | string[] | Accepted input content types (e.g. `text/plain`, `application/json`). |
| `outputModes` | string[] | Produced output content types. |
| `tags` | string[] | OPTIONAL discovery tags. |

Capabilities describe *what*, never *how*. An orchestrator **MUST NOT** assume any
internal behavior beyond the declared capability.

---

## 5. Tasks

A **Task** is a unit of work submitted toward a goal.

### 5.1 Submission

An orchestrator submits a task via the `tasks/submit` method. The request
**MUST** include a goal expressed as one or more input parts and **MUST** validate
against [`schemas/task-submit.json`](../schemas/task-submit.json).

A goal is a desired outcome, e.g.:

```text
Research the latest AI agent interoperability standards and summarize them.
```

An orchestrator **MUST NOT** require the agent to follow a prescribed procedure.

**Submission semantics.** `tasks/submit` **MUST** return a `Task`. Agents
**SHOULD** return promptly with state `submitted` or `working` and continue work
asynchronously; an agent **MAY** return a terminal state (`completed`/`failed`)
directly for work that finishes quickly. Clients **MUST** handle a `Task` in any
state on return.

**Idempotency.** A caller **MAY** include an `idempotencyKey`. If an agent
receives a `tasks/submit` whose key matches a task created within its retention
window (§6.1), it **MUST** return that existing task rather than creating a new
one. This makes `submit` safe to retry.

### 5.2 Task object

The agent responds with a **Task** object that validates against
[`schemas/task.json`](../schemas/task.json):

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Agent-assigned unique task identifier. |
| `state` | TaskState | Current lifecycle state (see §6). |
| `createdAt` | string (date-time) | Creation timestamp. |
| `updatedAt` | string (date-time) | Last update timestamp. |
| `result` | Result? | Present when terminal and successful. |
| `error` | Error? | Present when terminal and failed. |
| `artifacts` | Artifact[] | Outputs produced so far. |

> **`result` vs `artifacts` (consumption semantics).** The `result` is the canonical,
> composable output: a caller — including an orchestrator that feeds one agent's output
> into the next — consumes `result.parts`. `artifacts` are tangible byproducts surfaced
> for observability and human use and are **NOT guaranteed to be consumed** by a composing
> caller. Therefore: if a value is part of the answer (or a later agent needs it), it
> **MUST** be in `result.parts` — a file to hand onward is returned as a file `Part`
> (`Part`s are polymorphic: text, json, or file), **not** only as an artifact. A file
> deliverable simply *is* a file `Part`; there is no need to also emit it as an artifact.

---

## 6. Task lifecycle

A task moves through the states below. See
[`spec/lifecycle.md`](./lifecycle.md) for the full state machine and transition
rules.

| State | Terminal | Meaning |
|-------|----------|---------|
| `submitted` | no | Accepted, not yet started. |
| `working` | no | Actively being processed. |
| `input-required` | no | Paused; needs additional input from the caller. |
| `completed` | yes | Finished successfully; `result` present. |
| `failed` | yes | Finished with error; `error` present. |
| `canceled` | yes | Stopped on request. |

Agents **MUST** emit a status update on every state transition. Agents **MAY**
emit incremental progress and artifacts while in `working`.

### 6.1 Retention

After a task reaches a terminal state, the agent **MUST** keep it retrievable via
`tasks/get` for at least the number of seconds advertised in the descriptor's
`taskRetention` field (default: implementation-defined, **RECOMMENDED** ≥ 3600).
Once the window elapses, `tasks/get` **MAY** return `-32000 TaskNotFound`.

### 6.2 Retrieving results without streaming

Clients that do not subscribe **MAY** poll `tasks/get`. Agents **SHOULD** include
a `Retry-After` header hint on non-terminal responses. Streaming
(`tasks/subscribe`) is the **RECOMMENDED** path; polling is a fallback.

---

## 7. Transport bindings

The contract is defined over a **transport-neutral core**: the methods
([`openrpc.json`](../openrpc.json)), the JSON-RPC message shapes
([`schemas/jsonrpc.json`](../schemas/jsonrpc.json)), and the task lifecycle. A
**binding** specifies how those messages are framed and delivered over a concrete
channel. Two bindings are defined; both carry the **same** JSON-RPC messages and
schemas:

| Binding | Channel | Discovery | Streaming | Spec |
|---------|---------|-----------|-----------|------|
| **HTTP** | HTTP(S) POST + SSE | well-known URL | SSE stream | [`transport.md`](./transport.md) |
| **stdio** | child process stdin/stdout (NDJSON) | `agent/describe` | pushed notifications | [`transport-stdio.md`](./transport-stdio.md) |

An agent **MUST** implement at least one binding and **MAY** implement both.

### 7.1 Methods

The method catalog is identical across bindings:

| Method | Params | Result |
|--------|--------|--------|
| `agent/describe` | _(none)_ | Agent Descriptor |
| `agent/configure` | [`agent-configure.json`](../schemas/agent-configure.json) | Effective configuration |
| `tasks/submit` | [`task-submit.json`](../schemas/task-submit.json) | Task |
| `tasks/get` | [`task-ref.json`](../schemas/task-ref.json) | Task |
| `tasks/cancel` | [`task-ref.json`](../schemas/task-ref.json) | Task |
| `tasks/provideInput` | [`task-provide-input.json`](../schemas/task-provide-input.json) | Task |
| `tasks/subscribe` | [`task-ref.json`](../schemas/task-ref.json) | Task snapshot + event stream (HTTP binding) |

Task events (`status`, `progress`, `message`, `artifact`, `result`, `error`) are
delivered as JSON-RPC notifications with method `task/event` and params validating
against [`schemas/event.json`](../schemas/event.json). How they are *framed*
differs per binding (SSE vs. raw notifications); the payload is identical.

### 7.2 Resuming an input-required task

When a task enters `input-required`, the agent **SHOULD** describe the needed
input via the `message` field of the `status` event. The caller supplies it with
`tasks/provideInput`, which transitions the task back to `working`. Calling
`tasks/provideInput` on a task that is not in `input-required` **MUST** fail with
`-32005` (InvalidState).

### 7.3 Streaming events

Every binding delivers task events as `task/event` notifications. A `message`
event carries an incremental `delta` of the eventual result content (e.g. streamed
tokens); concatenating a task's `message` deltas **SHOULD** reconstruct the
streamed portion of the result. Event delivery **MUST** stop after a terminal
state.

- Under the **HTTP binding**, a client opens a stream with `tasks/subscribe` and
  receives SSE frames; see [`transport.md`](./transport.md).
- Under the **stdio binding**, the agent pushes `task/event` notifications on
  stdout for active tasks; see [`transport-stdio.md`](./transport-stdio.md).

### 7.4 Version negotiation

A client **SHOULD** read the descriptor's `agentcomposeVersion` before calling an
agent. If an agent receives a request it cannot serve under a compatible major
version, it **MUST** respond with `-32006 UnsupportedVersion`. Compatibility
follows [`VERSIONING.md`](../VERSIONING.md).

### 7.5 Errors

Errors **MUST** use JSON-RPC error objects. AgentCompose reserves the range
`-32000`..`-32099` for protocol-level errors (defined in
[`schemas/error.json`](../schemas/error.json) and tabulated in
[`spec/transport.md`](./transport.md)).

---

## 8. Configuration

Agents are **reusable components**: they ship with defaults and expose a typed,
declared configuration surface. A configurable agent **MUST** advertise a
`configSchema` (JSON Schema, draft 2020-12) in its descriptor, and a consumer
supplies values with the `agent/configure` method before submitting tasks.

The agent **MUST** validate supplied configuration against its `configSchema`,
**MUST** run on defaults when none is supplied, and **MUST** return
`-32007 InvalidConfiguration` on validation failure. Secret values **MUST** be
passed by reference (`SecretRef`), never inline, and **MUST NOT** be echoed back.

Well-known configuration keys (`provider`, `systemPrompt`, `sampling`, `tools`,
`resources`, `limits`) are shared shapes agents **SHOULD** reuse so tooling can
recognize them. The `provider` key supports both provider **selection** and
provider **injection** (bring-your-own-model). The full model — declaration,
supply, scope per binding, and conformance — is normative in
[`configuration.md`](./configuration.md).

---

## 9. Authentication

Agents **MAY** require authentication, declared in the descriptor's `auth` field.
Transport security (TLS) is **REQUIRED** for any non-`none` scheme. Credentials
**MUST** be sent in HTTP headers, never in the JSON-RPC body.

| Scheme | Mechanics |
|--------|-----------|
| `none` | No authentication. |
| `bearer` | Caller sends `Authorization: Bearer <token>`. |
| `apiKey` | Caller sends the key in the header named by `auth.name` (default `X-API-Key`). `auth.in` is `header` in 0.x. |
| `oauth2` | `auth.metadataUrl` points to the OAuth 2.0 Authorization Server Metadata (RFC 8414); `auth.scopes` lists required scopes. The caller obtains a token out of band and sends it as a bearer token. |

On missing or invalid credentials an agent **MUST** return `-32003 AuthRequired`.

---

## 10. Extensibility

- All objects **MAY** carry an `extensions` object with namespaced, reverse-DNS
  keys. Consumers **MUST** ignore unknown extensions.
- New optional fields are backward-compatible (minor version).
- Removing/renaming fields or changing semantics is breaking (major version).

See [`VERSIONING.md`](../VERSIONING.md).

---

## 11. Security considerations

- **Transport security.** Any non-`none` auth scheme **MUST** operate over TLS.
  Credentials **MUST** be carried in the `Authorization` header, never in the
  JSON-RPC body.
- **SSRF.** Agents (and orchestrators) that dereference a `FilePart.uri` **MUST**
  validate the URL scheme and host and **MUST** refuse internal/link-local
  addresses unless explicitly configured. Untrusted `uri` values are a
  server-side request forgery vector.
- **Untrusted content.** Goals, results, and artifacts may contain attacker-
  controlled data. Consumers **MUST NOT** execute artifact content and **SHOULD**
  treat all parts as untrusted input (prompt-injection aware).
- **Resource limits.** Agents **SHOULD** enforce size limits on inline `bytes`
  parts and apply rate limiting (`-32004`).
- **Authorization.** A valid task `id` **MUST NOT** be sufficient to access a
  task across tenants; agents **MUST** scope tasks to the authenticated caller.

---

## 12. Conformance

An implementation is **conformant** if it:

1. Serves a valid Agent Descriptor.
2. Implements all required transport methods, including `tasks/provideInput`
   whenever it can emit the `input-required` state.
3. If configurable, advertises a valid `configSchema`, validates supplied
   configuration, and returns `-32007` on failure (see [`configuration.md`](./configuration.md)).
4. Produces payloads that validate against the published schemas.
5. Honors the task lifecycle transition rules and the transport binding
   ([`spec/transport.md`](./transport.md)).

Conformance test vectors live in [`examples/`](../examples).
