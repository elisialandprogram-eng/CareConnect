---
name: Invoice PDF CommonJS interop
description: The production bundle's jspdf-autotable export shape differs from the development ESM default import.
---

Use `import { autoTable } from "jspdf-autotable"` for server-side invoice PDF generation.

**Why:** The development loader accepted the package's default import, but the production esbuild CommonJS bundle exposed the callable function as the named `autoTable` export, causing every download to fail with `default is not a function`.

**How to apply:** When changing invoice PDF dependencies or imports, run the production build and execute a representative PDF generation fixture against the compiled CommonJS shape.