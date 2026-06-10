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
[`schemas/agent-descriptor.schema.json`](../schemas/agent-descriptor.schema.json).

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
against [`schemas/task-submit.schema.json`](../schemas/task-submit.schema.json).

A goal is a desired outcome, e.g.:

```text
Research the latest AI agent interoperability standards and summarize them.
```

An orchestrator **MUST NOT** require the agent to follow a prescribed procedure.

### 5.2 Task object

The agent responds with a **Task** object that validates against
[`schemas/task.schema.json`](../schemas/task.schema.json):

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

---

## 7. Transport binding

### 7.1 Protocol

The normative transport is **JSON-RPC 2.0** over **HTTP(S)**. Requests are
`POST`ed to the agent's `endpoint`.

### 7.2 Methods

| Method | Params | Result |
|--------|--------|--------|
| `tasks/submit` | goal + metadata | Task |
| `tasks/get` | `{ id }` | Task |
| `tasks/cancel` | `{ id }` | Task |
| `tasks/subscribe` | `{ id }` | event stream (SSE) |

### 7.3 Streaming

`tasks/subscribe` **MUST** be served as **Server-Sent Events**. Each event is a
JSON-RPC notification carrying one of: `status`, `progress`, `artifact`, `result`,
`error`. Streams **MUST** terminate after a terminal state.

### 7.4 Errors

Errors **MUST** use JSON-RPC error objects. AgentCompose reserves the range
`-32000`..`-32099` for protocol-level errors (defined in
[`schemas/error.schema.json`](../schemas/error.schema.json)).

---

## 8. Authentication

Agents **MAY** require authentication, declared in the descriptor's `auth` field.
Supported schemes in 0.x: `none`, `bearer`, `apiKey`, `oauth2`. Transport security
(TLS) is **REQUIRED** for any non-`none` scheme.

---

## 9. Extensibility

- All objects **MAY** carry an `extensions` object with namespaced, reverse-DNS
  keys. Consumers **MUST** ignore unknown extensions.
- New optional fields are backward-compatible (minor version).
- Removing/renaming fields or changing semantics is breaking (major version).

See [`VERSIONING.md`](../VERSIONING.md).

---

## 10. Conformance

An implementation is **conformant** if it:

1. Serves a valid Agent Descriptor.
2. Implements all required transport methods.
3. Produces payloads that validate against the published schemas.
4. Honors the task lifecycle transition rules.

Conformance test vectors live in [`examples/`](../examples).
