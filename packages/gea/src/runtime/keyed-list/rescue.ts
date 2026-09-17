/**
 * Cross-list rescue. `removeEntry` queues `disposer.dispose()` to a microtask
 * instead of firing it synchronously. If the same `.map()` site's
 * `createEntry` sees the matching key before that microtask runs, it pulls
 * the entry back out — DOM + disposer + subscriptions transfer intact.
 *
 * The `pending` map is **per-site**: the compiler emits one `Map<string, Entry<T>>`
 * literal per `.map()` site at module scope and threads it into every
 * `_defer` / `_deferBulk` / `_rescue` call. Two unrelated `.map()` sites
 * can't collide because they literally don't share a Map.
 */
import type { Entry } from './types'
import { GEA_PROXY_RAW } from '../symbols'

type Pending<T> = Map<string, Entry<T>>
type LiveEntries<T> = Map<string, Set<Entry<T>>>

// Two parallel FLAT arrays instead of a `{ pending, entries }[]`. A record field
// typed as a `Map` has no geatsc Representation ("representation-plan coverage
// gap for record field __gea_type_PendingBulkBatch.pending"), and an `Entry[][]`
// of per-batch lists has no frozen record shape either ("missing-record-shape
// [__gea_type_Entry] ... Entry[][]"). One entry per index, with its target map
// repeated alongside, keeps both vectors flat and exact.
//
// This module-level state is shared across EVERY `.map()` site in the app at
// once, each with its own item type — no single `T` describes it (TypeScript
// has no existential/wildcard generics for a registry instantiated
// differently by each caller). So the registries below are declared once
// against the erased `Pending<unknown>`/`Entry<unknown>`, and every EXPORTED
// function is what actually carries each call's real `T` — the standard
// type-erasure-at-the-registry-boundary shape for a shared heterogeneous
// cache (the same idea as a global cache keyed by branded IDs across many
// unrelated generic instantiations). `Entry<T>` is structurally covariant in
// `T` here (a widening store, never narrowed back out except through the
// exact `Pending<T>` the caller already holds), so storing/retrieving
// through the erased type doesn't lose safety at the real, generic call
// sites below — only this module-private cache itself is untyped in `T`.
const _toFlush: Set<Pending<unknown>> = new Set()
const _live: WeakMap<Pending<unknown>, LiveEntries<unknown>> = new WeakMap()
const _claimed: WeakSet<Entry<unknown>> = new WeakSet()
const _claimable: WeakSet<Entry<unknown>> = new WeakSet()
let _pendingBulkMaps: Pending<unknown>[] = []
let _pendingBulkEntries: Entry<unknown>[] = []
let _flushQueued = false

// A top-level FUNCTION DECLARATION, not a `const` holding an arrow: an
// unannotated module-scope callable const has no sealed binding subject
// under geatsc (`representation-plan coverage gap for
// VariableDeclaration`) because its `any -> any` signature admits no exact
// ABI. A function declaration is its own emitted callable and needs no
// value carrier. Body is unchanged.
function _unwrap<V>(v: V): V {
  const rawTarget = v && typeof v === 'object' && (v as Record<symbol, unknown>)[GEA_PROXY_RAW]
  return (rawTarget as V) || v
}

function _liveFor(pending: Pending<unknown>): LiveEntries<unknown> {
  let live = _live.get(pending)
  if (!live) {
    live = new Map()
    _live.set(pending, live)
  }
  return live
}

export function _trackLive<T>(pending: Pending<T>, e: Entry<T>): void {
  const key = String(e.key)
  const live = _liveFor(pending as Pending<unknown>)
  let bucket = live.get(key)
  if (!bucket) live.set(key, (bucket = new Set()))
  bucket.add(e as Entry<unknown>)
}

function _untrackLive<T>(pending: Pending<T>, e: Entry<T>): void {
  _claimable.delete(e as Entry<unknown>)
  const bucket = _live.get(pending as Pending<unknown>)?.get(String(e.key))
  if (!bucket) return
  bucket.delete(e as Entry<unknown>)
  if (bucket.size === 0) _live.get(pending as Pending<unknown>)?.delete(String(e.key))
}

export function _markClaimable<T>(e: Entry<T>, claimable: boolean): void {
  if (claimable) _claimable.add(e as Entry<unknown>)
  else _claimable.delete(e as Entry<unknown>)
}

export function _consumeClaim<T>(e: Entry<T>): boolean {
  if (!_claimed.has(e as Entry<unknown>)) return false
  _claimed.delete(e as Entry<unknown>)
  _claimable.delete(e as Entry<unknown>)
  return true
}

function _schedule(): void {
  if (_flushQueued) return
  _flushQueued = true
  queueMicrotask(() => {
    _flushQueued = false
    const drainMaps = Array.from(_toFlush)
    const bulkEntries = _pendingBulkEntries
    _toFlush.clear()
    _pendingBulkMaps = []
    _pendingBulkEntries = []
    for (let i = 0; i < drainMaps.length; i++) {
      const m = drainMaps[i]
      for (const e of m.values()) {
        try {
          e.disposer.dispose()
        } catch {
          /* isolated */
        }
      }
      m.clear()
    }
    for (let i = 0; i < bulkEntries.length; i++) {
      try {
        bulkEntries[i].disposer.dispose()
      } catch {
        /* isolated */
      }
    }
  })
}

export function _defer<T>(pending: Pending<T>, e: Entry<T>): void {
  _untrackLive(pending, e)
  pending.set(String(e.key), e)
  _toFlush.add(pending as Pending<unknown>)
  _schedule()
}

/**
 * Queue a full batch of removed entries for deferred disposal. Cheaper than
 * per-row `_defer` for whole-list ops (clear, disjoint replace): no
 * `Map.set` per row. If a `_rescue` call arrives before the microtask
 * drains, the batch is materialized into its target `pending` map first.
 */
export function _deferBulk<T>(pending: Pending<T>, entries: Entry<T>[]): void {
  if (entries.length === 0) return
  const next: Entry<T>[] = []
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]
    if (_consumeClaim(e)) continue
    _untrackLive(pending, e)
    next.push(e)
  }
  if (next.length === 0) return
  for (let i = 0; i < next.length; i++) {
    _pendingBulkMaps.push(pending as Pending<unknown>)
    _pendingBulkEntries.push(next[i] as Entry<unknown>)
  }
  _schedule()
}

export function _rescue<T>(pending: Pending<T>, key: string, item?: T): Entry<T> | null {
  const e = pending.get(key)
  if (e) {
    pending.delete(key)
    return e
  }

  // Lazy fallback: materialize any pending bulk batches into their target
  // pending maps so cross-site rescue still works without paying per-row
  // Map.set on the common no-rescue-needed bulk path.
  if (_pendingBulkMaps.length > 0) {
    for (let i = 0; i < _pendingBulkMaps.length; i++) {
      const target = _pendingBulkMaps[i]
      const bulkItem = _pendingBulkEntries[i]
      target.set(String(bulkItem.key), bulkItem)
      _toFlush.add(target)
    }
    _pendingBulkMaps = []
    _pendingBulkEntries = []
    const r = pending.get(key)
    if (r) {
      pending.delete(key)
      return r
    }
  }

  if (arguments.length >= 3) {
    const raw = _unwrap(item)
    const bucket = _live.get(pending as Pending<unknown>)?.get(key)
    if (bucket) {
      for (const live of bucket) {
        if (_claimable.has(live) && live.item === raw) {
          _claimed.add(live)
          _claimable.delete(live)
          return live as Entry<T>
        }
      }
    }
  }
  return null
}
