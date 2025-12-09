# TagMark



## Design Philosophy

TagMark is a small, declarative UI notation focused on compactness, LLM friendliness, and readability.It avoids React’s complexity and invisible behaviors through predictable state semantics, explicit scopes, constrained expressions, WYSIWYG behavior, and a single consistent coding style. Its apps are compact because it needs very little structural boilerplate. The result is a uniform, low-friction environment ideal for small apps, rapid prototypes, and LLM-assisted development.

Although meant to be quite usable by humans, LLM friendliness is of equal importance, not an afterthought. Key points are:

- Should be amenable to few-shot learning
- Entire library can fit into LLM's context window
- Lack of training data on the web is actually a bonus: A carefully constructed cookbook must be provided, but there are no competing bad patterns out on the web.
- Syntax is explicit

*Additional thoughts*: With regard to ecosystem, I haven't articulated this before, but have a few heretical thoughts. **This is intended to be a frozen language with no ecosystem** (once polished, and permitting safe nonbreaking bugfixes). No evolution to confuse LLMs with multiple paradigms. No feature bloat[^1] to detract from the core advantage that it's small enough for an LLM to assimilate at a glance, source code and all. An explicit provided training set/cookbook to encourage consistent results and presented as definitive in preference to whatever examples may be found on the web. Lack of massive layered frameworks is seen as an advantage in prototyping and small, cheap apps.

[^1] Except for two additional optional layers that are in conceptual stage:

1. A simple layout component library designed along the same philosophical lines, with the goal of producing compact apps, using obvious composition patterns, with no CSS, that produces non-broken layouts with reasonable usage, trading flexibility for safety and brevity (think Markdown);
2. A flexible but low-user-api-surface, low-authoring-barrier skinning system, with a couple of default skins; its goal is to allow for creative expression (within reason; think styled Markdown) as long as the author follows some basic rules about spacing.2 / 2
   In the long run, TagMark may ship two optional, frozen “standard kits”:

A tiny layout library: opinionated, CSS-free, geared towards “non-broken by default” layouts, more like Markdown than a full UI framework.

A simple skinning system: a few packaged visual styles with a small, stable set of knobs.

These are not an open-ended ecosystem. They’re finite, curated layers designed with the same constraints as TagMark itself: small enough to fit in an LLM’s context, stable enough to learn once, and opinionated enough to discourage custom micro-frameworks.
**TagMark fails fast.**
Any construct that the language cannot interpret unambiguously or safely—syntactically or semantically—is a hard error rather than a warning.
Ambiguous behavior is never silently allowed; TagMark does not “guess” your intent.

## Basic concepts

TagMark is a Web Component `<tag-mark>`, within which TagMark tags and ordinary HTML tags may be arbitrarily mixed. TagMark does not have a parser per se. It is valid HTML and may be included in any page.

TagMark tags include

- `<Loop>` for iteration
- `<When>` for conditionals
- `<*:Template>` for component templates

You can have more than one `<tag-mark>` root on a page. 

No explicit build step is required. The final HTML is rendered as ordinary DOM (not shadow DOM).

## Variables

TagMark "variables" are either:

- **Constant variables** (starting with `$`) — immutable values bound at render time
- **Handles** (starting with `@`) — References to reactive state proxies.
- **Imported variables** from JavaScript via `import` (no prefix)

TagMark provides certain state handles automatically, depending on context:

### **Local (per-instance) state**

These refer to state namespaces created for specific elements:

* `@Foo` inside a `<Foo:Template>` — the component’s local state
* `@Form` inside any `<form>` — the form’s local state
* `@TagMark` inside an `<tag-mark>` root — the root app’s local state

### **Global (page-wide) state**

These refer to state shared across all TagMark roots on the page:

* `@Global` — page-wide shared state
* `@Url` — page-wide state synchronized with the URL hash (see *URL Synchronization*)

Note: TagMark's state system is built on top of ActDown's singleton reactive state, but this underlying state object is not directly exposed. The namespaced handles above provide controlled access to specific portions of the singleton, keeping internal implementation details (local state namespaces, URL state, etc.) hidden.

## Reactive Values, Handles, and Proxies

TagMark's state system is built on a layered proxy architecture. At the lowest level, ActDown maintains a deep reactive proxy over the application state; every read and write passes through that proxy, which allows the framework to track dependencies and schedule updates. TagMark does not expose this raw state directly. Instead, TagMark introduces *handles*, which are path-based selectors—lightweight proxy objects whose sole purpose is to describe "the place in state I want to read or write."

A handle does not hold a value. It is not a snapshot. It is a *reference* to a location inside reactive state, even if that location does not yet exist. For example, `@Foo.user.name` is a handle that refers to "the `name` property of the `user` object inside this instance of the `Foo` component," regardless of whether that `name` property has ever been set. Reads and writes through handles are always routed through the underlying reactive proxy, which ensures that updates are tracked correctly and that the UI reacts deterministically.

Because handles are proxy objects, TagMark must treat them differently from ordinary values. Whenever TagMark evaluates an expression inside single curly braces, it guarantees that the resulting value is *not* a proxy. Any handles encountered during that evaluation are automatically unwrapped to their underlying primitive or structured value, producing a stable, non-reactive snapshot. This allows pure expressions to be used safely in rendering without leaking mutability or reactive behavior into parts of the system where it does not belong.

By contrast, effect expressions preserve the proxy identity of handles. An effect expression is the only place where a handle may be used as a target of assignment, and writing through a handle always triggers the correct reactive updates. This distinction—pure expressions versus effect expressions—is crucial for both security and predictability.

## Pure Expressions: `{ ... }`

Whenever a value appears inside `{ ... }`, TagMark evaluates that content as a pure expression. A pure expression may read from handles but may not mutate them. This ensures that the result is a plain JavaScript value with no reactive identity attached to it.

Authors should keep pure expressions simple: arithmetic, property access, array and object literals, conditionals, and function calls. 

TagMark must detect and prevent attempted mutations of state and treat them as errors. This can be done either by unwrapping proxy objects or by wrapping them in immutable proxies.

Pure expressions may appear in:

- Text nodes (text interpolation)
- Attribute values (text interpolation or truthiness test)
- Special TagMark attribute syntax (e.g., in `<When>` or `<Loop>`)

For example:

```html
<div>{ $count + 1 }</div>
<div>{ @Foo.expanded ? "Open" : "Closed" }</div>
```

In each case, the expression is evaluated in pure mode. Even when reading from `@Foo.expanded`, the value is immediately unwrapped; the expression receives only a boolean, not a proxy. This consistency eliminates accidental reactive leaks and prevents subtle bugs where mutations occur inside what should be a pure calculation.

Conditional Attributes: When an attribute's value is entirely an expression (e.g., width="{expr}"), returning null or undefined will omit the attribute from the rendered element. This doesn't apply to partial interpolation (e.g., class="prefix-{value}"), which always renders the attribute. It doesn't apply to special TagMark attributes like 'bind'.

For boolean HTML attributes (e.g. disabled, checked), if the expression evaluates to false, "false", null, or undefined, the attribute is omitted. Otherwise, the attribute is present.

## Effect Expressions: `@{ ... }`

Whereas pure expressions produce ordinary values, effect expressions are allowed to *change* state. An effect expression appears inside `@{ ... }` and uses a slightly richer expression language that supports assignments, simple increment/decrement operations, and calls to small, explicitly permitted helper functions.

Effect expressions may refer directly to handles. For example:

```html
<button onclick="@{ @Foo.expanded = !(@Foo.expanded || false) }">
    Toggle
</button>
```

Here, `@Foo.expanded` is a handle referring to a piece of component state. Inside the effect expression, TagMark preserves the handle's identity rather than unwrapping it. The assignment is routed to the underlying reactive system, which then schedules the necessary UI updates.

The effect language is deliberately simple. Effect expressions perform small, declarative updates to state in response to user actions. Authors should keep them focused on assignments and simple operations.

Effect expressions may only appear in event handler attributes (e.g., `onclick`, `onsubmit`).

## Security Model

TagMark is designed for use with trusted application code, in the same process and origin as the host page. It does not provide a sandbox for untrusted authors or arbitrary third-party templates, and implementations are not required to prevent expression code from accessing JavaScript globals or the surrounding environment. Hosts that need to run untrusted TagMark code MUST provide isolation using separate processes, origins, or other security mechanisms beyond TagMark itself.

## Expression Evaluation

In V1, expressions inside `{…}` and `@{…}` are evaluated as ordinary JavaScript expressions in a controlled scope. TagMark applies its own semantics on top of this—pure expressions must not mutate state and automatically unwrap proxies, effect expressions may perform assignments and preserve proxy identity, and imports may be restricted by the host runtime—but the syntax and parsing behavior are those of JavaScript, not a separate TagMark-specific language.

Future versions may introduce a smaller, fully specified expression subset or dedicated evaluator, but this is not required in V1. Authors who wish to maximize forward compatibility should keep expressions simple and side-effect-free outside of `@{…}`.

## Declarations and imports

In any TagMark or ordinary HTML tag, variables may be declared using `def`. These have the lexical scope of the current tag, and can shadow parent variables, and do not leak into component bodies. Component bodies are evaluated with their own lexical scope; parent scopes are not captured unless explicitly passed as attributes.

Declarations are separated by commas and take one of these forms:

- $VAR := {EXPR}   // may include @HANDLE.path expressions, which get resolved.
- @HANDLE := @HANDLE.path

Example:  `<div def="@user := @Global.users[$uid], $cost := {$user.cost}">`

(Advanced: `as local` syntax for explicit local state on arbitrary elements is covered in the Advanced section.)

External JavaScript variables and symbols may be imported. Imported names behave like JavaScript identifiers. They do not get $ prefixes. They are visible only in the tag’s lexical scope.

Example:  `<div import="var1,var2">{var1+var2}</div>`

import does not load modules; it simply makes existing JavaScript symbols available to expressions in this element’s lexical scope. It is an error if the name collides with that of an TagMark variable in the same scope.

## Execution order

Render-time (each element, top-down):

2. Compute marker and SID (internal structural identifier)
3. `import`
4. `init`
5. `def`
6. `test`
7. Other attributes
8. Recurse into children (expanding loops/conditionals, instantiating components)

When instantiating a component, parameter expressions are evaluated in the parent scope, then the component body renders with its own scope where the parameters are bound.

## State initialization

A component's local state may be initialized using `init`:

```
    <Foo init="{ {x:yes} }">
        The state is {@Foo.x}.  <!-- "yes" -->
    </Foo>
```

It may also be declared on the `<Foo:Template>`, but not in both places. Declaring `init` on both the template and the usage is an error. Applications SHOULD initialize local state to an object, not a primitive.

This works for any component, including forms (which are components). It cannot be used on forms with `bind`, and cannot initialize shared state (`@Global`). Implementations SHOULD warn on invalid use.

---

### Semantics

For any element that has an associated local namespace and declares `init="{EXPR}"`:

1. When a new instance is created (i.e., a new SID with no existing namespace):

    * A new empty state object is allocated for that namespace.
    * The `init` expression (from either the template or the usage, but not both) is evaluated once as a **pure expression**, producing a plain object.
    * That object becomes the initial state.
2. These assignments **do not trigger a render** and are treated as having occurred before the element’s first render.
3. On re-renders with the same SID, `init` is not re-run. State persists across unmount/remount by default.

Although the SID may be derivable earlier, the namespace is not accessible to TagMark code until initialization is complete; therefore the initialization is unobservable.

---

### Examples

```html
<!-- Component definition with init -->
<Foo:Template init="{ { open: false, count: 0 } }"> … </Foo:Template>
<Foo/>  <!-- uses template's init -->

<!-- Or, component usage with init (template must not have init) -->
<Bar:Template> … </Bar:Template>
<Bar init="{ { open: false } }"/>

<!-- Unbound form -->
<form init="{ { subscribe: true } }"> … </form>

<!-- Invalid: bound forms -->
<form bind="@User.data" init="{ ... }">  <!-- disallowed -->
```

## Conditionals

```html
<When test="{isBusy}">I'm busy</When>
<Else test="{isAnnoyed}">Go away!</Else>   <!-- the "else if" idiom -->
<Else>Hello!</Else> 
```

`<Else>` may only appear immediately after a `<When>` or `<Loop>`.

## Iteration/looping

The `<Loop>` tag is the only iteration construct. Iteration is specified via the `each` attribute.

The simplest form, when iterating over *values* of an object or array, is

```
<Loop each="$user of {@Global.users} marked by {$user.id}">
<!-- or -->
<Loop each="$user of {@Global.colors} marked by index">
```

### `marked by` clause and row marker

Each `<Loop>` iteration has a **row marker**.
The row marker determines:

* which DOM node is reused when the list changes (similar to React's `key`)
* **and** which local state for that row (component state, form fields, etc.) is preserved or reused

The `marked by` clause defines the row marker, which TagMark uses to distinguish repeated expansions of the same template when computing SID. The marker must distinguish siblings, but does not need to be globally unique.

The clause is mandatory, and may be:

* `marked by index` — marker is the iteration sequence number
* `marked by field` — marker is the object property name (objects only)
* or any expression that produces a stable per-item identifier (e.g. `marked by {$item.id}`)

**Rule of thumb:**
Choose a `marked by` value that matches how you address the underlying data inside the loop.

* If your bindings use array positions (e.g. `@Global.colors[$i]`), use **`marked by index`**.
* If your bindings treat each item by its own stable identifier (e.g. `@Item.color` or `@Global.colorsById[id]`), use **`marked by {$item.id}`**.

If the loop has no per-row local state, the choice of marker only affects DOM reuse. Once any row contains state, using the correct `marked by` clause becomes essential for predictable behavior.

### Additional bindings

If you want more than just the *values*, you can bind variables to iteration roles.

**For arrays:** `index`, `value`, `isFirst`, `isLast`
- `index` is both the array index and the iteration sequence number
- `marked by index` or `marked by {expr}`

**For objects:** `field`, `index`, `value`, `isFirst`, `isLast`
- `field` is the property name
- `index` is the iteration sequence number (0, 1, 2...)
- `marked by field` or `marked by {expr}`

Using `marked by index` on an object or `marked by field` on an array is an error.

---

Examples:

```html

<Loop each="$i as index, $user as value of {@Global.users} marked by {$user.id}">
    <div>Row {$i} | User ID {$user.id} | Name {$user.name.first}</div>
</Loop>
<Else>No users</Else>

<Loop each="$first as isFirst, $prop as field, $val as value of {@Global.config} marked by {$prop}">
    <When test="{!$first}"><br></When>
    <div>Property {$prop} | Value {$val}</div>
</Loop>
```

When `def` is used in `<Loop>`, it is evaluated after `each`, once per iteration, and its declared variables are lexically scoped as 'inside' the loop.

The `each` attribute may only appear on `<Loop>`. No iteration-within-arbitrary-tags is allowed.

The syntax of `each` is:

```
        EACH = BINDINGS 'of' '{' EXPR '}' 'marked by' MARKER
        BINDINGS = VAR | (BINDING (',' BINDING)*)
        BINDING = VAR 'as' ROLE
        VAR = /$\w+/
        MARKER = '{' EXPR '}' | 'index' | 'field'

        # For arrays:
        ROLE = 'index' | 'value' | 'isFirst' | 'isLast'
        MARKER = '{' EXPR '}' | 'index'

        # For objects:
        ROLE = 'field' | 'index' | 'value' | 'isFirst' | 'isLast'
        MARKER = '{' EXPR '}' | 'field'
```

## Components

Components are reusable units of UI. A component definition declares parameters using `params`, and its body uses those parameters like normal scoped variables. Components have:

- Parameters (props) declared with sigils (`$` for values, `@` for handles)
- Per-instance local state, accessible via an implicit `@ComponentName` handle
- Instantiation in the DOM as custom tags of the same name

Component bodies do not inherit parent lexical scopes unless values are explicitly passed as attributes.

### Component-Local State

Every component has access to its own isolated state namespace. When a component is defined as `<Foo:Template>`, TagMark automatically provides a handle named `@Foo` that refers to that component instance's local state. This handle is available inside the component body without any additional declaration.

Inside this definition, `@TogglePanel` is the handle for that component's internal state. Anything stored here belongs to this specific instance and will persist across re-renders while remaining isolated from sibling or parent instances.

#### ⚠️ Local State and Identity

Components (including forms) **persist their local state by default**, even if temporarily unmounted by a `<When>` toggle. TagMark associates state with a component's **structural identifier** (its SID). As long as an element reappears with the same SID, its state is reused.

**1. Cause an element to have a different SID**

(and therefore a **fresh state namespace**)

Any of the following will produce a new SID:

1. The element declares a different marker (in `<Loop>`s, a different `marked by` value)
2. The element appears in a different static location in the source:
   the two instances in `<MyComponent/><MyComponent/>` always have different SIDs.
3. The element has a parent with a different SID.

**2. Manual state reset**

State persists by default across unmount/remount. To reset state, you can:
- Manually clear it in an event handler: `onclick="@{ Object.keys(@MyComponent).forEach(k => delete @MyComponent[k]) }"`
- Use `bind` to point to a different state object

### Parameters

```html
<!-- Definition -->
<Widget:Template params="$title, $color">
    <h1>{$title}</h1>
    <div style="color: {$color}">Content</div>
</Widget:Template>

<!-- Usage -->
<Widget title="My Page" color="{$selectedColor}" class="happy"/>

<!-- Renders as -->
<Widget class="happy">
    <h1>My Page</h1>
    <div style="color: blue">Content</div>
</Widget>
```

Parameters are passed as attributes. The attribute name matches the parameter name (without sigil). The sigil in the definition determines what kind of value is expected:

- `$param` expects any expression: `param="{$count+1}"` or `param="literal"` or `param="{@SomeComponent.something}"`
- `@param` expects a handle expression: `param="{@SomeComponent.something}"`

Nested composition and recursion are permitted (e.g., a component may instantiate itself).

### Slots

Components can accept children via slots. The default slot captures untagged children; named slots capture children with matching tag names.

```html
<!-- Definition with slots -->
<AddressWidget:Template params="@address, $title">
    <h2>{$title}</h2>
    <AddressWidget:Slot/>
    <div><input name="street" bind="{@address.street}"/></div>
    <div><input name="city" bind="{@address.city}"/></div>
    <div><input name="zip" bind="{@address.zip}"/></div>
</AddressWidget:Template>

<!-- Usage -->
<AddressWidget address="{@CheckoutPage.shipping}" title="{'Shipping'}">
    Please enter your shipping address.
</AddressWidget>

<!-- Renders as -->
<AddressWidget>
    <h2>Shipping</h2>
    Please enter your shipping address.
    <div><input name="street" bind="{@CheckoutPage.shipping.street}"/></div>
    <div><input name="city" bind="{@CheckoutPage.shipping.city}"/></div>
    <div><input name="zip" bind="{@CheckoutPage.shipping.zip}"/></div>
</AddressWidget>
```

Named slots with fallback content:

```html
<!-- Definition -->
<Card:Template params="$title">
    <h2>{$title}</h2>
    <Card:Slot/>
    <footer:Slot>Default footer</footer:Slot>
</Card:Template>

<!-- Usage -->
<Card title="{'Hello'}">
    <p>Main content</p>
    <footer>Custom footer</footer>
</Card>

<!-- Renders as -->
<Card>
    <h2>Hello</h2>
    <p>Main content</p>
    <footer>Custom footer</footer>
</Card>
```

## Forms, automatic binding

Forms behave normally and don't lose their state due to reactive refreshes.

Fields bind automatically and bidirectionally to a local state object named `@Form`, which is an alias for the local state of the enclosing `<form>`. Keys of `@Form` are the fields' `name` attributes. (This mechanism works only inside a `<form>`.)

```html
<form import="doSomethingWith"
      onsubmit="@{ doSomethingWith(@Form.email) }">
    <input name="email"/>
</form>
```

Initial field values are taken from `@Form`. The values are initially undefined (blank), but you may use `init` where necessary. `@Form` data persists across renders.

### Explicit binding

When `bind` is used on a `<form>`, `@Form` inside that form becomes an alias for the bound handle (`@PrefsEditor` in the example below). This allows form data to be accessed from outside the form and to persist independently of the form's lifecycle.

For example, since alternate branches of a `<When>` have different SID identities, these two forms **do not** share the same `@Form` state:

```html
<PrefsEditor:Template params="$userType">
    <When test="{$userType == 'admin'}">
        <form>...fields...</form>
    </When>
    <Else>
        <form>...fewer fields...</form>
    </Else>
</PrefsEditor:Template>
```

The recommended idiom—if you want both branches to share the same state—is to bind both forms to a handle defined externally. For example:

```html
<PrefsEditor:Template params="$userType">
    <When test="{$userType == 'admin'}">
        <form bind="@PrefsEditor">...fields...</form>
    </When>
    <Else>
        <form bind="@PrefsEditor">...fewer fields...</form>
    </Else>

    The name is: {@PrefsEditor.name}
    <!-- Updates dynamically; the same value is shared across both forms' name fields. -->
</PrefsEditor:Template>
```

**Special field types:**

@Form follows standard HTML form serialization:

- **File inputs:** `@Form.avatar` contains a FileList object
- **Select multiple:** `@Form.colors` is an array of selected values
- **Radio groups:** Multiple `<input type="radio" name="size">` share the same
  @Form.size, which contains the value of the checked radio
- **Checkbox groups:** Multiple `<input type="checkbox" name="tags">` create
  `@Form.tags` as an array of checked values
- **Single checkbox:** `@Form.subscribe` is a boolean (true if checked)

Example:

```html

<form>
    <input type="file" name="avatar"/>           <!-- @Form.avatar is FileList -->
    <select name="colors" multiple>              <!-- @Form.colors is array -->
        <option value="red">Red</option>
        <option value="blue">Blue</option>
    </select>
    <input type="radio" name="size" value="S"/>  <!-- @Form.size is "S", "M", or "L" -->
    <input type="radio" name="size" value="M"/>
    <input type="radio" name="size" value="L"/>
    <input type="checkbox" name="subscribe"/>    <!-- @Form.subscribe is true when checked, undefined when unchecked -->
</form>
```

Do not use the 'value' attribute (it would just get clobbered by the state binding).

### Manual field binding

Although binding fields to `@Form` properties is the default, you can bind a field to any handle using `bind`:

```html
<input name="email"/>                              <!-- implicitly bound to @Form.email -->
<input name="email" bind="@UserProfile.email"/>   <!-- bound to @UserProfile.email instead -->
```

## Web Components

TagMark embraces Web Components as the standard way to implement lifecycle events, timers, observers, animations, and other imperative behaviors. TagMark provides a base class (`TagMarkElement`) that makes TagMark state and bindings available to Web Component code, enabling seamless reactive integration.

Within an TagMark component body, plain HTML tags and Web Component tags work equally well. Web Components participate naturally in TagMark's data flow through `bind` for reactive handle binding and `on-*` for event handling.

## URL Synchronization

The `<Url>` element declares which `@Url` properties sync with the browser's URL hash. It is a **declarative, empty element** — it does not wrap content. Place it anywhere within an `<tag-mark>` root to declare the sync keys.

**Important:** The `<Url>` element should be empty. It is purely declarative and has no scope — wrapping content in it gives the misleading impression that there is some significance to the scope.

### Basic Usage

```html
<Url include="selectedTab, userId"></Url>
<div>Current tab: {@Url.selectedTab}</div>
<button onclick="@{ @Url.selectedTab = 'profile' }">Profile</button>
```

The `include` attribute lists which `@Url` properties participate in URL sync. Changes to included properties update the URL; URL changes update `@Url`.

### Persistent vs. Transient

**Persistent** (`include`) — changes create browser history entries:

```html
<Url include="page, userId"></Url>
```

**Transient** (`includeTransient`) — changes update the URL without adding history entries:

```html
<Url includeTransient="scrollPosition, sidebarOpen"></Url>
```

Use `include` for navigation state users may bookmark or revisit via back/forward. Use `includeTransient` for ephemeral UI state such as scroll positions or temporary UI toggles.

### Presence-Based Sync

Only `@Url` properties listed by currently mounted `<Url>` elements appear in the URL. The effective whitelist is the union of all `include` / `includeTransient` keys from all mounted `<Url>` elements.

```html
<Url include="theme"></Url>
<When test="{@Url.theme === 'dark'}">
    <Url include="brightness"></Url>  <!-- only synced when visible -->
    <BrightnessControl/>
</When>
```

When a `<Url>` element unmounts (e.g., via conditional), its keys are removed from the URL (unless another mounted `<Url>` also includes them).

### Example

```html
<Url include="modalOpen"></Url>
<button onclick="@{ @Url.modalOpen = true }">Open</button>
<When test="{@Url.modalOpen}">
    <Modal onclose="@{ @Url.modalOpen = false }"/>
</When>
```

The URL updates to `#modalOpen=true` when opened, and the modal can be directly linked.

### Behavior

* **Initialization.** On page load, the URL fragment is parsed and all URL parameters are synced into `@Url` before the first render.

* **Sync direction.**

    * **URL → `@Url`:** *All* keys present in the URL fragment populate `@Url` (one-to-one by key name).
    * **`@Url` → URL:** Only keys listed in `include` or `includeTransient` on mounted `<Url>` elements are written back into the URL. When the fragment is rewritten, any other keys are dropped.

  In other words: the URL may initially contain arbitrary keys, but the app only preserves the keys it explicitly declares via `<Url>`.


## Advanced

### Explicit local state with `as local`

Most local state needs are covered by the implicit `@ComponentName` handle inside components and `@Form` inside forms. However, for advanced cases where a non-component element needs its own local state, you can use the `as local` syntax.

Every rendered node has a potential local state namespace, keyed by its structural identifier (SID). The `as local` declaration binds a handle to that namespace:

```html
<div def="@local1 as local">             <!-- @local1 is the div's local state -->
    <span def="@local2 as local"/>       <!-- @local2 is the span's local state -->

    <When test="{aCondition}">
        <!-- This <span> may disappear depending on aCondition. -->
        <!-- State persists across unmount/remount by default. -->
        <span def="@local3 as local"/>
    </When>
</div>
```

Identity for reconciliation and local state is controlled via `marker` (e.g. `marked by` clause of <Loop>). See "Architectural notes" for details on how structural identifiers are computed.

### Local state lifecycle

Local state persists even when its associated element is unmounted. This is useful for preserving state when elements are conditionally hidden and later shown again. To reset state, you can manually clear it in an event handler or use `bind` to point to a different state object.

## Error handling

TagMark is intentionally strict. Many mistakes that frameworks treat as warnings are hard errors in TagMark. This keeps the language predictable and makes problems obvious, especially when tools are limited.

Errors (for example, syntax errors; attempting to mutate a frozen snapshot; multiple loop iterations with the same key; attempting to use a handle parameter in a non-handle slot, etc. ) should, on the whole, be implemented as hard errors rather than warnings. This can be loosened later on a case-by-case basis as experience shows the need.

Components have error boundaries, and a robust JS-only error notification mechanism surfaces them visually.

## Architectural wishlist

It is TBD whether we're going to bring these into V1.

- Computed/derived value memoization
- State watchers

## Open issues

These are known gaps or design questions that need to be addressed:

1. **Top-level error handling**: Errors that occur at the root level (outside any component) currently break the entire render tree. We need a way to catch and display these errors gracefully, similar to how component-level errors are handled by ActDown's error boundaries.

2. **Programmatic error handling hook**: Currently we rely on ActDown's default behavior of inserting error text into the DOM. We should add a hook to ActDown (or use an existing one) to surface errors more programmatically, allowing TagMark to handle error display consistently and potentially trigger custom error handlers.

## Non-goals (for now)

- Typescript / type definition support
- Performance optimization, especially partial tree rendering (currently the full tree is rendered). This can become a goal if it turns out to be a problem.
- Rootless usage - e.g. dropping <Loop> into a non-<tag-mark> context

## Non-goals (permanent)

These things are not consistent with the vision for TagMark.

- Completely comprehensive form support such as you would find in a large framework.
- SSR support

## Architectural notes

### SID (internal)

SID (Structural IDentifier) is an internal stable identifier, inspired by React's 'key' attribute but going farther. It derives a unique ID for *every* node, not just iterated nodes, based on a combination of `marker` attribute and static source code position. SID is used both for DOM reconciliation and as a namespace key for local state. It is not exposed as a user-accessible variable.

Identity is controlled by:

- `marked by` clause in `<Loop>` (identity within iterations)
- `marker` attribute (low-level tool for language designers implementing features like `<Loop>`)

SID is computed with this algorithm[^3]:

```
At compile time:
    For each source element, let 'srcId' be the path from the <tag-mark> root or component definition root to the element, for example 'TOOLBAR,DIV#4,WHEN#2', which means the second <When> child of the fourth <div> child of the Toolbar component **in the source, not in rendered DOM**.
        SRCID_SEGS =  SRCID_SEG (',' SRCID_SEGS)?
        SRCID_SEG  = TAG_NAME '#' INDEX
        SRCID      = (COMPONENT_NAME | 'TAG-MARK') ',' SRCID_SEGS

At render time, for each rendered element:

    Function to compute SID:
        If 'marker' attribute exists:
            Let M be the computed value of 'marker'
        else:
            Let M=""

        If the element is the immediate child of a <Loop> iteration [^4]:
            // distinguish between iterations
            Let I = (M + computed value of the mandatory 'marked by' clause) [^1]
            // distinguish between multiple children of <Loop>
            Let C = last segment of SRCID
        else:
            Let I=""
            Let C = (M OR (last segment of SRCID))

        Let SID = hash(parent's SID, C, I) // [^2]
```
Structural tags such as <When> and <Loop> may change which children are rendered, but they MUST NOT affect the SID of their neighbors. For example, `<div><Foo/><When test=...>...</When><Baar/></div>` maintains the stability of Foo and Bar regardless of the value of the test. Ditto if you replace <When> with <Loop>. Future structural tags MUST uphold the same contract.

Note that alternate branches of a `<When>` still get different identities, as noted earlier.  These two forms don't share the same `@Form` state:

[^1] Mixing 'marker' and 'marked by' is not expected. The intended idiom is to use 'marked by' for identity within <Loop>.
[^2] 'Hash' refers to any operation that reliably produces a stable, collision-resistant identifier for practical use. It need not be cryptographic; a cryptographic hash (e.g., SHA) or a well-escaped concatenation is acceptable, as long as it avoids collisions across the reachable marker space.
[^3] Algorithm subject to change in future.
[^4] The <Loop> tag itself disappears in the rendered DOM; therefore I say 'child of a <Loop> iteration' rather than 'child of a <Loop>'.  The same principle applies to `<When>`. 


## ActDown foundation

TagMark is internally built upon ActDown, a lightweight simplified React substitute which provides VDOM, React-style reconciliation and diffing, including essential form field support. It comes with its own state mechanism, simply a mutable reactive deep proxy. It always redraws the whole page upon any state change. See the `ActDown` code and documentation for more details.

No explicit build step is required. ActDown renders the result as ordinary DOM (not shadow DOM).

So, the pipeline is: 
1. the browser parses the HTML into a DOM tree
2. the TagMark runtime walks each <tag-mark> subtree, interpreting TagMark-specific tags and attributes and building an internal representation. 
3. TagMark normalizes the internal representation and creates anonymous ActDown components to represent the TagMark components.
4. ActDown renders the VDOM normally on page load or when state is mutated.
5. 5. 


# Addendum: Ambiguities and planned resolutions

- **SID hash implementation:** Spec allows any stable collision-resistant hash/concatenation. I will use deterministic string concatenation with separators and loop markers; collisions avoided via JSON-stringified markers.
- **Error surfacing mechanics:** Spec requires robust JS-only notification. I will implement a simple error boundary wrapper that renders an error box in place of the component subtree and logs to console, rather than global overlay.
- **Expression sandboxing:** Spec allows full JS. I will evaluate expressions via `Function` with scoped locals, wrapping pure results with deep-freeze/unproxy to prevent mutation attempts, and throw on detected mutations.
- **Init placement conflicts:** If both template and usage specify `init`, I will throw an error during render. Bound forms with `init` are errors per spec—will validate at render-time.
- **Loop marker conflicts:** If `marked by index/field` is used on incompatible collection types or omitted, will throw. Duplicate markers in a single loop render will be errors.
- **Slot matching precedence:** Named slot content matched by tag name; unmatched slots use fallback content. Multiple matching children go to the named slot in order; default slot collects remaining children.
- **Event handler availability:** Only attributes starting with `on` accept `@{}` effect expressions. Pure `{}` inside event attributes is invalid—treat as literal or error? I will require `@{}` for handlers; `{}` will be treated as text interpolation if the entire attribute is `{}`.
- **Attribute omission:** For attributes that are pure-expression-only (e.g., `test`, `each`, `marker`, `params`), null/undefined is error; for general attributes with full-expression value, null/undefined will omit the attribute per spec.


# Addendum: file breakdown proposal

## Implementation file breakdown (proposal)

- **src/tagmark.js** — main runtime entry: bootstrap `<tag-mark>` roots, parse templates/components, manage scopes, evaluate expressions, orchestrate ActDown rendering, SID computation, slots, loops, conditionals, and error boundaries.
- **src/runtime/handles.js** — handle utilities: create/resolve handles against DeepProxy, unwrapping for pure expressions, aliasing, and namespace helpers for `@Global`, component locals, forms, and URL.
- **src/runtime/expressions.js** — evaluators for pure `{}` and effect `@{}` expressions with scoping, imports, mutation guards, and helper functions allowed in effects.
- **src/runtime/scope.js** — lexical scope objects for def/import/params, plus SID-to-namespace mapping.
- **src/runtime/components.js** — component definition registry, instantiation helpers, parameter validation, slot projection, template cloning, and init handling.
- **src/runtime/loop.js** — parser for `each` grammar, iteration expansion, marker validation, per-row scope/marker computation, and duplicate marker detection.
- **src/runtime/forms.js** — form binding logic, `@Form` aliasing, field auto-bind behavior, special input handling, and integration with ActDown bindings.
- **src/runtime/url.js** — refactored `urlSync` behavior: hash parsing/stringifying, `<Url>` component integration, and cleanup on unmount.
- **src/runtime/errors.js** — error boundary component and helper for throwing/rendering hard errors with contextual info.
- **src/runtime/sid.js** — SID computation utilities including source path tracking and marker combination.



# Addendum: Bootstrap

## **1. Single ActDown Instance**

There is **exactly one ActDown instance per page**.
All `<tag-mark>` roots and all TagMark-managed state namespaces (`@Global`, `@Url`) MUST use this shared instance.

Implementations MUST NOT instantiate ActDown separately for each `<tag-mark>` root.

---

## **2. Global Initialization via `<tag-mark-global>`**

TagMark provides an optional `<tag-mark-global>` element for initializing `@Global` before any `<tag-mark>` root renders:

```html
<tag-mark-global import="seedGlobal"
                 init="{ seedGlobal() }"/>
```

**Rules:**

* There **MAY be at most one** `<tag-mark-global>` per page. A second occurrence is a **hard error**.
* `<tag-mark-global>` MUST appear **before the first `<tag-mark>`** in document order.
  If it appears later, it is a **hard error**.
* Encountering `<tag-mark-global>` MUST:

    1. Create the ActDown singleton (if not already created)
    2. Create the `@Global` namespace as an empty object
    3. Create `@Url` (URL-synchronized namespace)
* The `init` expression is evaluated **once**, as a **pure expression** in the element’s local scope.

    * If the result is an object, it is **deep-merged** into `@Global`, with the `init` object taking precedence.
    * If null/undefined, it is treated as no-op.
* `<tag-mark-global>` produces **no visible DOM output**; it is purely declarative configuration.

---

## **3. Lazy Global Initialization (when `<tag-mark-global>` is omitted)**

If the page contains no `<tag-mark-global>`, the **first `<tag-mark>`** encountered MUST:

1. Create the ActDown singleton
2. Create `@Global` as an empty object
3. Create `@Url`
4. Begin rendering the root

All subsequent `<tag-mark>` roots MUST reuse this same ActDown instance.

This mode preserves backward-compatible "just drop `<tag-mark>` anywhere" behavior.

---

## **4. SID Assignment for `<tag-mark>` Roots**

Each `<tag-mark>` root MUST receive a **unique SID** (Structurally Stable Identifier). This can just be a serial number, one for each TagMark root on the page.

---

## **5. Migration Notes for Implementers**

Implementations MUST update internals as follows:

1. **Replace per-root ActDown instances with a single shared singleton.**
2. **Ensure `@Global` and `@Url` are stored in that singleton and never duplicated.**
3. **Assign unique SIDs to all `<tag-mark>` roots using the same source-path SID algorithm used elsewhere.**
4. **Ensure `@Global` initialization (if `<tag-mark-global>` is present) occurs before any root renders.**
5. **Ignore changes to structural wrappers when computing siblings’ SIDs.**
6. **Do not destroy the ActDown singleton when roots are removed from the DOM.**
   Only a full page reload resets global state.

These changes preserve the intended semantics of `@Global`, SID stability, and multi-root interoperability.


# Addendum: Case insensitive variables. 

**Identifier case rules**
TagMark treats all **TagMark-declared symbols** that begin with `$` or `@` as **case-insensitive**.
In a given lexical scope, `$user`, `$User`, and `$USER` refer to the same variable; likewise `@Foo` and `@foo` refer to the same handle.
This case-insensitivity applies to:
* Variables declared with `def`
* Parameters in `params`
* Loop bindings in `each`
* Implicit component handles (e.g. `@Foo` inside `<Foo:Template>`)
* Special handles (`@Form`, `@TagMark`, `@Global`, `@Url`)
**State property names remain case-sensitive.**
For example, `@Foo.user` and `@Foo.User` are distinct fields in the underlying state object.
**Imported JavaScript identifiers are also case-sensitive** and follow normal JavaScript rules; only `$`/`@` TagMark bindings are case-insensitive.




# Addendum: use deep proxies in pure expressions (DONE)


Align implementation with this rule:

> **`@` denotes a reactive deep state proxy. It is an error to attempt to mutate it during rendering. { } resolves values**

Concretely:

* In **render context** (pure `{…}`):
  `@Foo` and any property chain `@Foo.bar.baz` must behave as resolved snapshot values of state. Any write through them should throw a clear “cannot mutate during render” error. They are null-safe: `@Foo.bar.baz` resolves to null if @Foo.bar is null 
* In **effect context** (`@{…}` etc.):
  `@Foo` / `@Foo.bar.baz` must behave as live state handles --- but writes are allowed and routed through `writeHandle`.

---

### What to change

All changes are centered around `makeHandleProxy(app, handle, mode)`.

#### 1. Make handles deep proxies in **both** modes

Right now, nested proxies are only created in `effect` mode:

```js
if (mode === 'effect' && val && typeof val === 'object') {
  return makeHandleProxy(app, handle.extend(prop), mode);
}
```

**Change this to:**

* Always return a nested handle proxy for object values, regardless of mode:

```js
if (val && typeof val === 'object') {
  return makeHandleProxy(app, handle.extend(prop), mode);
}
```

* Preserve the existing null-safe path behavior via `readHandle` (if `base == null`, resolve as `undefined`; accessing deeper should just continue returning proxies that ultimately read as `undefined`, not throw).

This makes:

* `@Foo.bar` in `{…}` → proxy for handle `Foo.bar` (read-only),
* `@Foo.bar.baz` → proxy for handle `Foo.bar.baz` (read-only),
* and the same chains in `@{…}` → read-write proxies.

Snapshots / `freezeDeep` can still be used for `valueOf` / returning plain values if you want, but property chains now stay in “handle space”.

#### 2. Keep the **set trap** as the enforcement point

Keep (or tighten) the existing `set` trap:

```js
set: (_, prop, value) => {
  if (mode === 'pure') {
    throw new Error("Pure expressions must not mutate state");
  }
  writeHandle(app, handle.extend(prop), value);
  return true;
}
```

This ensures:

* Any direct write like `@Global.count = 1` in `{…}` → clear error.
* Any compound write like `@Global.count++` in `{…}` → clear error.
* Any helper that tries `obj.count++` on a handle in `{…}` → clear error, because it eventually hits the proxy’s `set`.

#### 3. (Optional, but nice) Keep `valueOf` returning a snapshot

For non-proxy consumers (JSON, logging, etc.) you can continue to treat `valueOf` specially:

* `valueOf` should **read** the current value via `readHandle`.
* In pure mode, you can keep returning a frozen snapshot there if you like:

```js
if (prop === 'valueOf') {
  const val = readHandle(app, handle);
  return () => (mode === 'pure'
    ? freezeDeep(snapshotValue(val))
    : val
  );
}
```

This doesn’t affect normal property chains; it only controls what you get if someone coerces the proxy to a plain value.

---

### Net effect

After this change:

* Everywhere, `@Foo` is a **deep reactive proxy**:

    * Chains like `@Foo.bar.baz` always correspond to the handle path `Foo.bar.baz`.
* In pure `{…}`:

    * Reads through `@` are allowed, null-safe, and go through the handle every step.
    * Any mutation attempt through `@` (direct or via helpers) throws a clear “pure expressions must not mutate state” error.
* In `@{…}`:

    * Same handle proxies, but `set`/mutations are allowed and go through `writeHandle`.


# Proposed simplification of explanation of case insensitive variables.

Drop all mention of case insensitivity from the user guide. The user should not need to worry about this unless they run into an error such as trying to declare two variables that differ only by case.

# Proposed  simplification of SID expanation

[ Add to user guide ]

Every element in your <tag-mark> app is automatically assigned a "Stable Identifier (SID)".
for the purpose of maintaining local state tied to that element. It is "stable" because it persists through reactive re-renderings.  

Elements that are repeated (e.g. elements in a <Loop>, or components) get their own SIDs by adding a "marker" that ties the repetiion to your data model. This is similar to React's "key" 

[ Add to technical doc ]

**Elements in a loop* - their SIDs also fold in a "marker" that aligns the element with your data model. 

    ```html

    <!-- userId = "w7", "w8", ... -->
    <Loop each="$user value of @Users marked by {$user.$userId}">  
        <!-- before expansion: SID="456" -->
        <!-- after expansion: SID="456:w7" -->
        <!-- "@Local" is tied to state namespace "456:w7" -->
        <input type="text" def="@Local as local" bind="@Local.user.user"/>
    </Loop>
    ```

**Elements in a component - their SIDs also incorporate a referencce to the SID of the calling component.**

# Proposed Simplification of JavaScript support and explanation

TagMark supports Javascript in the normal way. You can embed <script> tags, write onclick="document.forms[0].submit", etc.

To interact with TagMark features, you will need **TagMark expressions**. These are basically JavaScript expressions, in braces `{ }` or `@{ }`, with support for TagMark's state handles and const variables.  

|    Syntax  | Semantics |  Where to use |
|   {expr}      | Evaluate as regular JavaScript. State handles in { } are read-only.
Any mutation attempt throws "Cannot mutate state in pure expression."| Text interpolation, attributes, parameters. |
| @{expr} | Evaluate as regular JavaScript. May mutate state. State handles are mutable reactive proxies. | Event handlers |

There is no automatic connection of lexical scopes between the JavaScript language and the TagMark language environment. Variables or handles defined in `TagMark` have a lexical scope comprising that element (unexpanded) and its children only, and may be shadowed by variables or handles of the same name in a child. Variables from the larger JavaScript context must be imported with "import".

[Drop all language referring to "limited" expression languages.]

# Proposed simplification, or rather, improved explanation of 'markers'. 

# Proposed Simplification of JavaScript support and explanation

TagMark supports Javascript in the normal way. You can embed <script> tags, write onclick="document.forms[0].submit", etc.

To interact with TagMark features, you will need **TagMark expressions**. These are basically JavaScript expressions, in braces `{ }` or `@{ }`, with support for TagMark's state handles and const variables.

| Syntax | Semantics | Where to use |
| {expr} | Evaluate as regular JavaScript. State handles in { } are read-only.
Any mutation attempt throws "Cannot mutate state in pure expression."| Text interpolation, attributes, parameters. |
| @{expr} | Evaluate as regular JavaScript. May mutate state. State handles are mutable reactive proxies. | Event handlers |

There is no automatic connection of lexical scopes between the JavaScript language and the TagMark language environment. Variables or handles defined in `TagMark` have a lexical scope comprising that element (unexpanded) and its children only, and may be shadowed by variables or handles of the same name in a child. Variables from the larger JavaScript context must be imported with "import".

[Drop all language referring to "limited" expression languages.]

# Proposed documentation pattern

Include and highlight 'important idioms"'