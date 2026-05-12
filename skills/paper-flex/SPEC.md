# Paper Flex Specification

## Intent

`paper-flex` helps agents convert Paper design nodes from flat absolute positioning into readable flex structure while preserving visual fidelity.

The skill exists because generic layout refactors often lose Paper-specific details: SVG path data, image fills, clone ordering, hidden shadows, and absolute offsets that remain after cloning.

## Scope

In scope:

- Paper MCP absolute-to-flex conversion
- `x-paper-clone` preservation for SVGs, images, icons, masks, and complex styled shapes
- Flex spacing derived from computed coordinates
- Z-order planning, layered cards, overlays, and badge placement
- Screenshot and tree validation before completion

Out of scope:

- Turning Paper designs into production React code
- General HTML/CSS layout advice outside Paper
- Recreating artwork from screenshots

## Users And Trigger Context

- Primary users: agents editing Paper designs through MCP tools
- Common requests: "convert this Paper layout to flex", "make this artboard auto-layout", "fix this absolute Paper node tree", "preserve visuals while restructuring"
- Should not trigger for: normal React/Tailwind implementation from Paper exports, single-property visual tweaks, or non-Paper CSS refactors

## Runtime Contract

- Required first actions: read the Paper MCP guide, inspect selection/basic info, capture screenshot, inspect tree/children, and collect computed styles
- Required outputs: converted Paper node/tree plus a concise note of validation performed
- Non-negotiable constraints: clone existing complex visual nodes, avoid delete-and-recreate, verify clone offsets/z-order/shadows, and finish with screenshot comparison
- Expected bundled files loaded at runtime: `references/layered-cards.md` only when the design includes overlapping cards, back cards, badges, labels, or corner marks

## Source And Evidence Model

Authoritative sources:

- Current `SKILL.md`
- Paper MCP guide and live tool outputs during an invocation
- `references/layered-cards.md` for stack-specific behavior

Useful improvement sources:

- positive examples: conversions where screenshots match and the tree is readable
- negative examples: lost SVG/image fidelity, wrong z-order, visible hidden shadows, or clone offsets inside flex flow
- eval results: RED/GREEN Paper conversion prompts and human visual review

Data that must not be stored:

- secrets
- private customer designs beyond the minimum redacted reproduction notes
- image URLs or node IDs that are not needed for a durable repro

## Reference Architecture

- `SKILL.md` contains the runtime workflow and completion checklist
- `references/layered-cards.md` contains the focused card-stack branch
- `scripts/` and `assets/` are not used

## Evaluation

- Lightweight validation: run a RED/GREEN prompt against a representative absolute-to-flex Paper conversion scenario
- Deeper evaluation: compare real Paper screenshots and tree summaries before/after conversion
- Holdout examples: layered cards, icon/image rows, hidden-shadow cards, and mixed clone/div z-order cases
- Acceptance gates: no recreation of complex visual nodes, verified clone offsets, verified z-order, and screenshot match

## Known Limitations

- Visual equivalence still needs human or screenshot review.
- Some Paper tool behavior can change; update the skill when the MCP guide or clone behavior changes.

## Maintenance Notes

- Update `SKILL.md` when runtime tool sequence or non-negotiable conversion rules change.
- Update `references/layered-cards.md` when card stack behavior changes.
- Add evidence references only for durable, redacted examples that reveal a new recurring failure mode.
