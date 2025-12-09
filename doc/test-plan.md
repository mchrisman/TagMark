# TagMark Test Plan

Each test will follow the HTML + `harness.js` pattern described in `doc/test-architecture.md`, using `TagMarkTest.run` for assertions and writing results to `#test-results`.

| Test file | Title | What it covers | How it validates |
| --- | --- | --- | --- |
| `basic-rendering.test.html` | Basic tag-mark mount | `<tag-mark>` renders mixed TagMark/HTML nodes and text interpolation. | Render static content with `{}` expressions; assert DOM text matches expected values. |
| `pure-expression-safety.test.html` | Pure expressions stay read-only | `{}` expressions unwrap handles and reject mutations. | Attempt to mutate state inside `{}` and assert a hard error is surfaced; verify snapshots read values without proxies. |
| `effect-expression-updates.test.html` | Effect expressions mutate state | `@{}` handlers preserve handles and perform assignments. | Click buttons that toggle booleans and increment numbers; assert DOM updates and state is shared when handles are reused. |
| `declarations-and-imports.test.html` | `def` and `import` scoping | Variable declarations, shadowing, and imported symbols. | Declare `$` constants and handle aliases with `def`; import helper functions; assert scope isolation via DOM output. |
| `loop-basics.test.html` | `<Loop>` renders collections | Iteration order, row markers, and keying with `marked by`. | Loop over arrays/objects; assert rendered values and stable identity when data reorders. |
| `loop-duplicate-key-error.test.html` | Loop key uniqueness | Duplicate `marked by` values trigger hard errors. | Render a loop with intentional duplicate keys; assert error boundary reports the failure. |
| `when-conditional.test.html` | `<When>` conditional rendering | Truthiness behavior and fallback. | Toggle condition handle; assert only matching branch renders and state persists across toggles. |
| `component-params-and-scope.test.html` | Component parameters and lexical scope | Parameter binding, no parent scope capture, and handle paths. | Define `<Foo:Template>` with params; render multiple instances; assert each uses passed values and does not leak parent variables. |
| `component-init-lifecycle.test.html` | `init` semantics and persistence | Initialization on first mount, no rerun on rerender, and prohibition of dual init. | Create component with template `init`; toggle mount via `<When>`; assert state persists unless `clear-on-unmount` is set; include invalid double-init case to assert error. |
| `marker-attribute.test.html` | `marker` outside loops | SID stability using `marker` attribute. | Render nodes with dynamic marker values; assert state sticks to markers when order changes. |
| `slotting-and-fallback.test.html` | Slots with fallback | `<Slot>` placement and default content. | Define component with default and named slots; render with/without matching children; assert composed DOM matches spec. |
| `form-basic-binding.test.html` | Default `@Form` binding | Inputs populate and sync with `@Form`. | Fill fields, submit prevention handler, assert `@Form` reflects values and DOM stays stable across rerenders. |
| `form-special-fields.test.html` | Form special field types | File, select-multiple, radios, checkboxes behavior. | Programmatically set selections and trigger change events; assert `@Form` holds FileList/arrays/booleans per spec. |
| `form-bind-external-handle.test.html` | Form `bind` to external state | `bind` remaps `@Form` to another handle. | Bind form to `@Global.login`; change fields; assert external handle updates and persists after unmount/remount. |
| `manual-field-bind.test.html` | Field-level `bind` override | Individual inputs bound outside `@Form`. | Mix default and explicit `bind`; assert values route to respective handles without interference. |
| `url-sync-basic.test.html` | `<Url>` synchronization | `@Url` mirrors hash params and button updates navigate. | Start with hash params; assert `@Url` values; click buttons updating `@Url`; verify location hash updates and back/forward works. |
| `clear-on-unmount.test.html` | State clearing behavior | `clear-on-unmount="true"` removes local state. | Toggle component/form with attribute; assert state resets after unmount, while default case persists. |
| `error-boundary-display.test.html` | Error surfacing | Hard errors bubble to error boundary UI. | Trigger known error (e.g., illegal mutation) and assert visual/console error message emitted. |
| `web-component-bindings.test.html` | Web Component integration | Custom elements interacting with TagMark handles. | Extend `TagMarkElement` to emit events/bind properties; assert data flows via `bind` and event handlers. |
| `url-include-filtering.test.html` | `<Url include>` filtering | Only listed keys sync to hash. | Bind multiple `@Url` fields but include subset; assert hash only contains included keys while others remain local. |

Recent regressions to watch:

- Pure `{}` expressions are deep-frozen snapshots and must throw on mutation attempts.
- Effect `@{}` expressions preserve handles so assignments like `@Foo.bar = value` propagate through `writeHandle` and trigger re-render.
- Slot projection uses tag-name matching with default fallback when no named slot matches.
- Form elements without explicit `bind` should auto-wire to the nearest `@Form` by `name`, covering text, checkbox, radio, and select inputs.

