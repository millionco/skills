---
name: monocle
description: Use when adding a layer inspector to a webpage built from Paper-exported components. Renders a floating panel over the page that lists every element carrying a `data-paper-node` attribute, and lets the user hover to highlight, toggle visibility, or deep-link to the Paper frame. Invoke when the user says "monocle", "add monocle", "layer inspector", "inspect paper nodes", or asks to wire Paper→webpage introspection.
---

# Monocle

A floating layer inspector for webpages assembled from [Paper](https://paper.design/) exports.

Paper's exported components ship with a comment that links back to the source frame, e.g. `https://app.paper.design/file/<FILE_ID>?node=<NODE_ID>`. Monocle surfaces those links at runtime: scan the DOM for `[data-paper-node]` elements, render a panel listing them, and on hover highlight the corresponding element on the page.

The runtime is a self-contained IIFE loaded from `https://skills-pearl.vercel.app/monocle.iife.js`. It auto-initializes — no wrapper component needed.

## Installation

Grep for `monocle.iife.js` in `app/layout.tsx` (or the project's root layout). If found, skip to **Step 1**. Otherwise, read `references/INSTALL.md` and follow its instructions.

## Step 1 — Annotate components

Every Paper-exported component already has a comment with its node + file ID. Lift the node ID onto the rendered root as a `data-paper-node` attribute.

**Before:**

```tsx
/**
 * from Paper
 * https://app.paper.design/file/01KN3QGZ2REZDFZ3FZCNWXEANN?node=F18-0
 */
export function Card() {
  return <div className="…">…</div>;
}
```

**After:**

```tsx
/**
 * from Paper
 * https://app.paper.design/file/01KN3QGZ2REZDFZ3FZCNWXEANN?node=F18-0
 */
export function Card() {
  return <div data-paper-node="F18-0" className="…">…</div>;
}
```

Only annotate the component's root element. Nested nodes can carry their own `data-paper-node` if relevant, but start with one per exported component.

Optional — override the display name or file ID per element:

```tsx
<div data-paper-node="F18-0" data-paper-name="hero-card" data-paper-file="01KN3QGZ…">
```

## Step 2 — Set the fileId once (if all components share a file)

Add a config element inside `<body>` of `app/layout.tsx`:

```tsx
<div
  data-monocle={JSON.stringify({ fileId: "01KN3QGZ2REZDFZ3FZCNWXEANN" })}
  hidden
/>
```

Without `fileId`, the "paper" button copies the node ID to clipboard instead of opening a deep link. Per-element `data-paper-file` overrides the config.

## Step 3 — Done

The panel appears bottom-left once the page mounts and at least one `[data-paper-node]` element is in the DOM. Features:

- **Hover a row or a page element** — highlights the pair with a blue ring + active row (bi-directional; only when the panel is expanded).
- **Click a row or a page element** — scrolls it into view and opens [budge](../budge/SKILL.md) targeting that element, so you can tweak padding / radius / gap / font-size live. Page clicks are only intercepted while the panel is expanded.
- **`paper`** — opens the Paper deep link in a new tab (or copies the node ID if no fileId is set).
- **`sync`** — placeholder (no-op for now).
- **`–` / `+`** — collapses the panel (also `Cmd/Ctrl + Shift + M`).
- **`Escape`** — closes budge if it's open.

A MutationObserver keeps the list in sync as components mount/unmount. The budge IIFE is auto-loaded on init from `https://skills-pearl.vercel.app/budge.iife.js`. No build step on the consumer side.

## Troubleshooting — panel says "no [data-paper-node] elements found"

1. Confirm at least one rendered element has a `data-paper-node` attribute. React strips unknown props on built-in elements only when the value is `undefined` — `data-*` attributes pass through.
2. Elements inside shadow DOM are not scanned. Lift the attribute up, or re-run `monocle` after the shadow root populates (future work).
3. If a framework minifies `data-*` attributes, disable that transform for paper-prefixed attributes.

## Out of scope (for now)

- No build plugin that rewrites the Paper comment into a `data-paper-node` attribute automatically — devs add the attribute manually. A future `references/` entry can document a Babel/SWC plugin once the shape stabilizes.
- No persistence of hidden state across reloads.
- No multi-file picker UI — one Paper file per page today.

Expand as real usage surfaces needs.
