import { GEA_CREATE_TEMPLATE, GEA_DOM_COMPONENT, GEA_ELEMENT } from './symbols'
import { GEA_DISPOSER, GEA_OBSERVE_DIRECT, GEA_SET_PROPS } from './internal-symbols'
import { createDisposer, type Disposer } from './disposer'
import { createLeanProxy, leanObserve, leanObserveDirect } from './compiled-lean-store'
import type { Change } from '../store'

/** Same observer shape as the compiled stores; see `compiled-store.ts`. */
type Handler = (value: unknown, changes: Change[]) => void
/**
 * One thunk per prop of `P`, each returning that prop's own type.
 *
 * Generic rather than a flat dictionary so a component's props keep their
 * declared types all the way through `GEA_SET_PROPS` — the compiler emits one
 * thunk per JSX attribute, so the mapping is exact at every instantiation.
 */
type PropThunks<P> = { [K in keyof P]: () => P[K] }
const GEA_COMPONENT_ID: unique symbol = Symbol()
let nextComponentId = 0

export class CompiledTinyReactiveComponent<P extends Record<string, any> = Record<string, any>> {
  rendered = false
  props: P = {} as P;
  [GEA_ELEMENT] = null as HTMLElement | null;
  [GEA_DISPOSER] = createDisposer() as Disposer;
  [GEA_COMPONENT_ID]?: string

  constructor() {
    return createLeanProxy(this)
  }

  get id(): string {
    return (this[GEA_COMPONENT_ID] ??= '_' + nextComponentId++)
  }

  set id(value: string) {
    this[GEA_COMPONENT_ID] = value
  }

  get el(): HTMLElement | null {
    return this[GEA_ELEMENT] ?? null
  }

  [GEA_SET_PROPS](thunks: PropThunks<P>): void {
    const out: Partial<P> = {}
    for (const k in thunks) {
      Object.defineProperty(out, k, {
        enumerable: true,
        get: () => thunks[k](),
      })
    }
    this.props = out as P
  }

  render(parent: Node, _index?: number): void {
    const node = this[GEA_CREATE_TEMPLATE](this[GEA_DISPOSER])
    parent.appendChild(node)
    if (node.nodeType === 11) this[GEA_ELEMENT] = ((parent as Element).lastElementChild as HTMLElement | null) ?? null
    else if (node.nodeType === 1) this[GEA_ELEMENT] = node as HTMLElement
    const el = this[GEA_ELEMENT]
    if (el) (el as HTMLElement & { [GEA_DOM_COMPONENT]?: unknown })[GEA_DOM_COMPONENT] = this
    this.rendered = true
  }

  observe(pathOrProp: string | readonly string[], handler: Handler): () => void {
    return leanObserve(this, pathOrProp, handler)
  }

  [GEA_OBSERVE_DIRECT](prop: string, handler: (value: unknown) => void): () => void {
    return leanObserveDirect(this, prop, handler)
  }

  dispose(): void {
    this[GEA_DISPOSER].dispose()
    this[GEA_ELEMENT]?.remove()
    this[GEA_ELEMENT] = null
  }

  $(sel: string): Element | null {
    return this[GEA_ELEMENT]?.querySelector(sel) ?? null
  }

  $$(sel: string): Element[] {
    return Array.from(this[GEA_ELEMENT]?.querySelectorAll(sel) ?? [])
  }

  created(_props?: P): void {
    /* no-op */
  }

  onAfterRender(): void {
    /* no-op */
  }
}

export default CompiledTinyReactiveComponent
