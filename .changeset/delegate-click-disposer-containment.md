---
"@geajs/core": patch
---

### @geajs/core (patch)

- **`delegateClick` handlers are now disposer-contained**: the previously-unused `disposer` parameter registers a single teardown per call that clears every stashed handler when the owning component disposes. Additive and backward-compatible — the signature is unchanged, callers passing no disposer keep the historical persist-until-GC behavior, and a noop disposer skips the registration entirely. Bounding handler lifetime to the owner matters under refcounted ownership (the native build), where an uncleared stash would keep the component alive through its own DOM (component → element → handler → component), and it makes the storage's lifetime containment explicit for the geatsc compiler.
