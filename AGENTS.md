# AGENTS.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

## 5. Project Baseline Documents

**Always check the baseline documents before planning or implementing.**

AIO-ICPT is developed from baseline documents first. Code must follow the current baseline unless the task explicitly changes the baseline.

Before implementation, review the relevant documents:

- `docs/baseline/feature-definition.md`
  - Product identity, full feature scope, MVP scope, current implementation baseline, roadmap.
- `docs/baseline/system-architecture.md`
  - Runtime structure, layer responsibilities, IPC flow, protocol extension direction.
- `docs/baseline/data-model.md`
  - ERD, SQLite schema, future tables, JSON extension rules, migration rules.
- `docs/baseline/development-conventions.md`
  - Development workflow, GitHub Issues policy, code conventions, security rules, testing rules, documentation sync rules.

Development workflow:

1. Check the relevant baseline documents.
2. Identify the related GitHub Issue or feature scope.
3. Write or update tests before implementation when behavior changes.
4. Implement the minimum code needed.
5. Run verification commands.
6. Synchronize documents if feature scope, architecture, data model, or conventions changed.
7. Add or update ADRs for meaningful decisions.
8. Add learning notes for concepts the user should understand and reuse.

Rules:

- Do not treat GitHub Issues as the source of truth. Issues manage execution; baseline documents define the product and architecture.
- Do not implement behavior that contradicts the baseline documents without first calling out the conflict.
- If code and baseline documents disagree, stop and identify whether the code should change or the document should be updated.
- Renderer must not directly access Node APIs, SQLite, file system, TCP, or Serial Port.
- IPC must stay thin and delegate business logic to the Core layer.
- Core logic should remain testable without Electron.
- SQLite is the default local storage; external databases are optional extensions.
- Documentation sync is part of the definition of done, not a cleanup task.
