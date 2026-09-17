/**
 * Per-document event delegation via element expando properties.
 *
 * Fast JSX-declared handlers are stored as own properties on their host
 * element (`el.__on_click = handler`). Handlers that need element-local
 * `currentTarget` semantics use the slower `__onct_click` slot.
 * A single document-level listener per eventType walks from `e.target` up,
 * checks the expando on each node, and dispatches.
 *
 * Why this beats a Map<Element, Handler> dispatcher:
 *   - Expando lookup is an inline-cached own-property read.
 *   - No per-list Map allocation; DOM nodes are the storage.
 *   - Detached elements take their handler expando with them, so bulk row
 *     teardown avoids removeEventListener / Map.delete work.
 *
 * Although the real DOM listener is installed on the document, Gea exposes
 * element-local handler semantics: while a matched handler runs,
 * `e.currentTarget` is the element that owned that handler.
 */

import type { Disposer } from './disposer'

// A Set keeps the membership test native under geatsc; a Record<string, true>
// computed access has no native plan and trips the boxed-equality guard.
// Mirrors `delegate-event-fast.ts`, which took the same treatment.
const _NON_BUBBLING = new Set<string>(['blur', 'focus', 'mouseenter', 'mouseleave', 'scroll'])

type Handler = (e: Event) => void
type HandlerPair = [Element, Handler] | [Element, Handler, false]

function dispatchWithCurrentTarget(handler: Handler, event: Event, currentTarget: Element): void {
  const previous = Object.getOwnPropertyDescriptor(event, 'currentTarget')
  Object.defineProperty(event, 'currentTarget', { configurable: true, value: currentTarget })
  try {
    handler(event)
  } finally {
    if (previous) Object.defineProperty(event, 'currentTarget', previous)
    else delete (event as any).currentTarget
  }
}

export function delegateEvent(root: Element, type: string, pairs: HandlerPair[], _disposer: Disposer): void {
  // Prefer the live global `document` — template clones' ownerDocument may
  // differ from the adopted document (jsdom installs fresh docs per test).
  const rt: any = typeof document !== 'undefined' ? document : root.ownerDocument
  const k = '__on_' + type
  const currentTargetKey = '__onct_' + type
  const flag = '__d_' + type
  if (!rt[flag]) {
    rt[flag] = 1
    rt.addEventListener(
      type,
      (e: Event) => {
        for (let n: Node | null = e.target as Node | null; n && n !== rt; n = n.parentNode) {
          const h = (n as any)[k] as Handler | undefined
          if (h !== undefined) {
            h(e)
            return
          }
          const hct = (n as any)[currentTargetKey] as Handler | undefined
          if (hct !== undefined) {
            dispatchWithCurrentTarget(hct, e, n as Element)
            return
          }
        }
      },
      _NON_BUBBLING.has(type),
    )
  }
  for (let i = 0; i < pairs.length; i++) {
    const el = pairs[i][0]
    if (el) {
      // A 3-element pair (`[el, handler, false]`) is the compiler's
      // fast, no-shadow marker; a plain 2-element pair defaults to the
      // slower `currentTarget`-shadowing slot. Test the pair length (a
      // native numeric compare) rather than `pairs[i][2] === false`, whose
      // boxed `false | undefined` equality has no native plan under geatsc.
      if (pairs[i].length > 2) {
        ;(el as any)[k] = pairs[i][1]
      } else {
        ;(el as any)[currentTargetKey] = pairs[i][1]
      }
    }
  }
  // No disposer cleanup: when the element is removed from the DOM and GC'd,
  // the expando dies with it. Skipping a symmetric removeDelegate avoids
  // N `delete el[k]` per row on large replace/clear workloads. A dead expando
  // on a detached element is harmless: events no longer bubble through it, so
  // the document listener never walks into it.
}
