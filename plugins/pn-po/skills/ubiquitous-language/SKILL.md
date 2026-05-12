---
name: ubiquitous-language
description: Maintains the canonical glossary at UBIQUITOUS_LANGUAGE.md in the repo root. Trigger when the user runs /pn-po:ubiquitous-language, or invokes subcommands: "add <term> <definition>" to add a new entry, "update <term>" to revise an existing entry, or "audit" to suggest new terms from code-knowledge summaries since the last update. On every successful update, emits the language-lock hook trigger. Usable on both Claude Code and Claude.ai surfaces by anyone on the team.
allowed-tools: Bash, Read, Write, Edit
---

# ubiquitous-language

Maintains a canonical, version-controlled glossary of domain terms in `UBIQUITOUS_LANGUAGE.md` at the repo root. Both the PO (Claude.ai surface) and DEV (Claude Code surface) read directly from this file; there is no separate Confluence or wiki copy. The skill supports three subcommands: `add`, `update`, and `audit`. On every successful write, it emits the trigger consumed by the `language-lock` hook (PRD-008) so that active source files and docs are re-checked for drifted terminology.

## When to use

- When a new domain term is introduced during refinement, planning, or implementation.
- When an existing term's definition has evolved and the current entry is no longer accurate.
- When the `audit` subcommand is invoked to surface newly-appearing terms from code-knowledge summaries that are not yet in the glossary.
- On either surface; both PO and DEV interact with the same file.

## When not to use

- For project-specific configuration or technical jargon that is not part of the domain model. Keep the glossary focused on ubiquitous language in the Domain-Driven Design sense.
- When terms belong to a different bounded context that has its own glossary. In that case, the correct action is to identify or create the bounded-context's own glossary file.

## Subcommands

| Subcommand | Syntax | Description |
|------------|--------|-------------|
| `add` | `/pn-po:ubiquitous-language add <term> <definition>` | Adds a new entry; fails if the term already exists |
| `update` | `/pn-po:ubiquitous-language update <term>` | Opens an interactive edit loop for an existing entry; fails if the term does not exist |
| `audit` | `/pn-po:ubiquitous-language audit` | Suggests terms from code-knowledge summaries that are not in the glossary; the user confirms which to add |

If no subcommand is provided, print usage instructions to chat.

## Inputs

| Source | What is read | Tool |
|--------|-------------|------|
| `UBIQUITOUS_LANGUAGE.md` | Existing glossary entries | Read |
| Code-knowledge layer | Per-module summaries from `.pn/index/index.sqlite` (audit subcommand only) | Bash (sqlite3) |
| `.pn/settings.json` | `code_knowledge.path`, `language.output` | Read |
| User input | Term name, definition, confirmation during audit | Interactive (chat) |

## Outputs

| Output | Path | Description |
|--------|------|-------------|
| Glossary | `UBIQUITOUS_LANGUAGE.md` | Updated or created at repo root; entries in canonical structure |
| Language-lock trigger | Chat (stdout) | Signal line `[pn:language-lock-trigger]` emitted after every successful write; consumed by the `language-lock` hook |

No Jira mutations. No commits created unless the user explicitly requests one. No files written other than `UBIQUITOUS_LANGUAGE.md`.

## Entry structure

Each glossary entry follows this canonical structure:

```markdown
## <Term>

**Definition:** <One to three sentences. Precise domain meaning; no technical implementation details unless they are part of the domain model.>

**Examples:**
- <Concrete example in the domain context>
- <Second example if helpful>

**Owner:** <git config user.name of the person who last edited this entry>
**Last updated:** <YYYY-MM-DD>
**Bounded context:** <context name, or "global" if applicable across contexts>
```

Terms are sorted alphabetically by heading within the file.

## File structure

`UBIQUITOUS_LANGUAGE.md` opens with a frontmatter block and a brief intro paragraph, followed by the alphabetically sorted entries:

```yaml
---
prd: PRD-007
plan: PLAN-001
author: <git config user.name>
updated: <YYYY-MM-DD>
---
```

```markdown
# Ubiquitous Language

This glossary defines the shared vocabulary used by the PO and DEV team for this project.
Terms are sorted alphabetically. The canonical source is this file; no separate Confluence
or wiki copy is maintained.

---

## <Term>
...
```

## Procedure

### All subcommands: setup

1. Read `.pn/settings.json` to get `language.output`. If `.pn/settings.json` is absent, proceed without language override (default: English).
2. Read `UBIQUITOUS_LANGUAGE.md` if it exists. If absent, it will be created by the `add` subcommand or the `audit` subcommand when the user confirms a term.

### Subcommand: `add`

1. Check that the term does not already exist in `UBIQUITOUS_LANGUAGE.md` (case-insensitive heading match). If it exists, abort: "term '<name>' already exists; use `update` to revise it".
2. Collect the definition from the argument. If the definition argument is absent or fewer than five words, prompt the user for a full definition before proceeding.
3. Prompt the user to confirm the `examples` (at least one required) and `bounded-context` before writing. Accept free-form chat input.
4. Read `git config user.name` for the `Owner` field.
5. Insert the new entry at the correct alphabetical position in the file. If the file does not yet exist, create it with the full header and frontmatter before inserting the entry.
6. Update the `updated` field in the frontmatter to today's date.
7. Print confirmation to chat: "Added term '<name>' to UBIQUITOUS_LANGUAGE.md".
8. Emit `[pn:language-lock-trigger]` to chat.

### Subcommand: `update`

1. Locate the term's existing entry (case-insensitive heading match). If not found, abort: "term '<name>' not found; use `add` to create it".
2. Display the current entry to the user.
3. Ask the user what should change: definition, examples, bounded-context, or a combination. Accept free-form chat input.
4. Apply the changes to the entry in place.
5. Update `Owner` to the current `git config user.name` and `Last updated` to today's date.
6. Update the `updated` field in the file frontmatter to today's date.
7. Print confirmation to chat: "Updated term '<name>' in UBIQUITOUS_LANGUAGE.md".
8. Emit `[pn:language-lock-trigger]` to chat.

### Subcommand: `audit`

1. Read all module summaries from `.pn/index/index.sqlite`:

   ```sql
   SELECT module, summary FROM summaries ORDER BY module;
   ```

   If the code-knowledge layer is unavailable, print "code-knowledge layer not found; audit requires summaries in .pn/index/index.sqlite" and exit cleanly.

2. Load the current glossary terms as a set (heading names, lowercased).

3. Parse the summaries for candidate domain terms: noun phrases that appear in multiple module summaries or are capitalised consistently in non-code contexts. Use a simple heuristic: extract repeated multi-word noun phrases (2-4 words) that appear in three or more summaries and are not already in the glossary set.

4. Present the candidates to the user as a numbered list. For each candidate:
   - Show the term and a brief excerpt of the summary context where it appears.
   - Ask: "Add this term? (yes / no / edit definition first)"

5. For each confirmed term, collect the definition (prompt the user if they chose "yes" without an edit) and follow steps 3-8 of the `add` subcommand.

6. After processing all candidates, print: "Audit complete. Added <N> terms. UBIQUITOUS_LANGUAGE.md updated."

## Edge cases

- **File does not exist yet:** The `add` and `audit` subcommands create it with the full header on first use. The `update` subcommand aborts with "no glossary file found; add a term first".
- **Term heading collision (different capitalisation):** Treat `OrderLine` and `Order Line` as the same term (normalise to lowercase + strip spaces for comparison). Inform the user of the collision.
- **Empty summary table:** The `audit` subcommand finds no candidates; print "no candidates found; all observable domain terms may already be in the glossary" and exit cleanly.
- **User declines all audit candidates:** Exit cleanly without writing the file. Do not emit the language-lock trigger if no terms were added.

## Idempotency notes

- `add` is idempotent only if the exact same term name is added twice: the second call aborts without modifying the file.
- `update` may be called multiple times on the same term; each call replaces the previous content and updates the `Last updated` date.
- `audit` presents candidates fresh each time from the current index; previously rejected candidates reappear if they still appear in summaries.

## Language-lock trigger

After every successful write to `UBIQUITOUS_LANGUAGE.md`, this skill emits the line `[pn:language-lock-trigger]` to chat. The `language-lock` hook (PRD-008) is registered to detect this line and re-scan active source files and docs for drifted terminology. This skill does not implement the hook; it only emits the trigger. If the hook is not installed, the trigger line is a no-op in chat.
