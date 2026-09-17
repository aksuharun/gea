/**
 * bind(disposer, root, pathOrGetter, apply) — single wire-up primitive for
 * every reactive-* helper. All the reactive-attr/bool/class/style/value/text
 * wrappers share this shape: compute the value, write it via `apply`, and
 * re-run on source change.
 *
 * - Static path (string[]): `readPath` + `subscribe`, closure tracks prev.
 * - Dynamic getter (() => unknown): `withTracking` scope re-runs on any
 *   tracked-path change.
 *
 * (Keep per-binding withTracking: batching into one effect per row WOULD
 * reduce allocation overhead on 01_run1k / 09_clear1k but triggers every
 * binding in the row on every fire, regressing 04_select1k catastrophically
 * when one store key change cascades through N applies that didn't actually
 * depend on it. Per-dep subscription is the right granularity for updates.)
 */

import type { Disposer } from './disposer'
import { readPath, subscribe } from './subscribe'
import { withTracking } from './with-tracking'

/**
 * `root` is `object`, not `any`: every call site hands in a concrete
 * component/store `this` (see `subscribe.ts`'s doc comment — the same
 * reasoning applies here, one level up). `object` also happens to be exactly
 * what both downstream calls need: `readPath`/`subscribe` accept the wider
 * `object | null | undefined` (object is a subtype, no cast needed), and
 * `withTracking` requires `object` outright — so no assertion is needed at
 * either call site.
 */
export function bind(
  disposer: Disposer,
  root: object,
  pathOrGetter: readonly string[] | (() => unknown),
  apply: (v: unknown) => void,
): void {
  if (Array.isArray(pathOrGetter)) {
    apply(readPath(root, pathOrGetter))
    const off = subscribe(root, pathOrGetter, apply)
    disposer.add(off)
    return
  }
  const getter = pathOrGetter as () => unknown
  withTracking(disposer, root, () => {
    apply(getter())
  })
}
