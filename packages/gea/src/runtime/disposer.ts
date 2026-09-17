/**
 * Disposer — LIFO teardown registry.
 *
 * Class-based so the `add` / `dispose` / `child` methods live on the prototype
 * once, instead of being closures created per instance. Each `createDisposer()`
 * call was allocating 3 closures; on a 1000-row keyed list with per-row
 * children that's ~3000 closure allocations that GC had to chase. The class
 * form drops that to one shared prototype plus the per-instance `f[]` array
 * and (for children) a single dispose-bridge closure.
 *
 * `Disposer` is the CLASS, not an interface over it. The interface had exactly
 * two implementors — this class and the `NOOP_DISPOSER` object literal — which
 * made every `Disposer`-typed slot polymorphic between a class instance and a
 * record, and geatsc has no native carrier for that: the type derives lattice
 * bottom, so `CompiledComponent`'s `[GEA_DISPOSER] = createDisposer() as
 * Disposer` field raised `representation-plan coverage gap for
 * PropertyDeclaration`, and `conditional()`'s `currentChild: Disposer | null`
 * capture blocked its whole nested-function cluster. One class with a `noop`
 * flag has a single concrete carrier and behaves identically: a no-op disposer
 * registers nothing, disposes an empty stack, and hands back itself as its own
 * child.
 */

export class Disposer {
  f: Array<() => void> = []
  /** A shared no-op disposer ignores registrations and owns no children. */
  noop: boolean

  constructor(noop = false) {
    this.noop = noop
  }

  add(fn: () => void): void {
    if (this.noop) return
    this.f.push(fn)
  }

  dispose(): void {
    const f = this.f
    // Hoisted try/catch (one per dispose call, not per iteration) — measurable
    // on 09_clear1k's ~5000-cleanup teardown. Framework-owned cleanups don't
    // throw under normal operation; if one does, the remainder of THIS
    // disposer's stack is skipped (best-effort teardown: one failure does not
    // run the rest of this disposer's callbacks).
    try {
      for (let i = f.length - 1; i >= 0; i--) f[i]()
    } catch {
      /* one handler threw */
    }
    f.length = 0
  }

  child(): Disposer {
    if (this.noop) return this
    const c = new Disposer()
    this.f.push(_dispatchChild(c))
    return c
  }
}

function _dispatchChild(c: Disposer): () => void {
  return () => c.dispose()
}

export function createDisposer(): Disposer {
  return new Disposer()
}

/**
 * Shared no-op disposer for rows that register no cleanup work.
 *
 * The compiler references this (via `@geajs/core`'s export surface) whenever
 * a keyed-list site proves `noRowDisposer: true` — cheaper than emitting a
 * fresh `{ add() {}, dispose() {}, child() { return this } }` literal per
 * row. 09 clear1k ×8 was paying ~8k object-literal allocations before.
 */
export const NOOP_DISPOSER: Disposer = new Disposer(true)
