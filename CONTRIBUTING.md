# Contributing to the AgentCompose Specification

Thank you for helping shape AgentCompose. This repo is the **source of truth** for
the contract, so changes here ripple across SDKs, the runtime, and every agent.

## Principles

- The contract governs **interaction**, never an agent's internal implementation.
- Agents receive **goals, not instructions**.
- Keep the surface **minimal**. Prefer `extensions` over new core fields.

## How changes are proposed

1. **Open an issue** describing the problem and motivation.
2. For anything beyond wording, submit an **RFC-style PR** that updates both:
   - the relevant JSON Schema in [`schemas/`](./schemas), and
   - the normative prose in [`spec/`](./spec).
3. Add or update an example in [`examples/`](./examples) demonstrating the change.
4. Ensure `npm run validate` passes (all examples validate against the schemas).

## Versioning

Classify your change per [`VERSIONING.md`](./VERSIONING.md) and note the expected
version bump in your PR description.

## Local checks

```bash
npm install
npm run validate
```

## Schema conventions

- JSON Schema **draft 2020-12**.
- Every schema has a stable `$id` under `https://agentcompose.dev/schemas/`.
- Cross-references use absolute `$id` URIs.
- Prefer `additionalProperties: false` on closed objects; use `extensions` for
  open-ended data.
