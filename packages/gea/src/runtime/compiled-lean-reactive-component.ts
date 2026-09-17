import { CompiledComponent } from './compiled-component'
import { createLeanProxy, leanObserve, leanObserveDirect } from './compiled-lean-store'
import { GEA_OBSERVE_DIRECT } from './internal-symbols'
import type { Change } from '../store'

/** Same observer shape as the compiled stores; see `compiled-store.ts`. */
type Handler = (value: unknown, changes: Change[]) => void

export class CompiledLeanReactiveComponent<
  P extends Record<string, any> = Record<string, any>,
> extends CompiledComponent<P> {
  constructor() {
    super()
    return createLeanProxy(this)
  }

  observe(pathOrProp: string | readonly string[], handler: Handler): () => void {
    return leanObserve(this, pathOrProp, handler)
  }

  [GEA_OBSERVE_DIRECT](prop: string, handler: (value: any) => void): () => void {
    return leanObserveDirect(this, prop, handler)
  }
}

export default CompiledLeanReactiveComponent
