---
name: paper-flex
description: Use when converting Paper canvas or design nodes from absolute positioning to flex or auto-layout. Covers Paper MCP absolute-to-flex restructuring, x-paper-clone preservation, clone z-order, computed spacing, shadow cleanup, SVG/image fidelity, layered cards, and screenshot verification.
---

# Paper Flex

You convert Paper layouts from absolute positioning into flex structure without losing the original pixels.

Hard rule: preserve existing visual nodes first. Recreate only plain layout wrappers or simple text/div surfaces whose computed styles are fully known.

## RED/GREEN Intent

This skill closes failures seen without Paper-specific guidance:

- Using generic move/relative positioning instead of `x-paper-clone` plus `update_styles`
- Losing SVG path data, image fills, crops, or exact shadows by rebuilding nodes
- Breaking z-order because Paper appends `x-paper-clone` nodes after normal divs
- Leaving cloned absolute `left`/`top` offsets inside flex flow
- Letting shadows or filters become visible/inherited after restructuring

GREEN outcome: the converted node has a readable flex hierarchy, original SVG/image fidelity, verified z-order, and a screenshot that still matches the source.

## Required First Pass

Before writing or deleting anything:

1. Call `get_guide({ topic: "paper-mcp-instructions" })`.
2. Call `get_basic_info` and `get_selection` to confirm target artboard/node scope.
3. Call `get_screenshot` on the target and keep it as the visual baseline.
4. Call `get_tree_summary(depth=10)` and `get_children` on the target.
5. Call `get_computed_styles` for the target and every direct visual child. Record `left`, `top`, `width`, `height`, colors, fonts, shadows, filters, radii, and image fills.
6. If text styling will be created or changed, call `get_font_family_info` before writing typography.

Do not start conversion from memory or screenshot alone. The computed styles are the source of truth for flex math.

## Source Preservation Rules

1. Keep the original nodes until the converted layout has passed screenshot comparison.
2. Use `<x-paper-clone node-id="...">` for SVGs, images, complex vectors, icons, masks, and styled shapes.
3. Never hand-redraw an SVG, image, logo, or complex decorative layer. No exceptions for "simple enough."
4. After cloning into flex flow, batch `update_styles` to set `left: "0px"` and `top: "0px"` on every flow clone.
5. After cloning anything that must remain overlaid, batch `update_styles` to set the required `position`, `left`, and `top`. Inline styles on `<x-paper-clone>` are not enough.

## Conversion Workflow

1. Map the absolute children into semantic groups: background, header row, text stack, media, card, controls, overlays.
2. Compute spacing from coordinates:

```text
gap = next.top - (current.top + current.height)
leftPadding = first.left - container.left
topPadding = first.top - container.top
```

3. Use Paper-compatible layout: `display: flex`, `flex-direction`, `align-items`, `justify-content`, `gap`, and wrapper `padding`.
4. Do not rely on margins. Use `gap`, padding wrappers, or explicit spacer frames for non-uniform spacing.
5. Build incrementally. Each `write_html` call should add one visual group or wrapper.
6. Use separate `write_html` calls whenever clone z-order matters:

```text
1. write_html container shell
2. write_html decorative/background clones into shell
3. write_html content wrappers/divs into shell
4. update_styles cloned positions and flow offsets
```

7. Delete original children only after the converted children exist, positions are verified, and the screenshot matches. Verify the final child list with `get_children`.

## Paper-Specific Traps

| Trap | Why It Breaks | Correct Move |
|---|---|---|
| Setting position styles on `<x-paper-clone>` | Paper ignores clone position overrides at insertion time | Clone first, then call `update_styles` |
| Mixing clones and divs in one `write_html` | Paper appends clones after divs, changing z-order | Insert decorative clones in an earlier write |
| Leaving original clone coordinates | Absolute offsets push flow items away from their flex slots | Reset flow clones to `left: "0px"`, `top: "0px"` |
| Using `position: relative` for overlapped cards | Paper stacks instead of overlapping in fixed wrappers | Use absolute cards inside a fixed-size wrapper |
| Keeping hidden source shadows | Flex order can reveal shadows that were covered before | Remove `boxShadow` on clones whose shadow was hidden by a later opaque sibling |
| Applying `filter` to a flex parent | Filters inherit and affect children unintentionally | Apply filters only to leaf nodes that need them |
| Cloning reference SVGs blindly | Some SVG clones contain empty text children | Inspect with `get_tree_summary`; delete empty Text children |

## Layered Cards

Open `references/layered-cards.md` when the design has back cards, floating badges, corner marks, or overlapping elements.

Default card stack rules:

1. Card stack wrapper is a plain fixed-size frame, not a flex container.
2. Back card is the first child.
3. Front card uses `position: absolute; left: 0px; top: 0px`.
4. Floating badges, labels, and corner marks are inside the stack wrapper as last children.

## Good And Bad Patterns

**Bad:** Delete an imported SVG, write a new `<svg>`, put it in a flex row, and eyeball the icon.

**Good:** Clone the original SVG with `x-paper-clone`, place it in the flex row, reset its flow offsets with `update_styles`, then compare screenshots.

**Bad:** One `write_html` call containing a background clone and content divs.

**Good:** Write the shell, insert background clones in a separate call, then insert content so Paper's clone ordering cannot place backgrounds on top.

## Before Marking Complete, You MUST:

1. Verify the original screenshot and converted screenshot match.
2. Verify no SVG, image, logo, mask, or complex shape was recreated instead of cloned.
3. Verify every flow clone has `left: "0px"` and `top: "0px"` via `get_computed_styles`.
4. Verify every absolute overlay clone has its intended `position`, `left`, and `top` via `get_computed_styles`.
5. Verify decorative/background clones appear earlier than content with `get_children`.
6. Verify overlapping badges/labels are last children of their stack/wrapper.
7. Verify hidden shadows are removed where flex restructuring would reveal them.
8. Verify filters are on leaf nodes only.
9. Call `finish_working_on_nodes` when done.

Do not skip any step. A skipped step means visual corruption.
