# Expression caching proposal

## Problem
Evaluating `{}` and `@{}` expressions currently recompiles the transformed JavaScript on every run. Each call rebuilds the case-insensitive wrapper and redoes handle name rewriting, even when the expression text and handle set are unchanged. Hot paths such as repeated render cycles end up dominated by this redundant work.

## Plan
- Canonicalize the handle names available to a scope (case-insensitive, sorted) and use that plus the original expression text as a cache key.
- Cache `CaseInsensitiveFunction` instances per key so repeated evaluations reuse the compiled function and skip handle transformation.
- Keep compilation counters exposed through `TagMarkDebug` to verify caching in tests and to aid diagnostics.
- Reuse the same flattened scope data when building the evaluation environment to avoid duplicate work during a single evaluation.

## Implementation snapshot
- `TagMarkRuntime` now keeps a cache keyed by expression plus handle signature, counting fresh compilations as it populates entries.
- `TagMarkDebug` exposes helpers to inspect and reset cache stats, and to construct `Scope`/`Handle` instances for targeted testing.
- `evalPure`/`evalEffect` reuse a single flattened scope per evaluation to avoid redundant handle/value traversal.
