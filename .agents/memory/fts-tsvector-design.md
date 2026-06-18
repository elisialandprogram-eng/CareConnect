---
name: FTS tsvector design
description: Provider full-text search architecture — trigger vs generated column, query function choice, country safety, multilingual dictionary
---

## Rule
`providers.search_vector` is maintained by a BEFORE INSERT OR UPDATE trigger, not a GENERATED ALWAYS AS expression.

**Why:** PostgreSQL rejects GENERATED ALWAYS AS when the expression contains a STABLE function. `array_to_string(anyarray, text)` is classified STABLE (not IMMUTABLE) — the generated column DDL fails with an immutability error. Triggers have no volatility restriction.

**How to apply:** Any future tsvector column on a table that joins array fields must also use the trigger pattern. Do not attempt GENERATED ALWAYS AS.

## Trigger objects (providers table)
- `providers_update_search_vector()` — PL/pgSQL function that builds the weighted tsvector
- `providers_search_vector_trig` — `BEFORE INSERT OR UPDATE FOR EACH ROW` trigger

## Field weights
| Weight | Fields |
|--------|--------|
| A (highest) | specialization, professional_title |
| B | provider_type, secondary_specialties (joined array) |
| C | bio, city |

## Query function choice
`websearch_to_tsquery('simple', $term)` — chosen because:
- `'simple'` dictionary: no stemming, works for EN/HU/FA multilingual content
- `websearch_to_tsquery`: handles quoted phrases, `-exclusions`, and partial word matching — matches user search-box expectations
- Do NOT use `plainto_tsquery` (no phrase support) or `to_tsquery` (requires user to know tsquery syntax)

## Country safety rule
The `country_code = $country` equality check MUST be the first WHERE predicate in any FTS query. PostgreSQL evaluates cheap B-tree conditions before expensive GIN bitmap scans. This ensures cross-country data leakage is structurally impossible regardless of FTS result set.

## Storage layer FTS path
When `opts.q` is present, `searchProviders()` uses raw parameterized SQL (not Drizzle ORM):
- Country filter first
- `p.search_vector @@ tsquery OR name_tsvector @@ tsquery`
- `ts_rank(search_vector || name_tsvector, tsquery)` for ranking
- ORDER: `is_verified DESC, ts_rank DESC, rating DESC`
- Max 100 rows (enforced in storage AND route layer)

When `opts.q` is absent, the Drizzle ORM path is used — no FTS overhead for unfiltered listings.

## Backfill
Startup migration runs `UPDATE providers SET search_vector = <expr> WHERE search_vector IS NULL` after creating the trigger. Safe to run repeatedly (IS NULL guard makes it idempotent).

## Indexes
- `idx_providers_search_vector` — GIN index on `providers.search_vector`
- `idx_users_name_fts` — functional GIN index on `users(to_tsvector('simple', first_name || last_name))`
