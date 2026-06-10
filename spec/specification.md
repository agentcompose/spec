# AgentCompose Specification

**Version:** 0.1.0  
**Status:** Draft  
**License:** Apache-2.0

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHALL NOT**,
**SHOULD**, **SHOULD NOT**, **RECOMMENDED**, **MAY**, and **OPTIONAL** in this
document are to be interpreted as described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).

---

## 1. Introduction

AgentCompose defines a minimal, transport-bound contract that allows independently
developed **autonomous agents** to participate in larger workflows orchestrated by
any compliant **orchestrator**.

The contract deliberately governs only the **interaction surface** between agents
and orchestrators. It does **not** constrain an agent's internal implementation —
its models, prompts, memory, planning, tools, sub-agents, or execution strategy.

### 1.1 Design goals

1. **Autonomy** — agents receive goals, not step-by-step instructions.
2. **Separation of concerns** — agents own *execution*; orchestrators own
   *coordination*.
3. **Composability** — agents can be assembled into multi-step workflows.
4. **Implementation agnosticism** — local or remote, OSS or proprietary, any
   language or framework, as long as the contract is honored.
5. **Extensibility** — the contract evolves without breaking existing agents.

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
| **Agent** | A networked component that accepts goals and performs work autonomously. |
| **Orchestrator** | A client that discovers agents and composes them into workflows. |
| **Registry** | An OPTIONAL service that catalogs Agent Descriptors for discovery. |

An orchestrator MAY itself be exposed as an agent (recursive composition).

---

## 3. The Agent Descriptor

Every agent **MUST** publish an **Agent Descriptor**: machine-readable metadata
describing its identity and capabilities.

### 3.1 Discovery

An agent **SHOULD** serve its descriptor at the well-known URI:

```
GET /.well-known/agentcompose.json
```

The response **MUST** validate against
[`schemas/agent-descriptor.json`](../schemas/agent-descriptor.json).

### 3.2 Required fields

| Field | Type | Description |
|-------|------|-------------|
| `agentcomposeVersion` | string | The contract version the agent implements (SemVer). |
| `id` | string | Stable, globally unique identifier (reverse-DNS RECOMMENDED). |
| `name` | string | Human-readable name. |
| `version` | string | The agent's own version (SemVer). |
| `capabilities` | Capability[] | One or more capabilities (see §4). |
| `endpoint` | string (URI) | Base URL for the JSON-RPC transport. |

### 3.3 Optional fields

`description`, `provider`, `documentationUrl`, `iconUrl`, `auth` (see §7),
`extensions` (free-form, namespaced).

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

## 7. Transport binding

The transport binding is **JSON-RPC 2.0** over **HTTP(S)** with **Server-Sent
Events** for streaming. The method catalog is published as an OpenRPC document
([`openrpc.json`](../openrpc.json)); the full binding — request/response
envelopes, SSE frame format, ordering, reconnection, and heartbeats — is normative
in [`spec/transport.md`](./transport.md).

### 7.1 Protocol

Requests are single JSON-RPC 2.0 Request objects `POST`ed to the agent's
`endpoint`. Batch requests are **NOT** supported in 0.x. Envelopes validate
against [`schemas/jsonrpc.json`](../schemas/jsonrpc.json).

### 7.2 Methods

| Method | Params | Result |
|--------|--------|--------|
| `tasks/submit` | [`task-submit.json`](../schemas/task-submit.json) | Task |
| `tasks/get` | [`task-ref.json`](../schemas/task-ref.json) | Task |
| `tasks/cancel` | [`task-ref.json`](../schemas/task-ref.json) | Task |
| `tasks/provideInput` | [`task-provide-input.json`](../schemas/task-provide-input.json) | Task |
| `tasks/subscribe` | [`task-ref.json`](../schemas/task-ref.json) | Task snapshot + SSE event stream |

### 7.3 Resuming an input-required task

When a task enters `input-required`, the agent **SHOULD** describe the needed
input via the `message` field of the `status` event. The caller supplies it with
`tasks/provideInput`, which transitions the task back to `working`. Calling
`tasks/provideInput` on a task that is not in `input-required` **MUST** fail with
`-32005` (InvalidState).

### 7.4 Streaming

`tasks/subscribe` **MUST** be served as **Server-Sent Events**. Each event is a
JSON-RPC notification carrying one of: `status`, `progress`, `message`,
`artifact`, `result`, `error`. A `message` event carries an incremental `delta`
of the eventual result content (e.g. streamed tokens); concatenating a task's
`message` deltas **SHOULD** reconstruct the streamed portion of the result.
Streams **MUST** terminate after a terminal state. See
[`spec/transport.md`](./transport.md) for the frame format.

### 7.5 Version negotiation

A client **SHOULD** read the descriptor's `agentcomposeVersion` before calling an
agent. If an agent receives a request it cannot serve under a compatible major
version, it **MUST** respond with `-32006 UnsupportedVersion`. Compatibility
follows [`VERSIONING.md`](../VERSIONING.md).

### 7.6 Errors

Errors **MUST** use JSON-RPC error objects. AgentCompose reserves the range
`-32000`..`-32099` for protocol-level errors (defined in
[`schemas/error.json`](../schemas/error.json) and tabulated in
[`spec/transport.md`](./transport.md)).

---

## 8. Authentication

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

## 9. Extensibility

- All objects **MAY** carry an `extensions` object with namespaced, reverse-DNS
  keys. Consumers **MUST** ignore unknown extensions.
- New optional fields are backward-compatible (minor version).
- Removing/renaming fields or changing semantics is breaking (major version).

See [`VERSIONING.md`](../VERSIONING.md).

---

## 10. Security considerations

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

## 11. Conformance

An implementation is **conformant** if it:

1. Serves a valid Agent Descriptor.
2. Implements all required transport methods, including `tasks/provideInput`
   whenever it can emit the `input-required` state.
3. Produces payloads that validate against the published schemas.
4. Honors the task lifecycle transition rules and the transport binding
   ([`spec/transport.md`](./transport.md)).

Conformance test vectors live in [`examples/`](../examples).
