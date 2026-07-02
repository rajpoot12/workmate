# Upgrading to native pgvector + HNSW

v1 stores embeddings as `real[]` and computes cosine similarity in the application
(`EmbeddingStore`) because pgvector was not installable in the build environment
(no Docker, no root). The product was designed so this is a localized swap.

## When you have Docker (or a pgvector-enabled Postgres)

1. **Start the pgvector database** instead of the user-space cluster:

   ```bash
   docker compose up -d        # pgvector/pgvector:pg16 on host port 5433
   ```

   The app already points at `127.0.0.1:5433` (`WM_DB_URL`).

2. **Add a migration** `V3__pgvector.sql`:

   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ALTER TABLE memory_chunk ADD COLUMN embedding_v vector(1536);
   -- backfill from real[]:
   UPDATE memory_chunk SET embedding_v = embedding::text::vector WHERE embedding IS NOT NULL;
   ALTER TABLE memory_chunk DROP COLUMN embedding;
   ALTER TABLE memory_chunk RENAME COLUMN embedding_v TO embedding;
   CREATE INDEX ON memory_chunk USING hnsw (embedding vector_cosine_ops);
   ```

3. **Change `EmbeddingStore`** to push the cosine ranking into SQL:

   ```sql
   SELECT c.*, m.*, (c.embedding <=> ?::vector) AS distance
   FROM memory_chunk c JOIN memory m ON m.id = c.memory_id
   WHERE <scope filter>
   ORDER BY c.embedding <=> ?::vector
   LIMIT :k
   ```

   Pass the query vector as a `'[v1,v2,...]'` string. Replace the in-JVM
   `VectorMath.cosine` loop; everything above `EmbeddingStore` (RAG engine, intent
   router, scope, API, clients) stays unchanged.

4. **Write embeddings** as a `vector` literal instead of a `float4[]` array in
   `EmbeddingStore.saveChunks`.

No other layer changes. The 1536-dimension was kept from day one specifically so a
switch to `text-embedding-3-small` needs no re-embedding mismatch.
