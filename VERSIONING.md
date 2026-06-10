# Versioning & Compatibility Policy

The AgentCompose contract is versioned with [Semantic Versioning](https://semver.org).
Agents advertise the contract version they implement via the
`agentcomposeVersion` field in their [Agent Descriptor](./schemas/agent-descriptor.json).

## What the version covers

The version applies to the **contract surface**: the schemas in [`schemas/`](./schemas)
and the normative rules in [`spec/`](./spec). It does **not** cover an agent's own
version, which is independent.

## Change classification

| Change | Version bump |
|--------|--------------|
| Add an OPTIONAL field | minor |
| Add a new method or event type | minor |
| Relax a constraint | minor |
| Clarify wording (no behavioral change) | patch |
| Add/expand `extensions` usage | patch |
| Remove or rename a field | **major** |
| Make an optional field required | **major** |
| Change a field's type or semantics | **major** |
| Remove a method, event, or state | **major** |

## Compatibility rules

1. Consumers **MUST** ignore unknown fields and unknown `extensions` keys.
2. Within a major version, an agent implementing `0.x` MUST remain compatible
   with orchestrators built for any `0.y` where `y <= x`.
3. Pre-1.0 (`0.x`): minor versions **MAY** contain breaking changes, but each is
   documented in the changelog. From `1.0.0`, the table above is strictly enforced.

## Extensions

Use the `extensions` object (present on most objects) for experimental or
vendor-specific data. Keys **MUST** be reverse-DNS namespaced
(e.g. `com.example.priority`). Extensions never require a version bump.
