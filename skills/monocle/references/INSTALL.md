# Monocle Installation

The runtime is a self-contained IIFE. Drop the script in once — it's inert unless
`[data-paper-node]` elements exist in the DOM.

## Next.js (App Router)

In `app/layout.tsx`:

```tsx
import Script from "next/script";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Script src="https://skills-pearl.vercel.app/monocle.iife.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
```

## Remix / React Router

In `app/root.tsx`:

```tsx
<body>
  <Outlet />
  <script src="https://skills-pearl.vercel.app/monocle.iife.js" />
</body>
```

## Plain HTML / Astro / anything else

```html
<script src="https://skills-pearl.vercel.app/monocle.iife.js"></script>
```

## Annotating Paper-exported components

Paper's exported code ships with a comment above each component, e.g.:

```tsx
/**
 * from Paper
 * https://app.paper.design/file/01KN3QGZ2REZDFZ3FZCNWXEANN?node=F18-0
 * on Apr 4, 2026
 */
export function Card() {
  return <div>…</div>;
}
```

Monocle can't read that comment at runtime — it scans the DOM. Add a
`data-paper-node` attribute to the root element of each exported component.
Minimum case:

```tsx
export function Card() {
  return <div data-paper-node="F18-0">…</div>;
}
```

If different components come from different Paper files, set `data-paper-file`
per element. Otherwise set a single `fileId` once in the config (below).

Optional attributes:

| Attribute          | Purpose                                       |
| ------------------ | --------------------------------------------- |
| `data-paper-node`  | Paper node ID (e.g. `F18-0`). Required.       |
| `data-paper-file`  | Paper file ID. Falls back to config.fileId.   |
| `data-paper-name`  | Display name in the panel. Falls back to id/tag. |

## Config

Drop a hidden config element anywhere in the DOM. All fields optional.

```tsx
<div
  data-monocle={JSON.stringify({
    fileId: "01KN3QGZ2REZDFZ3FZCNWXEANN",
    open: true,
  })}
  hidden
/>
```

| Field    | Type      | Default                                               |
| -------- | --------- | ----------------------------------------------------- |
| `fileId` | `string`  | —                                                     |
| `open`   | `boolean` | `true`                                                |
| `link`   | `string`  | `https://app.paper.design/file/{file}?node={node}`    |

If no config element exists, monocle still runs — "open in paper" falls back
to copying the node ID to the clipboard.
