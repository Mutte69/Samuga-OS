---
name: DB lib stale declarations fix
description: After changing lib/db/src/schema/index.ts, artifact typechecks fail with TS2305 until libs are rebuilt
---

## Rule
After any change to `lib/db/src/schema/index.ts` (or any other lib), run `pnpm run typecheck:libs` before running artifact-level typechecks (`pnpm --filter @workspace/api-server run typecheck`).

**Why:** lib packages are composite and emit declarations. Artifact packages import from the built declarations. If the schema barrel is updated but libs aren't rebuilt, the artifact sees stale declarations and reports TS2305 ("has no exported member") even though the export exists in source.

**How to apply:** Always run `pnpm run typecheck:libs` as the first step after touching any lib package. The codegen script (`pnpm --filter @workspace/api-spec run codegen`) already does this automatically at the end — but manual schema edits don't.
