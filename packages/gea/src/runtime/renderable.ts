/**
 * `Renderable` — everything a JSX child position (or a component's rendered
 * template) can evaluate to.
 *
 * Established by reading the codegen's children-thunk emitter
 * (`buildChildrenThunk` in vite-plugin-gea's closure-codegen) together with
 * the runtime's own memoization checks:
 *   - A `JSXText` child compiles to a plain string.
 *   - A `JSXExpressionContainer` child returns whatever the source expression
 *     evaluates to verbatim — a primitive, `null`/`undefined`, an array (e.g.
 *     `{items.map(x => x.label)}` or a forwarded `props.children`), or a Node
 *     produced by nested JSX.
 *   - A `JSXElement`/`JSXFragment` child, or multiple children, always
 *     compiles to a Node.
 *
 * This is a closed union, not `any`/`unknown` — every consumer below
 * discriminates on it via `nodeType`/`Array.isArray` before use, exactly the
 * set of checks the runtime already performs.
 */
export type Renderable = Node | string | number | boolean | null | undefined | readonly Renderable[]
