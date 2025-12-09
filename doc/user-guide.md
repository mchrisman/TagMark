
# TagMark User Guide

TagMark is a no-build HTML/JS extension.
Drop <tag-mark> tags into your page. 
Enhance your HTML with reactivity.
Minimal, consistent, explicit language.
Compact apps, less boilerplate.
Elements have state, forms in tabs don't lose their data.
Stable language, intentionally LLM-friendly. Good for humans too.
One manual. One cookbook. Zero ecosystem. What a relief!

TagMark drops into your web page.11111
Drop <tag-mark> into your page. Enhance your HTML.
Compact apps, compact grammar
Resurrected forms don't stammer
Stable language, designed for LLM coders. Good for humans too.
One manual. One cookbook. Zero ecosystem. What a relief!


```html
<h2>Todo List</h2>

<tag-mark def="@List as local" init="{ { items: [], nextId:0 } }">

    <input name="text"
           bind="@List.text"
           placeholder="New task…"/>

    <button disabled="{!@List.text}"
            def="$textValue:={@List.text}"
            onclick="@{ @List.items[@List.nextId++]= $textValue , @List.text = '' }">
        Add
    </button>

    <Loop each="$item as value, $i as index of {@List.items} marked by {$i}">
        <div>
            <span>{$item}</span>
            <button onclick="@{ delete @List.items[$i] }">
                Delete
            </button>
        </div>
    </Loop>
    <Else>
        No items yet!
    </Else>

</tag-mark>
```
Notes: `@List.txt` isn't a resolved value, it's a handle into live state.  `{ }` denotes a pure expression, in which handles are resolved; `@{ }` denotes a possibly effectful expression, in which handles are reactive proxies.  `<Loop>` can handle sparse arrays.

-----------------------------------------------------------------

# **1. What is TagMark?**

TagMark is a **declarative UI language** embedded directly inside HTML.
You write ordinary HTML, plus a few special tags and expressions:

* `{expr}` → **pure expression** (reads state, cannot modify anything)
* `@{expr}` → **effect expression** (may update state when events fire)

Apps have **explicit, predictable state** stored in named *handles* like:

* `@Global` — shared state for the whole page
* `@Url` — state synced with the URL hash
* `@Form` — form-local state
* `@ComponentName` — per-instance component state

There is **no build step**, no magic reactivity, and no hidden scopes.
TagMark is *just HTML* plus a small predictable set of rules.

---

# **2. The Mental Model**

TagMark expresses UI as **HTML + reactive state handles**.

* A *handle* (`@Something.path`) refers to a location inside shared application state.
* A `{…}` pure expression **reads** from handles but always produces plain values.
* A `@{…}` effect expression can **write** to handles and update state.

When state changes, TagMark re-renders the relevant DOM.

Try to remember only three things:

1. **Handles reference state; they are never values on their own.**
2. **Pure expressions cannot mutate state.**
3. **Effect expressions are only for event handlers.**

---

# **3. Expressions**

## **3.1 Pure expressions `{ ... }`**

* Evaluated in *pure mode*.
* May read from `@handles` but cannot mutate.
* The result becomes text or an attribute value.

Examples:

```html
<div>{ 1 + 2 }</div>
<div>{ @Global.count }</div>
<div>{ @Todo.done ? "Done" : "Pending" }</div>
```

If a pure expression attempts a write, TagMark throws a hard error.

---

## **3.2 Effect expressions `@{ ... }`**

Used only in event handlers (`onclick`, `onsubmit`, etc).

```html
<button onclick="@{ @Global.count = (@Global.count || 0) + 1 }">
    Add
</button>
```

Effect expressions access handles in “effect mode,” meaning reads and writes go directly to underlying reactive state.

Allowed constructs:

* Assignment: `@Foo.x = 5`
* Increment/decrement: `@Foo.x++`
* Call simple imported functions
* Basic JS expressions

---

# **4. Variables and Handles**

## **4.1 `$variables`**

Lexically scoped constants:

```html
<div def="$x := { 3 * 7 }">{ $x }</div>
```

They do not change.

---

## **4.2 `@handles`**

Handles reference specific reactive namespaces.

### Built-in handle roots:

| Handle           | Meaning                        |
| ---------------- | ------------------------------ |
| `@Global`        | shared across the page         |
| `@Url`           | synced with URL hash           |
| `@Form`          | state for a specific `<form>`  |
| `@TagMark`       | root-level local state         |
| `@ComponentName` | local state within a component |

You access deeper paths by dot notation:

```html
{@Global.user.name}
```

---

# **5. Control Flow**

## **5.1 Conditionals: `<When>` and `<Else>`**

```html
<When test="{@Global.loading}">
    Loading…
</When>
<Else test="{@Global.error}">
    Error!
</Else>
<Else>
    Done!
</Else>
```

Rules:

* `<Else>` must follow a `<When>` or `<Loop>`.
* First matching branch renders; others are skipped.
* Each branch has its own identity for state purposes.

---

## **5.2 Loops: `<Loop>`**

### Basic form:

```html
<Loop each="$item as value of {@Global.items} marked by {$item.id}">
    <div>{$item.name}</div>
</Loop>
```

Key points:

* `each=` determines iteration variables.
* `marked by` determines **row identity** (important for preserving per-row state).
* Values inside `{}` are evaluated in pure mode.

Shortcuts:

* Arrays may use `marked by index`.
* Objects may use `marked by field`.

Example with indices:

```html
<Loop each="$i as index, $v as value of {@Global.colors} marked by index">
    {$i}: {$v}
</Loop>
```

---

# **6. Components**

Components are declared using `<Name:Template>` and used via `<Name>`.

### **Definition:**

```html
<Counter:Template params="@count">
    <button onclick="@{ @count++ }">+</button>
    <div>Value: {@count}</div>
</Counter:Template>
```

### **Usage:**

```html
<Counter count="{@Global.total}"/>
```

### Component-local state:

Inside `<Counter:Template>`, the handle `@Counter` refers to its own local namespace:

```html
<Counter:Template>
    <button onclick="@{ @Counter.expanded = !@Counter.expanded }">
        Toggle
    </button>
    <When test="{@Counter.expanded}">
        <div>Details…</div>
    </When>
</Counter:Template>
```

State persists as long as the component retains the same identity (SID).

---

## **6.1 Slots**

Components may accept children:

```html
<Card:Template params="$title">
    <h2>{$title}</h2>
    <Card:Slot/>
</Card:Template>

<Card title="{'Hello'}">
    <p>World</p>
</Card>
```

---

# **7. Forms**

Every `<form>` automatically receives a local state namespace called `@Form`.

```html
<form onsubmit="@{ alert(@Form.email) }">
    <input name="email"/>
</form>
```

Rules:

* A field’s `name` determines the corresponding key in `@Form`.
* Values persist across rerenders.
* You can override binding using:

```html
<input name="email" bind="@User.email"/>
```

### Special field behaviors:

| Input type      | Stored value                   |
| --------------- | ------------------------------ |
| file            | FileList                       |
| checkbox        | boolean or array (if multiple) |
| radio           | selected value                 |
| select multiple | array of values                |

---

# **8. Initialization (`init`)**

You may initialize a component or form’s state:

```html
<Foo init="{ {open: false, count: 0} }">
    {@Foo.count}
</Foo>
```

Rules:

* `init` runs **once per SID**, before the first render.
* May appear on the template *or* on the usage, not both.
* Must evaluate to an object.
* Cannot be used on bound forms.

---

# **9. URL Synchronization**

Use the `<Url>` tag to declare which properties of `@Url` sync with the URL hash:

```html
<Url include="tab, userId"></Url>
<button onclick="@{ @Url.tab = 'profile' }">Profile</button>
```

Two modes:

* `include` → changes create browser history entries
* `includeTransient` → changes do **not** create history entries

Unmounting a `<Url>` element removes its keys from the URL.

---

# **10. Best Practices**

* Keep expressions simple.
* Prefer `$constants` for short-lived variables inside templates.
* Use stable `marked by` identifiers that match underlying data.
* Do not mutate state in `{}`.
* Prefer small components.
* Use `bind` for shared form state across `<When>` branches.

---

# **11. Common Pitfalls**

* Attempting assignment inside `{}` → error
* Duplicate loop markers → error
* Using both template-level and usage-level `init` → error
* Using `value=` on form fields → overwritten by binding
* Misplacing `<Else>`
* Forgetting that component state persists via SID

---

# ============================================

# **2. TagMark Technical Specification**

# ============================================

*(This is the authoritative, implementation-focused specification.
It is deliberately denser and more formal than the User Guide.)*

---

# **1. Architecture Overview**

TagMark is a declarative layer on top of the **ActDown** virtual DOM engine.
All `<tag-mark>` roots share a single ActDown instance and a **single global state object**.

TagMark performs:

1. Static preprocessing of `<*:Template>` definitions
2. Runtime expansion of TagMark constructs into ActDown VDOM
3. Expression evaluation in controlled scopes (pure or effect)
4. Binding of DOM events to effect expressions
5. State synchronization for URL and forms
6. SID-based identity management for DOM nodes and local namespaces

TagMark constructs are valid HTML; TagMark does not introduce a custom parser.

---

# **2. State Model**

State is stored in a central reactive proxy provided by ActDown. TagMark divides it into namespaces:

* **Global namespace** — referenced via `@Global`
* **URL namespace** — referenced via `@Url`
* **Local namespaces** — created per-SID using `stateForId("local:<sid>")`

A **handle** is a lightweight descriptor of a path inside one of these namespaces.

### Handle structure:

```
{ root: "global" | "url" | "<sid>", path: ["a","b","c"] }
```

Accessing a handle results in:

* Pure mode: frozen snapshot
* Effect mode: proxied object capable of mutation

Handle identity is preserved in effect mode and unwrapped in pure mode.

---

# **3. Expression Semantics**

## **3.1 Pure Expressions `{…}`**

Evaluated using:

* Snapshot/unwrap of handles
* Immutable deep-frozen values
* No assignment allowed

If mutation is attempted: **error**.

Pure expressions appear in:

* Text nodes
* Normal attribute values
* `test=`, `each=` parsed expressions
* Component parameters
* `init`

---

## **3.2 Effect Expressions `@{…}`**

Evaluated in effect mode:

* Handles become proxies with writable paths
* Assignments and increments permitted
* Reads return live reactive values
* May call imported JS functions

Effect expressions must appear only in event attributes.
Side effects propagate through ActDown and trigger a rerender.

---

# **4. Scope and Variables**

Each TagMark node introduces a lexical scope with:

* `$variables` — plain JS values
* `@handle` names — mapped to handle objects
* `import="a,b,c"` — declares JS globals accessible by name

`def` grammar:

```
$NAME := {EXPR}
@NAME := @HANDLE.path
```

Evaluation occurs **after** `import` and **before** `test`.

Case-insensitive matching applies for `$names` and handle names.

---

# **5. Initialization (`init`)**

Initialization rules:

1. Applies only to elements with an associated local namespace:

    * Components
    * Forms
    * Elements using `as local`

2. Runs **once per SID**, before first render.

3. `init` expression is pure; must evaluate to a plain object.

4. If template and usage both declare `init`, this is an error.

5. Bound forms (`<form bind="…">`) may not use `init`.

Local namespaces persist across unmount/remount until SID changes.

---

# **6. Structural Identifiers (SID)**

SID = stable identity for:

* DOM reconciliation
* Local state namespace lookup
* Component identity
* Form identity
* Conditional branches

SID is computed from:

* Parent SID
* Static source location (`TAG#INDEX` sequence)
* Optional `marker=` attribute
* For `<Loop>`, the **row marker** (`marked by`)

Two nodes have the same SID iff:

* They have identical static ancestry
* They have identical marker values (if applicable)

Changing SID → new local namespace.

---

# **7. Detailed Semantics**

## **7.1 `<When>` / `<Else>`**

* `<Else>` must follow `<When>` or `<Loop>`.
* Evaluation order: first matching branch wins.
* Each branch has its own SID segment; state does not cross branches.

---

## **7.2 `<Loop>`**

Grammar:

```
each="$x as role, ... of {EXPR} marked by MARK"
```

Roles:

**Arrays:**

* index
* value
* isFirst
* isLast

**Objects:**

* field
* index
* value
* isFirst
* isLast

Marker must be:

* `index` for arrays
* `field` for objects
* `{EXPR}` for custom markers

Duplicate markers → **error**.

Loop expands into the concatenation of the VDOM produced by iterating over children for each item.

Iterations inherit a new scope containing declared variables.

---

## **7.3 Components**

### Definition-time:

* Template is stored.
* Parameter list is parsed.
* Optional template-level `init`.

### Instantiation:

1. Parameter expressions evaluated in parent scope (pure)
2. Component body rendered in new scope containing:

    * Parameter values
    * Handle `@Name` for its local namespace
    * Slot children supplied by user

Slot expansion replaces `<Name:Slot>` with actual nodes.

Component state persists as long as SID persists.

---

## **7.4 Forms**

All `<form>` elements receive a handle `@Form` pointing to their local namespace unless they use `bind`.

Automatic binding rules:

* Each form element with a `name` and no `bind` → bound to `@Form.name`
* File inputs produce FileList
* Checkbox groups produce arrays
* Radio groups produce a single value
* Select multiple produces an array
* Text inputs update on `input` and `change`

Bound forms (`bind="@Some.where"`) map `@Form` to the given handle and disable init.

Forms in different `<When>` branches have different SIDs unless sharing a bound handle.

---

## **7.5 `<Url>`**

Declarative element with attributes:

* `include="a,b,c"` — persistent
* `includeTransient="x,y"` — no history entries

Mounting:

* Adds keys to URL sync whitelist.
* Unmounting removes them, unless preserved by another `<Url>`.

Sync rules:

* On load: all URL keys populate `@Url`.
* State → URL: only keys declared by mounted `<Url>` elements.
* URL → state: overwrites `@Url` keys.

---

# **8. Rendering Algorithm**

Per element:

1. Compute source path segment
2. Apply `import`
3. Apply `init` (if first render)
4. Apply `def`
5. Evaluate `test` (decides presence)
6. Evaluate attributes
7. Evaluate children recursively

Structural tags (`<When>`, `<Loop>`) do not appear in final DOM; their children do.

---

# **9. Error Handling**

TagMark enforces **hard errors** for:

* Invalid pure-expression mutations
* Duplicate loop markers
* Ambiguous `def` declarations
* Case-insensitive name collisions
* Invalid `init` placement
* Misplaced `<Else>`
* Invalid handle references
* Two `<tag-mark-global>` elements
* Template multiple `init` declarations
* Invalid `each` grammar

Errors propagate to ActDown’s error boundary system.

---

# **10. Future Work / Non-goals**

Future (optional):

* Derived values
* Watchers
* Partial rerender optimization

Permanent non-goals:

* SSR
* Comprehensive forms framework
* Typescript typing guarantees

---

# ============================================

# **3. TagMark Cheat Sheet (1-page reference)**

# ============================================

# **TagMark Quick Reference**

## **Expressions**

* Pure: `{expr}` — reads state, no mutations
* Effect: `@{expr}` — in event handlers only

Allowed in effect expressions:

```
@Foo.x = 3
@Foo.count++
doThing(@Foo.value)
```

---

## **Variables & Handles**

```
$val := {expr}         # constant
@h := @Global.path     # handle
```

Built-in handles:

* `@Global`
* `@Url`
* `@Form`
* `@TagMark`
* `@ComponentName` (inside templates)

---

## **Conditionals**

```html
<When test="{expr}">...</When>
<Else test="{expr}">...</Else>
<Else>...</Else>
```

First matching branch runs.

---

## **Loops**

```html
<Loop each="$item as value of {expr} marked by {$item.id}">
    ...
</Loop>
```

Array roles: `index`, `value`, `isFirst`, `isLast`
Object roles: `field`, `index`, `value`, `isFirst`, `isLast`

Markers:

* Arrays → `marked by index`
* Objects → `marked by field`
* Or `{expr}`

Duplicate markers = error.

---

## **Components**

**Definition:**

```html
<Widget:Template params="$title, @dest">
    <h1>{$title}</h1>
    <Widget:Slot/>
</Widget:Template>
```

**Usage:**

```html
<Widget title="{'Hi'}" dest="{@Global.path}">
    Child content
</Widget>
```

Local state: `@Widget.x = ...`

---

## **Forms**

Automatic binding:

```html
<form>
    <input name="email"/>
    <!-- bound to @Form.email -->
</form>
```

Special types:

* checkbox: boolean or array
* radio: selected value
* select multiple → array
* file → FileList

Override:

```html
<input name="email" bind="@User.email"/>
```

---

## **Initialization**

```html
<Foo init="{ {x:1, y:2} }">
```

* Runs once per SID
* Template OR usage, not both
* Not allowed on bound forms

---

## **URL Sync**

```html
<Url include="tab,userId"></Url>
@{ @Url.tab = 'profile' }
```

* `include` → adds history entries
* `includeTransient` → no history entries

Unmounting removes keys unless another `<Url>` declares them.

---

## **SID Rules (Identity)**

State sticks to SID. SID changes when:

* Component appears in a different position
* Loop marker changes
* Parent SID changes
* `marker=` attribute differs

SID stays stable under:

* Re-renders
* Non-structural conditionals changing neighbors

---

## **Common Errors**

* Mutating inside `{}`
* Duplicate loop markers
* Misplaced `<Else>`
* Using `value=` on bound form fields
* Using both template- and usage-level `init`
* Expressions that fail to compile inside interpolation

---

# ============================================

# **Next Steps**

If you'd like, I can:

* Produce these as **standalone Markdown files**
* Add diagrams/examples
* Generate a **canonical cookbook** with 20–30 examples
* Add a **formal grammar** section
* Tighten terminology or rename features

Just tell me what refinement you want.
