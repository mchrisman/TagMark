This file includes general instructions for coding assistants working on this repo. The user will also provide specific instructions for the immediate task.

This repository holds new frontend framework, **TagMark**. This is a mini-framework which is anticipated to be under **2000 LOC**, not counting the libraries mentioned below. It must be implemented in **pure JavaScript**, **no build step**, and should run directly in the browser.

Familiarize yourself with the directory structure and read `doc/original-spec.md` carefully. This is the primary specification document.

Before making any changes, consider carefully how the change fits into the overall architecture, and whether the change is consistent with the project philosophy and goals. It will ultimately be the user's choice whether to proceed with a change, but push back on changes that seem detrimental.

When ambiguities arise, resolve them yourself without further discussion if there is an obviously better solution and no architectural implications.

When making decisions, consider the *entire* architecture and choose the design that keeps TagMark coherent, minimal, and internally consistent.

The code must be compact — not by abridgment or code-golf, but by finding elegantly simple solutions and expressing them with clarity.  **But do not sacrifice required semantics to minimize line count**. 

**Priorities:**

1. Correctness & completeness
2. Clarity
3. Brevity

## Library code

The project references several libraries. Make **no modifications** unless correcting an essential bug.

### `lib/ActDown*` and `lib/DeepProxy*`

These supply VDOM reconsiliation and reactivity to a global state, as explained in the spec.

The preamble of `ActDown.js` describes its usage; the whole library is small enough to read fully.
We will also use `actdown-ext-forms.js`.

### `lib/diff_utils.js`, `lib/plf.js`

Do **not** use these in the implementation. They may be used only for **debugging** (e.g., printing readable diffs via `ObjectDiff`).

### `lib/tendril/`

Tendril is “regex for structures.” It is available but *not expected* to be needed. If structural pattern matching becomes useful, this is the preferred library.

## Prototype code

Some historical code may be helpful for reference.

### `urlSync.js`

This **should be heavily re-used**. It already does almost exactly what we need; refactor it into the TagMark architecture and move the updated version into `src/`.

### `prototype/Phoenix.js`

**Must not be used directly.**
It is provided only to illustrate ideas about component integration.
Phoenix implemented its own storage mechanism; TagMark will now provide the local state. Phoenix’s state keys were an early form of TagMark’s SID concept.
