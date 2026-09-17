/**
 * delegateClick: disposer-contained handler storage.
 *
 * The disposer parameter clears every stashed handler on dispose, bounding
 * handler lifetime to the owning component (and, under the native build's
 * refcounted ownership, breaking the component → element → handler →
 * component retain cycle). Passing no disposer preserves the historical
 * behavior byte-for-byte: handlers stay until the element dies.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createDisposer, NOOP_DISPOSER } from '../../src/runtime/disposer'
import { delegateClick } from '../../src/runtime/delegate-click'

function click(el: Element): void {
  el.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }))
}

function setup(): { root: Element; el: Element } {
  const root = document.createElement('div')
  const el = document.createElement('button')
  root.appendChild(el)
  document.body.appendChild(root)
  return { root, el }
}

describe('delegateClick – disposer containment', () => {
  it('dispatches while alive, stops after dispose', () => {
    const { root, el } = setup()
    const d = createDisposer()
    let hits = 0
    delegateClick(root, [[el, () => hits++]], d)
    click(el)
    assert.equal(hits, 1)
    d.dispose()
    click(el)
    assert.equal(hits, 1)
  })

  it('clears every pair of the call, not just the first', () => {
    const { root } = setup()
    const a = document.createElement('button')
    const b = document.createElement('button')
    root.appendChild(a)
    root.appendChild(b)
    const d = createDisposer()
    let hits = 0
    delegateClick(
      root,
      [
        [a, () => hits++],
        [b, () => hits++],
      ],
      d,
    )
    click(a)
    click(b)
    assert.equal(hits, 2)
    d.dispose()
    click(a)
    click(b)
    assert.equal(hits, 2)
  })

  it('without a disposer, handlers persist (historical behavior)', () => {
    const { root, el } = setup()
    let hits = 0
    delegateClick(root, [[el, () => hits++]])
    click(el)
    click(el)
    assert.equal(hits, 2)
  })

  it('a noop disposer registers nothing and handlers persist', () => {
    const { root, el } = setup()
    let hits = 0
    delegateClick(root, [[el, () => hits++]], NOOP_DISPOSER)
    click(el)
    assert.equal(hits, 1)
    NOOP_DISPOSER.dispose()
    click(el)
    assert.equal(hits, 2)
  })

  it('a re-stashed handler after dispose wins (clear is not a tombstone)', () => {
    const { root, el } = setup()
    const d = createDisposer()
    let first = 0
    let second = 0
    delegateClick(root, [[el, () => first++]], d)
    d.dispose()
    delegateClick(root, [[el, () => second++]])
    click(el)
    assert.equal(first, 0)
    assert.equal(second, 1)
  })
})
