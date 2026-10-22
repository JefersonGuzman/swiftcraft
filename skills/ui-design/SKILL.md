---
name: ui-design
description: Structure and design UI components (atomic design, container/presentational, design tokens, states, accessibility). Use when building or reviewing screens, components, forms or design systems.
---

# ui-design

## Structure

- **Atomic design** in the shared design system: atoms (button, input) → molecules (field + label + error) → organisms (header, data table) → templates (layout) → pages (routes).
- **Feature UI** lives inside its feature (`features/<f>/ui`), composed from the shared atoms/molecules. Do not put business components in the design system.
- **Container / presentational**: containers fetch data, hold state and call use cases; presentational components are pure `props → markup` and carry the Storybook/tests.

## Design tokens first

Define color, spacing, radius, type scale, shadow, motion as tokens (CSS variables or theme file). No raw hex or magic numbers in components. Support light and dark from the start.

## Every screen has five states

loading · empty · error · partial · success. Design and test all five; the empty and error states are where most UIs fail.

## Accessibility baseline

Semantic elements before ARIA · visible focus · keyboard operable · labels for every input · contrast ≥ 4.5:1 · respect `prefers-reduced-motion` · touch targets ≥ 44px.

## Forms

Validate on the boundary (schema), show errors next to the field, keep user input on error, disable submit only while pending, announce errors to assistive tech.

## Responsive

Mobile-first; content decides breakpoints; test at 360, 768 and 1280 px.

## Checklist before done

Tokens only · five states · keyboard path · responsive checked · component has a test · no business logic in presentational components.

## Go deeper (optional)

If installed, delegate polish to `impeccable` (critique, polish, typography, color) or `ui-ux-pro-max` (style/palette/font databases). This skill stays the structural baseline so the harness works without them.
