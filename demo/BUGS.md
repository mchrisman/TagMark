# Documentation Issues Found While Building Todo Demo

This file tracks issues that arose from misunderstanding the API. These should inform better documentation.

---

## Issue 1: Event handlers are expressions, not statement blocks

**Symptom**: "Unexpected token 'if'" error

**What I tried**:
```html
<button onclick="@{
  if (@Global.newTodo?.text?.trim()) {
    @Global.todos = [...@Global.todos, { id: @Global.nextId, ... }];
    @Global.nextId = @Global.nextId + 1;
  }
}">Add</button>
```

**Why it failed**: Event handlers `@{...}` are wrapped in `return (...)`, making them expressions, not statement blocks. `if` statements are not valid in expression position.

**Correct approach**: Use conditional expressions (ternary), comma operator, or `&&` short-circuit:
```html
<button onclick="@{
  @Global.newTodo?.text?.trim() && (
    @Global.todos = [...@Global.todos, { id: @Global.nextId, ... }],
    @Global.nextId = @Global.nextId + 1
  )
}">Add</button>
```

**Documentation needed**: Clearly explain that `@{...}` handlers are expressions. Provide examples of common patterns:
- `@{ condition && expression }` for conditional execution
- `@{ expr1, expr2, expr3 }` for multiple operations (comma operator)
- `@{ (expr1, expr2, result) }` when you need to return a specific value

---

## Issue 2: `import=` attribute expects global variables, not ES module exports

**Symptom**: Functions specified in `import="foo,bar"` are undefined

**What I tried**:
```html
<script type="module">
  export function startSensorBenchmark(appHandle) { ... }
</script>

<tag-mark import="startSensorBenchmark">
```

**Why it failed**: The `import` attribute on `<tag-mark>` and other elements looks up names in the *global* JavaScript scope (e.g., `window.startSensorBenchmark`). ES module exports are scoped to the module and not globally accessible.

**Correct approach**: Use a plain `<script>` (not `type="module"`) to define functions that need to be imported:
```html
<script>
  function startSensorBenchmark(appHandle) { ... }
</script>

<tag-mark import="startSensorBenchmark">
```

**Documentation needed**: Clarify that `import=` imports from the global JavaScript context, not from ES modules. The name "import" is potentially confusing given ES module terminology.

---

## Issue 3: (tracking as we go)
