/**
 * subscribe(root, path, fn) — path-indexed subscription helper for the
 * closure-compiled runtime.
 *
 * Delegates to the existing `Store.prototype.observe(path, handler)` API —
 * which already handles path-indexed buckets (`priv.observers`) and resolves
 * the tail on fire. That means `subscribe` does NOT need to extend store.ts
 * with a new registration entry point; the observer-bucket machinery already
 * handles the single-root-prop + tail-resolve case.
 *
 * `root` may be a Store proxy, a raw Store, or any object that exposes an
 * `observe(path, fn)` method (SSR shim uses the same signature).
 */

import type { Change } from '../store'

type PathInput = readonly string[]

/** Anything exposing the runtime's `observe(path, handler)` contract. */
interface Observable {
  observe(path: string | readonly string[], handler: (value: unknown, changes?: Change[]) => void): () => void
}

function isObservable(x: object): x is Observable {
  return typeof (x as { observe?: unknown }).observe === 'function'
}

/**
 * `root`'s real type at every call site is concrete (a component's `this`, a
 * nested store, ...), so it's `object` here rather than `any` — but
 * `subscribe` itself can't resolve *which* nested object along `path` ends up
 * observed: that's chosen by walking `path` at runtime and testing each
 * segment for its own `.observe` method (a decision no static structural type
 * over `root` can predict, since `path`'s length isn't fixed). `V` is
 * therefore supplied by the caller's own `fn`, the same way
 * `EventEmitter#on<T>(name, fn: (arg: T) => void)` lets the caller's
 * callback pin the type rather than the emitter deriving it.
 */
export function subscribe<V>(
  root: object | null | undefined,
  path: PathInput,
  fn: (v: V, changes?: Change[]) => void,
): () => void {
  if (!root) return () => {}
  // Walk path prefixes: if the current root resolves `path[0]` to a nested Store
  // (has its own `.observe`), descend into it. This lets the compiler emit
  // `['store', 'count']` against `this` and have the subscription land on
  // `this.store` (the actual Store proxy) with tail `['count']`.
  let r: object = root
  let p: PathInput = path
  while (p.length > 1) {
    const head = p[0]
    const next = (r as Record<string, unknown>)[head]
    if (!next || typeof next !== 'object' || !isObservable(next)) break
    r = next
    p = p.slice(1)
  }
  // If the final root doesn't have .observe, we can't subscribe — emit noop.
  if (!isObservable(r)) return () => {}
  // The bridge from the caller's `V`-typed callback to `Observable`'s
  // necessarily-`unknown` handler (a Store's `observe` serves every prop on
  // every store shape in the app, so it can't be typed narrower than
  // `unknown` itself) — invisible from outside `subscribe`, same as above.
  const handler = fn as unknown as (value: unknown, changes?: Change[]) => void
  // Empty path → fire on any change (root-observer semantics in Store.observe).
  if (p.length === 0) return r.observe('', handler)
  if (p.length === 1) return r.observe(p[0], handler)
  // Pass the handler directly as the observer — the trampoline `(v, changes) => fn(...)`
  // was a no-op hop that allocated one closure per subscribe (5k closures for
  // a 1000-row 5-binding list). Drop it.
  return r.observe(p, handler)
}

/** Resolve a path against the root proxy; returns `undefined` on null holes.
 *
 * `V` defaults to `unknown` (not forced) — the same genuinely dynamic
 * boundary as `JSON.parse`: reading an arbitrary-length path out of an
 * arbitrary-shaped root, with no way to derive the result type structurally.
 * Callers that know what they're reading supply `V` explicitly.
 */
export function readPath<V = unknown>(root: object | null | undefined, path: readonly string[]): V {
  if (!root) return undefined as V
  let v: unknown = root
  for (let i = 0; i < path.length; i++) {
    if (v == null) return undefined as V
    v = (v as Record<string, unknown>)[path[i]]
  }
  return v as V
}
