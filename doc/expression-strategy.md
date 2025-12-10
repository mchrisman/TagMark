# Expression strategy hook

TagMark compiles `{...}` and `@{...}` expressions through a pluggable strategy. By default it behaves exactly like `new Function(...params, '"use strict";return (' + body + ');')`, so existing code keeps the same semantics.

Use `TagMarkDebug.setExpressionStrategy` to replace compilation:

```js
TagMarkDebug.setExpressionStrategy({
    makeFunction(params, body) {
        // Return a callable function(...args)
        return new Function(...params, `"use strict";return (${body});`);
    },
});
```

Every expression compilation goes through this hook, including syntax checks during interpolation parsing, so the replacement should mirror the default signature and strict-mode wrapper. This makes it possible to route TagMark expressions into a sandbox such as an SES Compartment without touching the core runtime.

## SES drop-in wrapper

`demo/tagmark-ses-wrapper.js` provides a production-ready wiring for SES environments. Load SES first, then TagMark, then install the strategy:

```html
<script src="./ses.umd.min.js"></script>
<script src="./lib/deep_proxy.js"></script>
<script src="./lib/ActDown.js"></script>
<script src="./lib/ActDown-ext-forms.js"></script>
<script src="./src/tagmark.js"></script>
<script src="./demo/tagmark-ses-wrapper.js"></script>
<script>
  TagMarkSES.install({
    endowments: {
      console,
      Math,
      Date,
      // Expose only what your templates need
    },
  });
</script>
```

`TagMarkSES.install` locks down the realm (via `lockdown()`), builds a Compartment with the provided endowments, and routes all expression compilation through that compartment. The result is a drop-in, sandboxed expression runtime that mirrors TagMark’s default semantics.
