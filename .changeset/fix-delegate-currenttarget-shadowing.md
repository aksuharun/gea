---
"@geajs/core": patch
---

### @geajs/core (patch)

- **Fix event `currentTarget` shadowing regression**: `delegateEvent` decided between the `currentTarget`-shadowing slot and the fast no-shadow slot with `!pairs[i][2]`, which treated a plain 2-element `[el, handler]` pair (shadowing default) the same as the compiler's 3-element fast marker `[el, handler, false]`. As a result `event.currentTarget` was left as the document instead of the matched element. The runtime now distinguishes the two by pair length (a native numeric compare), restoring shadowing while keeping the check geatsc-native.
