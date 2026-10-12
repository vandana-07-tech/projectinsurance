# Phase 0 — Repository Assessment

## Findings

The workspace (`d:\projectinsurance`) was **empty** — no existing frontend, backend, tests, or AI integrations.

## Chosen stack (PRD defaults + user direction)

- **Frontend:** basic HTML/CSS/JS (not React)
- **Backend:** Node.js + TypeScript + Express
- **Schemas:** Zod
- **LLM:** mock provider (deterministic demo)
- **Persistence:** local JSON files
- **Runner:** Newman against Postman Collection v2.1
- **Mock insurer:** embedded Express API

## Compatibility

| Topic | Decision |
|---|---|
| Collection format | Postman Collection v2.1 |
| Primary runner | Newman 6.x |
| Postman CLI | Deferred behind `ExecutionRunner` interface |

## Risks / decisions resolved

1. Empty repo → greenfield MVP with PRD defaults.
2. Newman chosen for MVP; second runner optional.
3. Product focus: **life insurance** death claims (not motor).
4. Duplicate key fixed for MVP: `policyNumber|insuredPersonId|dateOfDeath`.
5. Inclusive sum-assured limit and inclusive policy end date documented as assumptions requiring review.
