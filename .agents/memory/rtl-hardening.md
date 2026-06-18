---
name: RTL hardening pattern
description: How to apply full RTL (Farsi/Arabic) layout without page reload in this Tailwind v3 + React stack.
---

## Rule
When switching to Farsi (FA), `document.dir = "rtl"` is set by i18n.ts automatically. All RTL layout fixes must use CSS logical properties or Tailwind's built-in `rtl:` variant — never physical values that won't flip.

**Why:** The app supports FA with a live `document.dir` toggle. Physical CSS properties (mr-, ml-, left-, right-, border-l/r, text-left) don't respond to `dir` changes. Logical equivalents (ms-, me-, start-, end-, border-s/e, text-start) do.

## How to apply

### Tailwind logical property mappings
| Physical | Logical |
|---|---|
| `mr-*` | `me-*` |
| `ml-*` | `ms-*` |
| `pr-*` | `pe-*` |
| `pl-*` | `ps-*` |
| `left-*` (inset) | `start-*` |
| `right-*` (inset) | `end-*` |
| `border-l` | `border-s` |
| `border-r` | `border-e` |
| `text-left` | `text-start` |
| `text-right` | `text-end` |

### Directional icons
Add `rtl:rotate-180` to icons that point left/right:
- `ChevronRight` — submenus, breadcrumb separators
- `ChevronLeft` / `ChevronRight` — calendar nav, pagination
- `ArrowLeft` — back button
- Pattern: `<ChevronRight className="ms-auto rtl:rotate-180" />`

### Badge / absolute-positioned elements
For elements that must sit at physical right in LTR and physical left in RTL:
```
ltr:-right-1 rtl:-left-1
```

### Calendar logical nav positions
```
nav_button_previous: "absolute start-1"
nav_button_next: "absolute end-1"
```

### Global CSS (index.css)
A `[dir="rtl"]` block at the end covers:
- Form input text direction (`direction: rtl`)
- Number/tel/date inputs stay `direction: ltr; text-align: end`
- Table `th`/`td` → `text-align: start`
- Sidebar border flip
- Toast position flip

### UI primitives fixed (all in `client/src/components/ui/`)
- `dropdown-menu.tsx` — ps-8, pe-2, start-2, ms-auto, rtl:rotate-180
- `select.tsx` — ps-8, pe-2, start-2
- `context-menu.tsx` — same patterns
- `menubar.tsx` — same patterns
- `breadcrumb.tsx` — ChevronRight rtl:rotate-180
- `calendar.tsx` — start-1/end-1 nav + rtl:rotate-180 icons
- `pagination.tsx` — ps-2.5/pe-2.5 + rtl:rotate-180

### Bulk sed patterns (for page-level components)
```bash
# Search icons (input magnifiers)
sed -i 's/absolute left-3 top-1\/2 -translate-y-1\/2/absolute start-3 top-1\/2 -translate-y-1\/2/g'
sed -i 's/absolute left-2\.5 top-2\.5/absolute start-2.5 top-2.5/g'
# Password toggle buttons
sed -i 's/absolute right-2 top-1\/2 -translate-y-1\/2/absolute end-2 top-1\/2 -translate-y-1\/2/g'
# Icon spacing
sed -i 's/className="mr-2 h-4 w-4"/className="me-2 h-4 w-4"/g'
```

### What NOT to flip
- Timeline decorative lines (`absolute left-5 top-0 bottom-0 w-px`) — visual decoration, direction-neutral
- Brand logo area — always LTR
- Number/date inputs — keep `direction: ltr`
