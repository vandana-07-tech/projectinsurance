# AI-Powered Insurance Claim Fraud Testing Accelerator

Hackathon MVP that turns a life insurance death-claim requirement into structured business rules, test scenarios, synthetic data, a Postman collection, automated Newman execution against a local mock API, and evidence-based **potential business-rule validation defect** findings.

> This product tests whether software enforces defined insurance rules. It does **not** declare real customers or claims fraudulent.

## Stack

| Layer | Choice |
|---|---|
| Frontend | Basic HTML + CSS + vanilla JS |
| Backend | Node.js + TypeScript + Express |
| Schemas | Zod |
| LLM | Provider abstraction with deterministic **mock** demo mode |
| Persistence | Local JSON files under `data/` |
| API tests | Postman Collection v2.1 |
| Runner | **Newman** (Postman CLI adapter deferred) |
| Mock insurer | Embedded Express mock on port 3001 |

## Quick start

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000).

- Accelerator UI/API: `http://127.0.0.1:3000`
- Mock insurance API: `http://127.0.0.1:3001`

No LLM API key is required for the demo (`LLM_PROVIDER=mock`).

## Hackathon demo

### Requirement sheet (separate link)

Open **[http://127.0.0.1:3000/requirements-sheet.html](http://127.0.0.1:3000/requirements-sheet.html)** for up to **6** realtime life-insurance requirements. Click **Run E2E** on any row.

### Interactive agent pipeline

1. **Requirement Agent** — paste / load requirement, extract rules & suggestions  
2. **Fraud Scenario Agent** — generate and select test scenarios  
3. **Test Data Agent** — generate synthetic fixtures  
4. **API Test Agent (Newman)** — Postman collection + Newman execution  
5. **Fraud Analysis Agent** — evidence-based findings  
6. **Results** — summary, reports, collection export  

### Demo logic

- Unselect a **business rule** → dependent **scenarios** auto-unselect  
- Re-select a rule → eligible scenarios can restore  
- **Suggested business rules** can be added before scenario generation  
- Sheet status chips update after runs (browser localStorage)

Optional: enable **Intentional defect mode** before step 4 to demonstrate an over-limit defect on SC-006.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start UI, API, and mock insurer |
| `npm test` | Unit / agent / mock / e2e tests |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled server |

## Architecture

```text
Requirement → Business Rules → Scenarios → Fixtures → Postman Collection
        → Newman Runner → Execution Results → Findings → Dashboard/Report
```

Agents (orchestrated in-process):

1. Requirement Agent  
2. Fraud Scenario Agent  
3. Test Data Agent  
4. API Test Agent  
5. Fraud Analysis Agent  

Execution uses a `ExecutionRunner` interface. MVP implements `NewmanRunner` for Collection v2.1. Postman CLI can be added later behind the same interface.

### Runner selection note

- Generated collections use **Postman Collection Schema v2.1**.
- **Newman 6.x** is verified for this format and used as the default runner.
- Postman CLI is not required for MVP; it remains an optional second adapter.

### Duplicate key (MVP)

`policyNumber + insuredPersonId + dateOfDeath` — documented in mock API `/health` and scenario generation.

### Intentional defect mode

Local demo only. When enabled, the mock API **skips coverage-limit rejection** so the accelerator can detect the mismatch.

## Safety

- Synthetic data only in the default demo  
- Execution host allowlist (`ALLOWED_HOSTS`)  
- Production-like hosts blocked  
- Non-mock targets require `confirmTarget=true`  
- Secrets redacted from evidence/logs  
- Newman invoked via library API (no shell string concatenation)

## Environment

Copy `.env.example` values as needed:

- `PORT` (default 3000)  
- `MOCK_API_PORT` (default 3001)  
- `LLM_PROVIDER=mock`  
- `ALLOWED_HOSTS=localhost,127.0.0.1`  
- `MOCK_INTENTIONAL_DEFECT=false`

## Known limitations

- Live OpenAI adapter is stubbed; mock provider powers demos and tests.
- Single-user file storage (no DB / auth).
- One runner (Newman) in MVP.
- HTML dashboard is intentionally simple (no React).
