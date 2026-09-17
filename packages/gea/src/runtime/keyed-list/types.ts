import type { Disposer } from '../disposer'

export interface ListState {
  container: Element
  anchor: Comment
  getDomItems(): Element[]
  getSource(): readonly unknown[]
  getKey(idx: number): string
  readonly listId: string
}

/**
 * `T` is the list item's type — genuinely knowable at each `.map()` call
 * site (the compiler emits one `keyedList()` invocation per site, closed
 * over the source array's real element type), so `Entry`/`ItemObservable`
 * carry it as a real type parameter instead of reaching for `any`. There's
 * no default: every real call site supplies a concrete `T` (inferred from
 * `createEntry`/`patchEntry`'s own closures).
 */
export interface ItemObservable<T> {
  current: T
  observe: (path: string | string[], fn: () => void) => () => void
  _fire: () => void
}

export interface Entry<T> {
  key: string
  item: T
  element: Element
  disposer: Disposer
  obs: ItemObservable<T>
}
