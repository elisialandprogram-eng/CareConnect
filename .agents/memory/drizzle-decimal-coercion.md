---
name: Drizzle decimal coercion
description: Drizzle decimal() columns map to z.string() in Zod; numeric inputs from frontend must be coerced to String() before insertSchema.parse()
---

## Rule
`decimal()` columns in Drizzle ORM generate `z.string()` in the Zod insert schema (not `z.number()`). Frontend JS sends JavaScript numbers (floats/integers). If you call `insertSchema.parse()` directly with `{ taxRate: 5.5 }` you get `ZodError: Expected string, received number`.

**Why:** PostgreSQL DECIMAL/NUMERIC columns are returned as strings by the `pg` driver to preserve precision. Drizzle mirrors this in Zod.

**How to apply:**
- Before any `insertSchema.parse(req.body)` for tables with decimal columns, coerce: `taxRate: String(req.body.taxRate)`, `discountValue: String(req.body.discountValue)`, etc.
- OR use `.extend({ taxRate: z.coerce.string() })` on the schema before parse.
- Columns in this codebase that need coercion: `tax_settings.tax_rate`, `promo_codes.discount_value`, `appointments.total_amount`, `invoices.total_amount`.
