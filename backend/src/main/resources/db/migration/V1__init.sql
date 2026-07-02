-- WorkMemory AI :: schema v2 (dual-DB personal/team redesign)
-- No user identity model. Personal DB stores raw content. Team DB stores redacted content.
-- team_name column is NULL on personal DB; on team DB it filters which team's memories to show.
-- Compatible with PostgreSQL 9.2+ (trigger-based tsvector instead of GENERATED ALWAYS AS).

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE memory (
    id              UUID PRIMARY KEY,
    title           TEXT NOT NULL,
    source_type     TEXT NOT NULL,
    source_uri      TEXT,
    raw_text        TEXT,
    summary         TEXT,
    sensitivity     TEXT NOT NULL DEFAULT 'internal',
    team_name       TEXT,
    redaction_count INT NOT NULL DEFAULT 0,
    stale_flag      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_memory_type      ON memory (source_type);
CREATE INDEX idx_memory_team      ON memory (team_name);
CREATE INDEX idx_memory_created   ON memory (created_at DESC);
CREATE INDEX idx_memory_title_trgm ON memory USING gin (title gin_trgm_ops);

CREATE TABLE memory_chunk (
    id          UUID PRIMARY KEY,
    memory_id   UUID NOT NULL REFERENCES memory(id) ON DELETE CASCADE,
    chunk_index INT NOT NULL,
    text        TEXT NOT NULL,
    embedding   REAL[],
    text_tsv    TSVECTOR
);

CREATE INDEX idx_chunk_memory ON memory_chunk (memory_id);
CREATE INDEX idx_chunk_tsv    ON memory_chunk USING gin (text_tsv);

-- Trigger to keep text_tsv in sync on every insert/update.
-- This replaces GENERATED ALWAYS AS and works on PostgreSQL 9.2+.
CREATE OR REPLACE FUNCTION trg_fn_chunk_tsv()
RETURNS trigger AS $$
BEGIN
    NEW.text_tsv := to_tsvector('english', coalesce(NEW.text, ''));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_chunk_tsv
BEFORE INSERT OR UPDATE ON memory_chunk
FOR EACH ROW EXECUTE PROCEDURE trg_fn_chunk_tsv();

-- File-system index for locate/find (personal store only in practice)
CREATE TABLE file_index (
    id              UUID PRIMARY KEY,
    root_dir        TEXT NOT NULL,
    path            TEXT NOT NULL,
    name            TEXT NOT NULL,
    ext             TEXT,
    size_bytes      BIGINT,
    mtime           TIMESTAMPTZ,
    indexed_content BOOLEAN NOT NULL DEFAULT FALSE,
    prod_danger     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_file_name_trgm ON file_index USING gin (name gin_trgm_ops);
CREATE INDEX idx_file_path_trgm ON file_index USING gin (path gin_trgm_ops);

CREATE TABLE tag (
    id   UUID PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE memory_tag (
    memory_id UUID NOT NULL REFERENCES memory(id) ON DELETE CASCADE,
    tag_id    UUID NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
    PRIMARY KEY (memory_id, tag_id)
);

CREATE TABLE access_log (
    id              UUID PRIMARY KEY,
    query           TEXT,
    router          TEXT,
    memory_ids_used TEXT,
    scope           TEXT,
    confidence      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_access_log_created ON access_log (created_at DESC);
