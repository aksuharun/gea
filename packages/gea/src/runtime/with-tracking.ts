/**
 * withTracking(disposer, root, fn) — lexical reactivity scope.
 *
 * Tracks (storeRoot, prop) tuples so the effect can subscribe on the real
 * store that owns each accessed property — not the `root` param (which for
 * fn components is a props-thunks proxy with no observe()).
 *
 * Scope is strictly lexical: `_active` is null outside of withTracking; store
 * proxy traps are a no-op in that case (zero ambient cost).
 *
 * Perf path: after 2 consecutive runs produce the SAME dep set, the effect
 * enters "locked" mode and subsequent re-runs skip the scope/tracking
 * entirely — `run` becomes a bare `fn()` call. Most reactive bindings in
 * keyed-list rows (e.g. `store.selected === item.id ? 'danger' : ''`)
 * read a fixed (store, item) pair every time, so this is the common case.
 * The 1000-effect fire on 04_select1k drops from "1000 scope allocations +
 * 1000 dep comparisons" to "1000 plain function calls".
 */

import type { Disposer } from './disposer'
import { subscribe } from './subscribe'

// The active scope is two parallel module-level arrays, not a `Scope` record
// holding a `Dep[]`. Under geatsc an `any`-typed array is
// `vector:inline-value<undefined>`, which has no physical storage as a RECORD
// FIELD ("Frozen vector:inline-value<undefined> has no physical storage
// materialization in finite-aggregate") — as a plain local or module binding it
// is fine. Keeping the arrays out of any record shape sidesteps that entirely,
// and the pairs, the linear dedup and the save/restore nesting are unchanged.
//
// `object` rather than `any`/`unknown`: every root pushed here is a real
// store/component reference from a proxy trap (`store.ts`'s `rootGetValue`,
// `compiled-store.ts`'s `get` trap, ...) — never a primitive — so `object` is
// the honest type. Nothing here needs to know WHICH object; identity
// (`===`) is the only operation performed on these entries.
let _activeRoots: object[] | null = null
let _activeProps: string[] | null = null
let _recursing = false

/** Record a tracking read. Called by store.ts proxy traps. */
export function trackRead(storeRoot: object, prop: string | symbol): void {
  if (!_activeRoots || !_activeProps || _recursing) return
  if (typeof prop !== 'string') return
  _recursing = true
  try {
    // Linear dedup — 1-3 deps is typical per binding, a Map is overkill.
    const roots = _activeRoots
    const props = _activeProps
    for (let i = 0; i < roots.length; i++) {
      if (roots[i] === storeRoot && props[i] === prop) return
    }
    roots.push(storeRoot)
    props.push(prop)
  } finally {
    _recursing = false
  }
}

/** Test helper — no-op; real Store reads fire trackRead through the proxy. */
export function trackPath(_path: readonly string[]): void {
  /* no-op */
}

/** Suppress tracking for `fn`. */
export function untrack<T>(fn: () => T): T {
  const prevRoots = _activeRoots
  const prevProps = _activeProps
  _activeRoots = null
  _activeProps = null
  try {
    return fn()
  } finally {
    _activeRoots = prevRoots
    _activeProps = prevProps
  }
  return undefined as T
}

function _depsEqual(aRoots: object[], aProps: string[], bRoots: object[], bProps: string[]): boolean {
  if (aRoots.length !== bRoots.length) return false
  for (let i = 0; i < aRoots.length; i++) {
    if (aRoots[i] !== bRoots[i] || aProps[i] !== bProps[i]) return false
  }
  return true
}

export function withTracking(disposer: Disposer, root: object, fn: () => void, staticDeps = false): void {
  let offs: Array<() => void> = []
  let prevRoots: object[] = []
  let prevProps: string[] = []
  // Reused across the 2 pre-lock runs — saves a Scope + deps array alloc
  // each fire on 01_run1k / 07_create10k (6000 allocs for 1000 rows × 3
  // bindings × 2 runs).
  let scopeRoots: object[] = []
  let scopeProps: string[] = []
  // Stability counter: 0 = first run; 1 = one identical run; 2 = locked.
  // Locked effects skip tracking on every subsequent fire (same idea as the
  // compiled patcher's fast path). Require 2 identical runs before locking so
  // conditional-dep bindings (e.g. `x && x.y`) get a chance to register
  // their full dep set before the fast path engages.
  let stable = 0
  const run = (): void => {
    if (stable >= 2) {
      fn()
      return
    }
    const prevRootsActive = _activeRoots
    const prevPropsActive = _activeProps
    scopeRoots = []
    scopeProps = []
    _activeRoots = scopeRoots
    _activeProps = scopeProps
    try {
      fn()
    } finally {
      _activeRoots = prevRootsActive
      _activeProps = prevPropsActive
      const roots2 = scopeRoots
      const props2 = scopeProps
      if (_depsEqual(roots2, props2, prevRoots, prevProps)) {
        stable = staticDeps ? 2 : stable + 1
      } else {
        stable = staticDeps ? 2 : 0
        for (let i = 0; i < offs.length; i++) offs[i]()
        offs = []
        for (let i = 0; i < roots2.length; i++) {
          offs.push(subscribe(roots2[i] ?? root, [props2[i]], run))
        }
        prevRoots = roots2
        prevProps = props2
      }
    }
  }
  run()
  disposer.add(() => {
    for (let i = 0; i < offs.length; i++) offs[i]()
    offs = []
  })
}
