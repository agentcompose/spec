# Transport Binding

**Version:** 0.1.0 · **Status:** Draft

This document is normative. The key words **MUST**, **SHOULD**, **MAY**, etc. are
to be interpreted as in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).

AgentCompose binds its method catalog ([`openrpc.json`](../openrpc.json)) to
**JSON-RPC 2.0** over **HTTP(S)**, with **Server-Sent Events (SSE)** for streaming.

---

## 1. HTTP binding

- All requests are sent as HTTP `POST` to the agent's `endpoint`.
- The request body **MUST** be a single JSON-RPC 2.0 Request object validating
  against [`schemas/jsonrpc.json#/$defs/Request`](../schemas/jsonrpc.json).
- Request `Content-Type` **MUST** be `application/json`.
- **Batch requests are NOT supported** in 0.x. An array body **MUST** be rejected
  with JSON-RPC error `-32600` (Invalid Request).
- Unary responses **MUST** validate against `jsonrpc.json#/$defs/Response` and use
  `Content-Type: application/json`.
- **Idempotency.** When `tasks/submit` carries an `idempotencyKey`, an agent
  **MUST** deduplicate against tasks created within its `taskRetention` window,
  returning the existing task. This makes `submit` safe to retry on network
  failure.
- **Polling.** On a non-terminal `tasks/get` response an agent **SHOULD** include
  a `Retry-After` header (seconds) hinting when to poll next.

### 1.1 Method summary

| Method | Params schema | Result | Streaming |
|--------|---------------|--------|-----------|
| `tasks/submit` | `task-submit.json` | `task.json` | no |
| `tasks/get` | `task-ref.json` | `task.json` | no |
| `tasks/cancel` | `task-ref.json` | `task.json` | no |
| `tasks/provideInput` | `task-provide-input.json` | `task.json` | no |
| `tasks/subscribe` | `task-ref.json` | `task.json` (snapshot) | **yes (SSE)** |

---

## 2. Streaming (`tasks/subscribe`)

When a client calls `tasks/subscribe`, the agent **MUST** respond with HTTP status
`200` and `Content-Type: text/event-stream`.

### 2.1 Frame format

Each SSE message **MUST** carry, in its `data:` field, a JSON-RPC **Notification**
(validating against `jsonrpc.json#/$defs/Notification`) with:

- `method`: `"task/event"`
- `params`: a Task Event validating against
  [`schemas/event.json`](../schemas/event.json)

The SSE `event:` field **MUST** equal the event's `type` (`status`, `progress`,
`message`, `artifact`, `result`, `error`). Each message **MUST** include a
monotonically increasing `id:` field.

```
id: 1
event: status
data: {"jsonrpc":"2.0","method":"task/event","params":{"type":"status","taskId":"task_1","state":"working"}}

id: 2
event: progress
data: {"jsonrpc":"2.0","method":"task/event","params":{"type":"progress","taskId":"task_1","percent":40}}

id: 3
event: result
data: {"jsonrpc":"2.0","method":"task/event","params":{"type":"result","taskId":"task_1","result":{"parts":[{"kind":"text","text":"done"}]}}}
```

### 2.2 Ordering & termination

1. The first event in a stream **SHOULD** be a `status` event reflecting the
   current state.
2. Events for a task **MUST** be delivered in causal order.
3. The stream **MUST** terminate after emitting the event corresponding to a
   terminal state (`result` then a final `status: completed`, or `error` then
   `status: failed`, or `status: canceled`). The agent **SHOULD** close the
   connection after the terminal event.

### 2.3 Reconnection

- Clients **MAY** reconnect using the standard SSE `Last-Event-ID` header.
- On reconnection, the agent **SHOULD** resume after the given event id and
  **MUST NOT** replay events the client already acknowledged, except a fresh
  `status` snapshot which it **MAY** re-send.
- If the task already reached a terminal state, the agent **MUST** send the
  terminal event(s) and close.

### 2.4 Heartbeats

To keep connections alive, agents **MAY** emit SSE comment lines (`: ping`) at a
regular interval. Clients **MUST** ignore comment lines.

---

## 3. Errors

Method errors **MUST** be returned as JSON-RPC `ErrorResponse` objects. In a
stream, a task-level failure is delivered as an `error` event (not a transport
error). AgentCompose reserves codes `-32000`..`-32099`:

| Code | Name | Meaning |
|------|------|---------|
| -32000 | TaskNotFound | No task with the given id. |
| -32001 | CapabilityNotSupported | Requested capability is unknown. |
| -32002 | InvalidGoal | The goal could not be interpreted. |
| -32003 | AuthRequired | Authentication missing or invalid. |
| -32004 | RateLimited | Caller exceeded a rate limit. |
| -32005 | InvalidState | Operation not valid for the task's current state (e.g. provideInput when not input-required). |
| -32006 | UnsupportedVersion | The agent cannot serve the request under a compatible contract major version. |

Standard JSON-RPC codes (`-32600`..`-32603`, `-32700`) apply for protocol-level
errors.

---

## 4. Security

- Any non-`none` auth scheme **MUST** be carried over TLS.
- Bearer/API-key credentials **MUST** be sent via the `Authorization` header,
  never in the JSON-RPC body.
- Agents that fetch `FilePart.uri` artifacts **MUST** guard against SSRF
  (validate scheme/host, disallow internal addresses) — see the Security
  Considerations in [`specification.md`](./specification.md).
