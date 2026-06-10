# Task Lifecycle

This document defines the normative state machine for an AgentCompose **Task**.

## States

| State | Terminal | Description |
|-------|----------|-------------|
| `submitted` | no | The agent has accepted the task but not begun work. |
| `working` | no | The agent is actively processing the task. |
| `input-required` | no | The agent paused and requires additional input to proceed. |
| `completed` | yes | Work finished successfully. `result` is present. |
| `failed` | yes | Work ended in error. `error` is present. |
| `canceled` | yes | Work stopped due to a cancellation request. |

## State machine

```mermaid
stateDiagram-v2
    [*] --> submitted: tasks/submit
    submitted --> working: agent starts
    submitted --> canceled: tasks/cancel
    working --> input-required: needs input
    working --> completed: success
    working --> failed: error
    working --> canceled: tasks/cancel
    input-required --> working: input provided
    input-required --> canceled: tasks/cancel
    completed --> [*]
    failed --> [*]
    canceled --> [*]
```

## Transition rules

1. A task **MUST** begin in `submitted`.
2. Only the transitions shown above are valid. Any other transition **MUST** be
   rejected by the agent and **MUST NOT** be emitted.
3. Terminal states (`completed`, `failed`, `canceled`) are final. After reaching a
   terminal state, an agent **MUST NOT** emit further status updates for that task.
4. On every transition the agent **MUST** emit a `status` event to active
   subscribers and update `updatedAt`.
5. `completed` **MUST** include `result`. `failed` **MUST** include `error`.
6. While in `working`, an agent **MAY** emit any number of `progress` and
   `artifact` events.
7. `tasks/cancel` is a *request*. An agent **SHOULD** transition to `canceled`
   promptly but **MAY** complete in-flight work first if cancellation is not
   safely possible; in that case it transitions to `completed`/`failed` instead.

## Events emitted per state

| Event | Valid in states |
|-------|-----------------|
| `status` | all transitions |
| `progress` | `working` |
| `artifact` | `working`, and once on `completed` |
| `result` | `completed` |
| `error` | `failed` |
