# 0011 — UI tokens and primitives

**Status:** Planned

## Decision
- Keep Tailwind v4 and lucide icons. Fonts: Geist (body) and Manrope (display); Geist Mono was removed as unused.
- Map the colour tokens in `globals.css` into Tailwind `@theme` and stop using raw hex values in components. Define a small radius, shadow, and type scale.
- Extract `Button`, `Card`, `Notice`, `Field`, and `StageBadge`.
- Use Radix-based primitives when dialogs, menus, or comboboxes are needed rather than hand-building accessible popovers.
- The app shell moves into `src/app/app/layout.tsx`. Pages render only their own content, and demo vs persisted saves sit behind one client interface instead of `persistent ? … : …` branches.

## Consequences
Smaller components, consistent visuals, and a path to dark mode.
