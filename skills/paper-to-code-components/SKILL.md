---
name: paper-to-code-components
description: Use when implementing Paper MCP, Paper-to-code, design-to-code, Viewfinder, or Paper-exported JSX in React/Next.js apps. Covers component candidates, repeated visual groups, prop shapes, data-paper-* roots, and avoiding monolithic JSX.
---

# Paper-to-Code Componentization

You turn Paper designs into React/Next code with component boundaries identified before JSX grows.

Hard rule: before writing implementation JSX for a Paper design, map the design hierarchy and component candidates. Pixel fidelity and componentization are both required.

## RED/GREEN Intent

This skill prevents these Paper-to-code failures:

- Dumping a whole artboard into one giant route or component
- Spotting repeated cards, rows, or controls only after the file is huge
- Removing Viewfinder `data-paper-*` attributes from useful roots
- Adding client hooks only to manage static visual variants

GREEN outcome: repeated visual groups are extracted once, page files read as composition, and the implemented UI still matches Paper.

## 1. Extract the Design Hierarchy First

Before coding, inspect the Paper selection/tree/screenshot and identify:

1. Page shell and semantic regions
2. Navigation, hero, content sections, sidebars, overlays, and footers
3. Repeated cards, rows, messages, list items, badges, pills, and controls
4. Icon button variants, CTA variants, input variants, and menu items
5. Reusable asset treatments: avatars, logo lockups, screenshot frames, masks, shadows, and image crops

Write a short hierarchy note in your working context before implementation. Do not skip this because the export looks straightforward.

## 2. Choose Component Candidates

Create a named component when any of these are true:

1. A visual group appears two or more times, including near-duplicates
2. A semantic region has a reusable role, such as `PricingCard`, `MessageRow`, or `FeatureSection`
3. A control has variants, such as `IconButton`, `Pill`, `Badge`, or `CTAButton`
4. A repeated card, row, message, or list item changes only text, icon, media, color, or state
5. An asset treatment repeats, such as an avatar frame, logo mark, image mask, or screenshot shell

Near-duplicates use variant props or slots. Do not copy and tweak the same JSX block.

## 3. Define Boundaries and Props

For each component candidate, define before or while coding:

1. Component name based on semantic UI role, not Paper layer names
2. Responsibility in one sentence
3. Props for changing text, icons, media, hrefs, state, and visual variants
4. `children` or named slots for flexible content areas
5. The root element that keeps relevant `data-paper-*` attributes

Keep one-off decorative leaf elements inside the nearest semantic component. Extract repeated decoration into a small component only when the treatment repeats.

## 4. Implementation Rules

- Preserve Paper visual fidelity: spacing, typography, color, radius, shadows, image crops, and responsive behavior must still match the design.
- Keep Viewfinder/Paper `data-paper-*` attributes on useful rendered roots. If splitting exported JSX, move the relevant attributes to the new component's root.
- Use the project's existing styling system: Tailwind where nearby code uses Tailwind, CSS modules where nearby code uses CSS modules, and existing tokens when present.
- Prefer React Server Components in Next.js. Add `"use client"` only for state, browser APIs, event handlers that need client behavior, or client-only animation libraries.
- Do not add hooks for static presentational variants. Use props, classes, CSS variables, or data attributes.
- Reuse existing app components, icons, assets, and helpers before creating new local versions.

## Example

**Bad:** Paste the full Paper export into `app/page.tsx`, duplicate six testimonial cards inline, and plan to "clean it up later" after pixel matching.

**Good:** Before coding, identify `HeroSection`, `FeatureCard`, `TestimonialCard`, and `IconButton`. Implement `FeatureCard({ icon, title, body, tone })`, render the six cards from data, and keep each component's root `data-paper-*` attribute where Viewfinder needs it.

## Escape Hatches Closed

| You Think | Do This Instead |
|---|---|
| "The export is small enough." | Still map hierarchy and extract repeated groups before completion. |
| "I'll componentize later." | Componentize during implementation. Later cleanup is not the workflow. |
| "Pixel matching requires one giant file." | Match pixels with component props, slots, and local styles. |
| "These groups are almost the same, not identical." | Use variant props or slots unless the semantic responsibility differs. |
| "The user only asked to paste the design." | Paper-to-code implementation includes component boundaries. |
| "`data-paper-*` attributes clutter the JSX." | Keep them on useful roots so Viewfinder can map code back to design. |
| "This static variant needs a hook." | Use props/classes/CSS instead. Hooks are for behavior, not static appearance. |

## Before Marking Complete, You MUST:

1. Document the Paper hierarchy and component candidates before or during coding
2. Extract every repeated visual group, control, card, row, message, and repeated asset treatment into a named component
3. Define prop shapes for extracted components before their JSX becomes duplicated
4. Keep route/page files as composition, not giant copied JSX exports
5. Preserve Paper visual fidelity after componentization
6. Keep relevant Viewfinder/Paper `data-paper-*` attributes on rendered roots
7. Use the project's existing styling system and avoid unnecessary client components/hooks
8. Read `package.json` and run available scripts named `lint`, `typecheck`, `test`, and `build` with the repo's package manager; if a script is missing, state that it is missing
9. Review the final diff and remove duplicated JSX blocks before responding

Do not skip any step. No exceptions for "small export," "just this once," "the user did not ask," "pixel matching first," or "I'll refactor after it works."
