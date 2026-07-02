# WorkMemory AI — v1

A personal, permission-safe **AI memory layer for work**. Save files, notes, and
browser selections, then ask in natural language and get **source-cited** answers.

One product, three pieces:

| Component | What it is | Role |
|-----------|------------|------|
| **Backend** | Spring Boot 3 (Java 17) + REST | The brain: stores memories, runs search/RAG, owns data, enforces personal/team scope |
| **Web app** | React + Vite + Tailwind | Ask · Library · Capture · Privacy — nostalgic terminal UI |
| **Extension** | Chrome MV3, in-page overlay | Grammarly-style: select text → Save / Ask, without leaving the page |

---

## What works in v1

- **Two-search in one box** — content **RAG** (vector + keyword) *and* **locate/find**
  (fuzzy filename search) with an **intent router** (`rag | locate | both`).
- **Verbatim recall** — when a query signals "give me the full script/SQL/runbook"
  (e.g. `script to convert Franchisee users to Brand Users`, `full: migration sql`,
  `show me the complete runbook`), Ask bypasses LLM synthesis and returns the full saved
  `raw_text` in a fenced code block. A `full recall — not summarized` badge appears in
  the UI. You can also force this mode by prefixing your query with `full:` or `verbatim:`.
- **Scope-aware search** — personal mode searches both personal and team stores; team
  mode searches the team store only, so personal memories never bleed into team answers.
  Team mode also guards against missing team name or offline DB with a clear error message.
- **Grounding contract** — every `/api/ask` returns `answer`, `sources[]` (cited),
  `files[]`, `confidence` (`high|medium|low|none`), `router`, and `mode`
  (`rag|verbatim|locate`). No source → not shown.
- **Honest confidence** — below threshold it says *"I don't have a memory for this"*
  instead of hallucinating.
- **Visible redaction** — secrets/PII (tokens, keys, passwords, emails, internal
  hosts/IPs, customer IDs) are masked *before* storage/AI, with counts shown.
- **Personal vs team memory** — scope filter on every query; explicit *share to team*.
- **Save-the-answer flywheel** — persist a generated answer as a new memory.
- **Prod-danger flags** — `rm -rf`, `DROP`, `restart prod`, etc. flagged on scripts.
- **Privacy audit log** — what the AI read, per query.
- **Zero-key by default** — runs on a local deterministic AI provider; flip one env
  var to use OpenAI (`gpt-4o-mini` + `text-embedding-3-small`).

---

## Architecture & important environment notes

This machine has **no Docker access and no root**, so two deviations from the
original plan were made — both behind clean seams so the planned stack is a drop-in:

1. **PostgreSQL** runs as a **user-space cluster** (`initdb`/`pg_ctl`, port `5433`)
   with `pg_trgm` enabled. See `scripts/db.sh`.
2. **pgvector is unavailable**, so embeddings are stored as `real[]` and cosine
   similarity runs in the app (`EmbeddingStore`). Locate uses `pg_trgm`. Swapping to
   native pgvector + HNSW touches only `EmbeddingStore` + one column type — see
   [`docs/UPGRADING_TO_PGVECTOR.md`](docs/UPGRADING_TO_PGVECTOR.md).
   `docker-compose.yml` (pgvector/pg16) is included for when Docker is available.

`LangChain4j` (named in the plan) is represented by the `AiProvider` interface; the
OpenAI provider uses direct REST to keep the build lean. It is a one-class swap.

```
web (Vite :5173) ──┐
                   ├── REST /api ──> Spring Boot (:8080) ──> PostgreSQL (:5433, pg_trgm)
chrome extension ──┘                     │
                                  AiProvider (local | openai)
```

---

## Run it

Prereqs already provisioned here: Java 17, Node 18, a downloaded Maven in `.tools/`,
and a user-space Postgres in `.pgdata/`.

```bash
# 1. database (user-space postgres on :5433)
bash scripts/db.sh start

# 2. backend (compiles + runs on :8080, seeds demo data on first boot)
bash scripts/run-backend.sh
#    logs: /tmp/wm-backend.log

# 3. web app (:5173, proxies /api -> :8080)
cd web && npm install && npm run dev

# 4. chrome extension
#    chrome://extensions -> Developer mode -> Load unpacked -> ./extension
```

Open http://localhost:5173. Use the **user switch** (top-right) to demo
personal vs team memory (`you` / `priya` / `arjun`, team *Platform SRE*).

### Switch to OpenAI

```bash
export WM_AI_PROVIDER=openai
export OPENAI_API_KEY=sk-...
bash scripts/run-backend.sh
```

---

## API surface

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/notes` | Create note with tags |
| POST | `/api/files/upload` | Upload → extract → redact → chunk → embed |
| POST | `/api/files/scan` | Index a directory tree for locate |
| POST | `/api/ask` | Intent router → locate and/or RAG → cited answer |
| POST | `/api/browser/capture` | Save / ask selected text from the extension |
| GET  | `/api/memories?tag=&type=&scope=&q=` | Library browse / filter |
| GET  | `/api/memories/{id}` | Memory detail (redacted) |
| POST | `/api/memories/{id}/share` | Flip personal → team |
| POST | `/api/memories/save-answer` | The flywheel |
| POST | `/api/redact/preview` | Show what would be masked |
| GET  | `/api/access-log` | Privacy audit |
| GET  | `/api/me`, `/api/teams`, `/api/tags`, `/api/health` | Meta |

Identity in v1 is the `X-User-Id` header (defaults to the seeded demo user).

---

## Data model (PostgreSQL)

`app_user`, `team`, `team_member`, `memory`, `memory_chunk` (embedding `real[]` +
generated `tsvector`), `file_index` (trigram-indexed name/path), `tag`, `memory_tag`,
`access_log`. Migrations in `backend/src/main/resources/db/migration` (Flyway).

---

## Layout

```
backend/    Spring Boot 3 service (the product)
web/        React + Vite + Tailwind client
extension/  Chrome MV3 capture client
scripts/    db.sh, run-backend.sh
docs/        UPGRADING_TO_PGVECTOR.md
docker-compose.yml   pgvector/pg16 (for environments with Docker)
```
