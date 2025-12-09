
# TagMark overview

TagMark is a no-build HTML/JS extension.
Drop <tag-mark> tags into your page. 
Enhance your HTML with reactivity.
Minimal, consistent, explicit language.
Compact apps, less boilerplate.
Elements have state, forms in tabs don't lose their data.
Stable language, intentionally LLM-friendly. Good for humans too.
One manual. One cookbook. Zero ecosystem. What a relief!

# First example

This will let you taste the language. The code is mostly readable even to the uninitiated.

```html
<h2>Todo List</h2>

<tag-mark def="@List as local" init="{ { items: [], nextId:0 } }">

    <input name="text"
           bind="@List.text"
           placeholder="New task…"/>

    <button disabled="{!@List.text}"
            def="$textValue:={@List.text}"
            onclick="@{ @List.items[@List.nextId++]= $textValue , 
                        @List.text = '' }">
        Add
    </button>

    <Loop each="$item as value, $i as index of {@List.items} marked by {$i}">
        <div>
            <span>{$item}</span>
            <!-- Loop can handle sparse arrays -->
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
# TagMark's niche

**TagMark optimizes for:** 
- Simplicity; explicit, visible behavior
- Compact expression
- Zero-build
- LLM Friendliness
   - Small syntax, compact apps, small implementation, all easily fits in LLM's context window
   - Frozen language. Usually just one way to do things.
   - Explicit cookbook with carefully curated examples. Patterns emphasized over libraries.
   - New language, no corpus of bad patterns on the web.

**React optimizes for:**
- large teams
- large apps
- performance
- ecosystem

## When to Use TagMark

✅ Quick prototypes and demos
✅ Internal tools and admin panels  
✅ Teaching reactive concepts
✅ Single-file applications
✅ Hobby projects
✅ Interactive documents
✅ Progressive enhancement of existing pages
✅ LLM-generated UIs
✅ No-build-step requirement

## When to Use React/Vue/Svelte

✅ Large production applications
✅ Mobile apps (React Native)
✅ Need for extensive component ecosystem
✅ Team already knows it
✅ Complex state management requirements
✅ Performance-critical applications


-----------------------------------------------------------------

# User guide

# Key Concept: **Handles and State**

TagMark is built around the concept of **handles** into **state objects**.  A handle is a pointer to a *place* (which may or may not exist) in the state object's tree.  It looks like this:

    `@Global.company.employees`

Here, `@Global` is the global state object; and '.company.employees' points to a *place* (which may or may not exist) in that object's tree. 

    `<div>There are {@Global.company.employees.length()} employees.</div>`

Handles can be used in JavaScript expressions for both reading and mutating state. **Any state mutation triggers a full DOM refresh.** (There is deliberately no control over this. We sacrifice performance for predictability.) 

    `<button onclick="@{@Global.company.employees[$userId].name=$newName}>Change name</button>`

**@Global** is not the only state handle. You have:

| **State handle**             | **Lexical scope**             | Associated with identity of           |
|------------------------------|-------------------------------|---------------------------------------|
| @Global                      | Anywhere                      | nothing                               |
| @TagMark                     | The enclosing <tag-mark> root | The enclosing <tag-mark> root element |
| @Form                        | The enclosing form            | The enclosing form element            |
| @Foo (for a "Foo" component) | The <Foo:Template>            | A <Foo> element                       |

And **any element** may have its own local state object, declared "as local", which persists even if the element is hidden then re-shown:

    `<span def="@MyState as local">`

You can initialize local state with 'init':

    `<span def="@MyState as local" init="{ {x:1,y:2} }">`

You can define aliases:

    `<div def="@Name := @Global.loggedInUser.name">`

# Key Concept: Stable Identities (SID)

In TagMark, **every** runtime element is marked with a **stable identity (SID).** The SID answers the question of which elements are "the same element" as the DOM changes over time.  Local state objects are
tied to an SID.

This is best understood with an illustration.

    <Loop each="$switch as value of {$lightSwitches} marked by {$switch.id}">
        <div def="@Local as local">
            <input type=checkbox 
                   bind="@Local.toggle" 
                   onclick="@{@local.toggle = !@local.toggle}"> 
            Light {$switch.name}
        </div>
    </Loop>

Each `<div>` gets its own SID, and therefore its own @Local state with its own toggle flag. The 'marked by' clause in <Loop> is mandatory. It distinguishes between the repeated elements in the loops, so that they can each have their own SID, which is stable, even if the list is reordered. **If an element is removed from the list and then added back, it retains its identity and its state**, even though it may be realized as a new DOM element.

👉🏻 **Subtle difference from React**:  In React, the 'key' attribute is really just a performance aide.  In TagMark, the 'marked by' clause influences how state persists. In this example, if you say "marked by {$switch.id}", then the checkbox state will stay with the particular switch even if the switches are reordered. But if you say "marked by index", then the checkbox state will stay with the iteration index, ignoring the actual identities of the switches.

There will be more examples later.

# Key Concept: declarations and expressions

TagMark is its own language. Although it interoperates with JavaScript.

TagMark has three kinds of variables. All of them are lexically scoped to the tag in which they are declared (in the source code) and its children. All of them may be shadowed by declarations of children.

- **1. Handles (@Foo)**, as explained before.

- **2. Constants ($bar)**, declared with 'def'. It is only constant within its lexical scope. It may take a different value on each rendering pass.  Within the body of a loop, it may take a different value on each iteration.

- **3. Imported JavaScript symbols**, imported with 'import'. **Caution**: This has nothing to do with ES5 module imports. It just brings in the x and y symbols from the local JavaScript lexical environment.

```
   <div def="$two := {1+1}            // Simple JS expression
             $three := {$ef+1}        // TagMark variables can appear in JavaScript expressions. 
             $name := {@User.name}    // The handle is resolved to its current value (more below)
             
             // Special forms          
             @Cd as @Ab[$i],          // Define a handle alias.
             @Ab as local,            // Give a name to this element's local namespace
             $r as reference"/>       // Like 'ref' in React, points to DOM node, but in TagMark,
                                      // $r is a managed object: $r.el in future always tracks 
                                      // the DOM element associated with the same identity.
   
   <script> let x=5; let plus=(a,b)=>a+b; </script>      
                                
   <div import="plus,x" def="$y:=10">
       Total: {plus(x,$y)}  <!-- 15 -->
   </div> 
```

JavaScript expressions are always, without exception, enclosed in curly brackets. There are two forms:

**"Pure" expressions: `{expression}`**
- Not permitted to mutate state as a side effect.
- Handles are visible but are made immutable. Attempts to mutate them will throw an error. 
- They resolve to their current values.

**"Effective" expressions: `@{expression}`**
- May mutate state as a side effect.
- Handles are expressed as deep proxies, which intercept mutations in order to trigger refreshes.
- The mutable handles may be passed to external JavaScript code. If so, they remain reactive. This is the normal way to allow external JavaScript to interact with TagMark state.
- Effective expressions are only permitted in handlers such as `onClick`, `onMount`, etc. They are not permitted in the path of a rendering cycle (i.e in ordinary attributes or text interpolations.)


# **Conditionals: `<When>` and `<Else>`**

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
* Each branch has its own Stable Identity (SID) for state purposes. If you have widgets with local state inside the branches, for example form fields, their state persists as you switch back and forth.
* Switching branches does not affect the stability of any SIDs (in parents, children, anywhere)
* Normal rules of lexical scoping apply. Symbols declared on the `<When>` tag are not visible in the `<Else>` tag.

---

# **Loops: `<Loop>`**

## Simple form

The simple form iterates over the **items** of an array or the **values** of an object's fields.

```html
<Loop each="$x of {@Global.items} marked by {$item.id}">
    <div>{$x.name}</div>
</Loop>
```
Shortcuts:

* Arrays may use `marked by index` **if appropriate**
* Objects may use `marked by field` **if appropriate**

## Long form

In the long form, there are a few other variables you can declare. The actual variable names are arbitrary.

**When iterating over an array:** Both "as value" and "marked by" are mandatory.
```html
<Loop each="$i as index,         // array index (For sparse arrays, missing indices will be skipped.)
            $v as item,          // item of array
            $first as isFirst,   // boolean
            $last as isLast      // boolean
            of {@Global.colors} marked by index">
    {$i}: {$v}
</Loop>
```

**Quit iterating over fields in an object:** At least one of ("as value", "as field") is mandatory; "marked by" is mandatory. No guarantee is made about the order of the fields. The isFirst/isLast refer to the first and last iteration.

```html
<Loop each="$i as index,         // iteration index
            $k as field,         // field name / key
            $v as value,         // value of field
            $first as isFirst,   // boolean - first of the *iteration*
            $last as isLast      // boolean - last of the *iteration*
            of {@Global.colors} marked by field">
    {$k}: {$v}
</Loop>
```




## Nested loops

Nested loops are just fine. To avoid confusion, don't shadow variables. Each loop needs its own 'marked by' clause, giving an identity marker relevant to that loop. The markers don't have to be globally unique. They just have to be unique amongst their siblings.
```html

<Loop each="$cat of {@categories} marked by {$cat.id}">
    <Loop each="$item of {$cat.items} marked by {$item.id}">
        ...
    </Loop>
</Loop>
```





---

# **6. Components**

TagMark components (not web components, unless you want them to be) are declared using `<Name:Template>` and used via `<Name>`.


```html
<Counter:Template params="@COUNT,$INCREMENT">
    <button onclick="@{ @COUNT+=$INCREMENT }">+</button>
    <div>Value: {@COUNT}</div>
</Counter:Template>
```

Pass @handles using `@{ }`. Pass $values using `{ }` (or without braces for "string literals").

| Parameter Type | How to Pass                                                                               | Example                                        |
|---|-------------------------------------------------------------------------------------------|------------------------------------------------|
| `@handle` | `COUNT="@{@Global.count}"`                                                                | Passes reactive handle                         |
| `$value` | `INCREMENT="{10}"` or `INCREMENT="{someExpression}"` or `INCREMENT="{@Global.increment}"` | Passes evaluated value (not a reactive handle) |
| `$value` (string) | `VALUE="hello"` or `VALUE="{'hello'}"`                                                    | String literal (braces optional)               |



The parameter names needn't be uppercase. This example uses uppercase to make clear the distinction between the parameter and the input.

```html
<Counter count="@{@Global.total}" increment="{10}"/>
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

When you use <Counter> multiple times, each gets its own @Counter namespace tied to its own SID. So each Counter maintains separate @Counter.expanded state.
```
<Counter count="@{@Global.a}" increment="{1}"/>
<Counter count="@{@Global.b}" increment="{5}"/>
```  

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

Renders as

<Card>
    <h2>Hello</h2>
    <p>World</p>
</Card>

```

## Named slots; slots with params

It's a little unintuitive, but slots are essentially callbacks, so params work in the opposite direction.

We embrace the use of custom tags. Every component will be realized as a tag of the same name.

```html
<List:Template params="$items">
    <Loop each="$item as value, $i as index of {$items} marked by {$item.id}">
        <row:Slot item="{$item}" index="{$i}">
            <!-- default row -->
            <div>{$i}: {$item.name}</div>
        </row:Slot>
    </Loop>
</List:Template>
```

Usage:

```html

<List items="{@Global.users}">
    <row params="$item,$index">
        <span>{$index+1}.</span>
        <strong>{$item.name}</strong>
    </row>
</List>
```





---

# **Forms**

Every `<form>` automatically receives a local state namespace called `@Form`.

```html
<form onsubmit="@{ alert(@Form.email) }">
    <input name="email"/>
</form>
```
A field’s `name` determines the corresponding key in `@Form`. The fields bind to the @Form automatically, and values persist across rerenders, even if the form disappears and then later reappears.

You can override binding, either for the whole form or for single fields:

Fields that are not inside a form tag get no reactive behavior unless you explicitly bind them individually.

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

Other than the above, forms get no special treatment. They submit normally. Their event handlers work normally. You can add event handlers to handle the submission using `TagMark`.
---

# Forward references

This is especially useful for sharing element references or form state. It avoids a couple of anti-patterns that would otherwise come to mind.

```
<div forward-def="$r">
    <div def="$r as reference">...</div>
    <div onmount="@{doSomething($r)}"/>
</div>

<div forward-def="@name">
    <form def="@name as @Form.name">
        ... form fields including a name field ...
    </form>
    Name: {@name}
</div>
```



# **Initialization (`init`)**

You may initialize a local state:

```html
<Foo init="{ {open: false, count: 0} }">
    {@Foo.count}
</Foo>
```

`init` runs **once per SID**. It must evaluate to an object. 

For components, it may appear on the template or on the usage, but not both.

Cannot be used in conjunction with 'bind'.


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
