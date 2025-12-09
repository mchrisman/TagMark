# Skins/styles

### Parameterized skinning

A usable base skin is provided. It has a contractual set of input parameters that are modifiable and another set of output variables that are usable. All color computations are done in oklch.

Color variations and semantic moods like error, warning, encouragements are treated as local applications of modified skins. Components, from buttons to entire apps, can just use the output variables like "var(--background)" without knowing how they were computed.

All of the following are nestable/composable in any order. Each is logically a new skin computationally derived from its parent skin, and could apply to a single element or an entire section. All of them are just setting variables.

<Skin name="watercolor" darkmode baseColor="purple">
<Tint color="red"> - Tints, does not replace, base color
<Tone tone="warning">
<Stronger font opacity contrast chroma edge>.  <Stronger> with no arguments (or <Weaker> will alter font then opacity.
<Larger> (Or <Smaller>)
<Looser font space lineSpace gaps padding> (Or <Tighter>.)

The implementation avoids wacky CSS variable resolution/inheritance rules by reiterating all of the derived properties wherever a color parameter is changed. Relative changes like "looser/tighter" operate using @component and style(), and allow both predefined discrete steps or computational increasing/decreasing.

The system allows for a wide variety of looks and textures (think 'watercolor' with torn paper edges, glowing 'neon terminal', 'whiteboard' with irregular handwriting) as long as certain constraints with regard to spacing are met. Some skins may provide additional variants for Frames etc.
Note that this skinning language works closely with the layout language (V, H, Frame, elasticity, semantic HTML etc.)

### Skin contract (colors)

(Contracts for spacing, typography are not yet defined. The following list of color variables is probably not exhaustive.)

Please overlook that this section seems overly detailed. These are just notes for what it might look like.

#### Input (tunable knobs)

*All* of these have defaults; most of the defaults are ultimately derived from --base-color-primary-light.

--base-tint
--base-untinted-color-primary-light
--base-untinted-color-primary-dark - Dark mode version of primary
--base-color-primary-light
--base-color-primary-dark - Dark mode version of primary
--dark-mode - Mode switch (0 or 1)

--tone-error-base
--tone-warning-base
--tone-info-base
--tone-good-base

--bg-texture-strength
--bg-texture-size
--bg-texture-layer
--bg-texture-blend
--bg-depth-strength
--bg-depth-layer
--bg-depth-blend

--bg-texture-layer-canvas, --bg-depth-layer-canvas
--bg-texture-layer-strong, --bg-depth-layer-strong
--bg-texture-layer-weak, --bg-depth-layer-weak

--base-color-canvas-bg-blend-mode
--base-color-surface-strong-bg-blend-mode
--base-color-surface-weak-bg-blend-mode
--base-color-accent-strong-bg-blend-mode
--base-color-accent-weak-bg-blend-mode

#### Output (components should use these)

Canvas Variables

--canvas-bg (includes layered backgrounds)
--canvas-bg-blend-mode
--color-canvas-text
--color-canvas-link
--color-canvas-border
--color-canvas-selection-text
--color-canvas-selection-bg
--color-canvas-highlight-text
--color-canvas-highlight-bg
--color-canvas-hover

Surface Strong Variables

--color-surface-strong-bg (includes layered backgrounds)
--color-surface-strong-bg-blend-mode
--color-surface-strong-text
--color-surface-strong-link
--color-surface-strong-border
--color-surface-strong-selection-text
--color-surface-strong-selection-bg
--color-surface-strong-highlight-text
--color-surface-strong-highlight-bg
--color-surface-strong-hover

Surface Weak Variables

--color-surface-weak-bg (includes layered backgrounds)
--color-surface-weak-bg-blend-mode
--color-surface-weak-text
--color-surface-weak-link
--color-surface-weak-border
--color-surface-weak-selection-text
--color-surface-weak-selection-bg
--color-surface-weak-highlight-text
--color-surface-weak-highlight-bg
--color-surface-weak-hover

Accent Strong Variables

--color-accent-strong-bg
--color-accent-strong-bg-blend-mode
--color-accent-strong-text
--color-accent-strong-link
--color-accent-strong-border
--color-accent-strong-selection-text
--color-accent-strong-selection-bg
--color-accent-strong-highlight-text
--color-accent-strong-highlight-bg
--color-accent-strong-hover

Accent Weak Variables

--color-accent-weak-bg
--color-accent-weak-bg-blend-mode
--color-accent-weak-text
--color-accent-weak-link
--color-accent-weak-border
--color-accent-weak-selection-text
--color-accent-weak-selection-bg
--color-accent-weak-highlight-text
--color-accent-weak-highlight-bg
--color-accent-weak-hover


---

# A slight evolution of the skins idea has been bubbling around in my head

which is that

- a skin should be a JavaScript class that has complete control over all of the final output parameters. There should be a base class that gives you the simple color computations that I described in the earlier documents, but all of those should be overridable, and a quality skin would be expected to fine-tune the color computations and the font size ladders and so on.
- The skins should have opportunity to get artistic. For example, a watercolor skin might have a multi-layered, subtly animated textured background. A whiteboard skin might have a handwritten font with random distortions applied. SVG would be heavily used for these effects.
- All modifiers, e.g. <Looser>, <Tint> etc. effectively and literally create a new skin. The skins have control over how these modifiers are interpreted, and a quality skin will make sure that its modified variants are also good.
- Authoring a good skin should be made very easy as long as you follow some basic rules and constraints.)
  Part of the thought here is that, in spite of the Markdown analogy, people want more freedom in visual design for their apps. And part of the thought is that people need some outlet for their artistic creativity. (And of course, part of it is that I want this for my own apps.)