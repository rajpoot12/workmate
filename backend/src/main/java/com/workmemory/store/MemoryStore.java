package com.workmemory.store;

import com.workmemory.ai.VectorMath;
import com.workmemory.search.ScoredChunk;
import com.workmemory.search.dto.FileHit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;

import java.sql.Array;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

/**
 * Central DAO for all memory operations. Two instances exist at runtime:
 * one for the personal (local) DB, one for the team (shared server) DB.
 * The same schema is used for both. "team" memories carry a team_name value.
 */
public class MemoryStore {

    private static final Logger log = LoggerFactory.getLogger(MemoryStore.class);
    private static final int CANDIDATE_LIMIT = 3000;

    private final JdbcTemplate jdbc;
    private final String name;          // "personal" or "team"
    private final boolean fileIndexed;  // only personal store has a meaningful file_index
    private final boolean disabled;

    public MemoryStore(JdbcTemplate jdbc, String name, boolean fileIndexed) {
        this.jdbc = jdbc;
        this.name = name;
        this.fileIndexed = fileIndexed;
        this.disabled = false;
    }

    private MemoryStore() {
        this.jdbc = null;
        this.name = "team";
        this.fileIndexed = false;
        this.disabled = true;
    }

    public static MemoryStore disabled() {
        return new MemoryStore();
    }

    public String getName() { return name; }
    public boolean isDisabled() { return disabled; }
    public boolean hasFileIndex() { return fileIndexed && !disabled; }

    // ------------------------------------------------------------------
    // Write: memories
    // ------------------------------------------------------------------

    public void saveMemory(MemoryRow m) {
        jdbc.update(
                "INSERT INTO memory (id, title, source_type, source_uri, raw_text, summary, "
                        + "sensitivity, team_name, redaction_count, stale_flag, created_at, updated_at) "
                        + "VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                m.id(), m.title(), m.sourceType(), m.sourceUri(), m.rawText(), m.summary(),
                m.sensitivity(), m.teamName(), m.redactionCount(), m.staleFlag(),
                Timestamp.from(m.createdAt()), Timestamp.from(m.updatedAt()));
    }

    public void saveChunks(UUID memoryId, List<ChunkData> chunks) {
        jdbc.batchUpdate(
                "INSERT INTO memory_chunk (id, memory_id, chunk_index, text, embedding) VALUES (?,?,?,?,?)",
                chunks, chunks.size(), (ps, c) -> {
                    Float[] boxed = new Float[c.embedding().length];
                    for (int i = 0; i < boxed.length; i++) boxed[i] = c.embedding()[i];
                    Array arr = ps.getConnection().createArrayOf("float4", boxed);
                    ps.setObject(1, UUID.randomUUID());
                    ps.setObject(2, memoryId);
                    ps.setInt(3, c.index());
                    ps.setString(4, c.text());
                    ps.setArray(5, arr);
                });
    }

    public void attachTags(UUID memoryId, List<String> tagNames) {
        if (tagNames == null || tagNames.isEmpty()) return;
        for (String raw : tagNames) {
            if (raw == null || raw.isBlank()) continue;
            String tagName = raw.strip().toLowerCase();
            // Use SELECT-then-INSERT (PG 9.2 compatible — no ON CONFLICT support until PG 9.5)
            Integer tagCount = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM tag WHERE name = ?", Integer.class, tagName);
            if (tagCount == null || tagCount == 0) {
                jdbc.update("INSERT INTO tag (id, name) VALUES (?,?)", UUID.randomUUID(), tagName);
            }
            UUID tagId = jdbc.queryForObject("SELECT id FROM tag WHERE name = ?",
                    (rs, i) -> rs.getObject("id", UUID.class), tagName);
            Integer linkCount = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM memory_tag WHERE memory_id = ? AND tag_id = ?",
                    Integer.class, memoryId, tagId);
            if (linkCount == null || linkCount == 0) {
                jdbc.update("INSERT INTO memory_tag (memory_id, tag_id) VALUES (?,?)", memoryId, tagId);
            }
        }
    }

    // ------------------------------------------------------------------
    // Write: file index (personal only in practice)
    // ------------------------------------------------------------------

    public void deleteChunks(UUID memoryId) {
        jdbc.update("DELETE FROM memory_chunk WHERE memory_id = ?", memoryId);
    }

    /** Hard-delete a memory and all related rows (chunks, tags). */
    public boolean deleteMemory(UUID memoryId) {
        jdbc.update("DELETE FROM memory_chunk WHERE memory_id = ?", memoryId);
        jdbc.update("DELETE FROM memory_tag  WHERE memory_id = ?", memoryId);
        int rows = jdbc.update("DELETE FROM memory WHERE id = ?", memoryId);
        return rows > 0;
    }

    public void saveFileIndex(FileIndexRow fi) {
        jdbc.update("INSERT INTO file_index (id, root_dir, path, name, ext, size_bytes, mtime, "
                        + "indexed_content, prod_danger, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
                fi.id(), fi.rootDir(), fi.path(), fi.name(), fi.ext(), fi.sizeBytes(),
                fi.mtime() != null ? Timestamp.from(fi.mtime()) : null,
                fi.indexedContent(), fi.prodDanger(), Timestamp.from(fi.createdAt()));
    }

    public void deleteFilesByRoot(String rootDir) {
        jdbc.update("DELETE FROM file_index WHERE root_dir = ?", rootDir);
    }

    // ------------------------------------------------------------------
    // Write: access log
    // ------------------------------------------------------------------

    public void saveAccessLog(AccessLogRow r) {
        jdbc.update(
                "INSERT INTO access_log (id, query, router, memory_ids_used, confidence, scope, created_at) "
                        + "VALUES (?,?,?,?,?,?,?)",
                r.id(), r.query(), r.router(), r.memoryIdsUsed(), r.confidence(), r.scope(),
                Timestamp.from(r.createdAt()));
    }

    // ------------------------------------------------------------------
    // Read: hybrid vector + keyword search
    // ------------------------------------------------------------------

    public List<ScoredChunk> search(float[] queryEmbedding, String keywordQuery, String teamName, int topK) {
        if (disabled) return List.of();

        List<Object> args = new ArrayList<>();
        args.add(keywordQuery == null || keywordQuery.isBlank() ? "" : keywordQuery);

        StringBuilder where = new StringBuilder("WHERE 1=1");
        if (teamName != null && !teamName.isBlank()) {
            where.append(" AND m.team_name = ?");
            args.add(teamName);
        }

        String sql = "SELECT c.id AS cid, c.memory_id AS mid, c.text AS ctext, c.embedding AS emb, "
                + "m.title AS title, m.source_type AS stype, m.source_uri AS suri, "
                + "m.created_at AS created, "
                + "ts_rank(c.text_tsv, plainto_tsquery('english', ?)) AS kw "
                + "FROM memory_chunk c JOIN memory m ON m.id = c.memory_id "
                + where + " "
                + "ORDER BY m.created_at DESC LIMIT " + CANDIDATE_LIMIT;

        List<ScoredChunk> candidates;
        try {
            candidates = jdbc.query(sql, (rs, i) -> {
                ScoredChunk sc = new ScoredChunk();
                sc.chunkId = rs.getObject("cid", UUID.class);
                sc.memoryId = rs.getObject("mid", UUID.class);
                sc.text = rs.getString("ctext");
                sc.memoryTitle = rs.getString("title");
                sc.sourceType = rs.getString("stype");
                sc.sourceUri = rs.getString("suri");
                sc.db = this.name;
                Timestamp ts = rs.getTimestamp("created");
                sc.createdAt = ts != null ? ts.toInstant() : Instant.now();
                sc.keyword = rs.getDouble("kw");
                Array a = rs.getArray("emb");
                sc.cosine = a == null ? 0.0 : VectorMath.cosine(queryEmbedding, toFloatArray(a));
                return sc;
            }, args.toArray());
        } catch (Exception e) {
            log.warn("Search failed on {} store: {}", name, e.getMessage());
            return List.of();
        }

        double maxKw = candidates.stream().mapToDouble(c -> c.keyword).max().orElse(0.0);
        Instant now = Instant.now();
        for (ScoredChunk c : candidates) {
            double kwNorm = maxKw > 0 ? c.keyword / maxKw : 0.0;
            double ageDays = Duration.between(c.createdAt, now).toHours() / 24.0;
            double recency = 1.0 / (1.0 + Math.max(0, ageDays) / 60.0);
            c.score = 0.72 * c.cosine + 0.22 * kwNorm + 0.06 * recency;
        }
        candidates.sort(Comparator.comparingDouble((ScoredChunk c) -> c.score).reversed());
        return candidates.size() > topK ? candidates.subList(0, topK) : candidates;
    }

    // ------------------------------------------------------------------
    // Read: locate / find (file_index, personal only)
    // ------------------------------------------------------------------

    public List<FileHit> locate(String query, int limit) {
        if (disabled || !fileIndexed) return List.of();
        String term = query == null ? "" : query.strip();
        String simTerm = term.replace("*", "").replace("?", "").strip();
        if (simTerm.isEmpty()) return List.of();
        String like = term.contains("*") || term.contains("?")
                ? term.replace('*', '%').replace('?', '_')
                : "%" + simTerm + "%";

        try {
            return jdbc.query(
                    "SELECT id, path, name, ext, mtime, prod_danger, "
                            + "GREATEST(similarity(name, ?), similarity(path, ?)) AS sim "
                            + "FROM file_index "
                            + "WHERE (name ILIKE ? OR path ILIKE ? OR similarity(name, ?) > 0.15) "
                            + "ORDER BY sim DESC, mtime DESC NULLS LAST LIMIT ?",
                    (rs, i) -> {
                        Timestamp ts = rs.getTimestamp("mtime");
                        return new FileHit(
                                rs.getObject("id", UUID.class),
                                rs.getString("path"),
                                rs.getString("name"),
                                rs.getString("ext"),
                                ts != null ? ts.toInstant() : null,
                                rs.getBoolean("prod_danger"),
                                rs.getDouble("sim"));
                    },
                    simTerm, simTerm, like, like, simTerm, limit);
        } catch (Exception e) {
            log.warn("Locate failed on {} store: {}", name, e.getMessage());
            return List.of();
        }
    }

    // ------------------------------------------------------------------
    // Read: library list
    // ------------------------------------------------------------------

    public List<MemoryView> listMemories(String q, String tag, String teamName) {
        if (disabled) return List.of();

        StringBuilder sql = new StringBuilder(
                "SELECT DISTINCT m.id, m.title, m.source_type, m.source_uri, m.summary, "
                        + "m.team_name, m.sensitivity, m.redaction_count, m.stale_flag, m.created_at "
                        + "FROM memory m ");
        List<Object> args = new ArrayList<>();
        if (tag != null && !tag.isBlank()) {
            sql.append("JOIN memory_tag mt ON mt.memory_id = m.id JOIN tag t ON t.id = mt.tag_id ");
        }
        sql.append("WHERE 1=1 ");
        if (teamName != null && !teamName.isBlank()) {
            sql.append("AND m.team_name = ? ");
            args.add(teamName);
        }
        if (tag != null && !tag.isBlank()) {
            sql.append("AND t.name = ? ");
            args.add(tag.toLowerCase());
        }
        if (q != null && !q.isBlank()) {
            sql.append("AND (m.title ILIKE ? OR m.summary ILIKE ? OR m.raw_text ILIKE ?) ");
            String like = "%" + q.strip() + "%";
            args.add(like); args.add(like); args.add(like);
        }
        sql.append("ORDER BY m.created_at DESC LIMIT 200");

        try {
            List<MemoryView> base = jdbc.query(sql.toString(), (rs, i) -> {
                Timestamp ts = rs.getTimestamp("created_at");
                UUID id = rs.getObject("id", UUID.class);
                return new MemoryView(id, rs.getString("title"), rs.getString("source_type"),
                        rs.getString("source_uri"), rs.getString("summary"),
                        rs.getString("team_name"), rs.getString("sensitivity"),
                        rs.getInt("redaction_count"), rs.getBoolean("stale_flag"),
                        ts != null ? ts.toInstant() : null, List.of(), this.name);
            }, args.toArray());

            List<MemoryView> out = new ArrayList<>(base.size());
            for (MemoryView v : base) {
                out.add(new MemoryView(v.id(), v.title(), v.sourceType(), v.sourceUri(), v.summary(),
                        v.teamName(), v.sensitivity(), v.redactionCount(), v.staleFlag(),
                        v.createdAt(), tagsFor(v.id()), this.name));
            }
            return out;
        } catch (Exception e) {
            log.warn("listMemories failed on {} store: {}", name, e.getMessage());
            return List.of();
        }
    }

    // ------------------------------------------------------------------
    // Read: single memory detail
    // ------------------------------------------------------------------

    public MemoryRow findById(UUID id) {
        if (disabled) return null;
        try {
            List<MemoryRow> rows = jdbc.query(
                    "SELECT * FROM memory WHERE id = ?",
                    (rs, i) -> {
                        Timestamp ca = rs.getTimestamp("created_at");
                        Timestamp ua = rs.getTimestamp("updated_at");
                        return new MemoryRow(
                                rs.getObject("id", UUID.class), rs.getString("title"),
                                rs.getString("source_type"), rs.getString("source_uri"),
                                rs.getString("raw_text"), rs.getString("summary"),
                                rs.getString("sensitivity"), rs.getString("team_name"),
                                rs.getInt("redaction_count"), rs.getBoolean("stale_flag"),
                                ca != null ? ca.toInstant() : Instant.now(),
                                ua != null ? ua.toInstant() : Instant.now());
                    }, id);
            return rows.isEmpty() ? null : rows.get(0);
        } catch (Exception e) {
            log.warn("findById failed on {} store: {}", name, e.getMessage());
            return null;
        }
    }

    // ------------------------------------------------------------------
    // Read: access log
    // ------------------------------------------------------------------

    public List<AccessLogRow> listAccessLog(int limit) {
        if (disabled) return List.of();
        try {
            return jdbc.query(
                    "SELECT * FROM access_log ORDER BY created_at DESC LIMIT ?",
                    (rs, i) -> {
                        Timestamp ts = rs.getTimestamp("created_at");
                        return new AccessLogRow(
                                rs.getObject("id", UUID.class), rs.getString("query"),
                                rs.getString("router"), rs.getString("memory_ids_used"),
                                rs.getString("confidence"), rs.getString("scope"),
                                ts != null ? ts.toInstant() : Instant.now());
                    }, limit);
        } catch (Exception e) {
            log.warn("listAccessLog failed on {} store: {}", name, e.getMessage());
            return List.of();
        }
    }

    // ------------------------------------------------------------------
    // Read: tags
    // ------------------------------------------------------------------

    public List<String> tags() {
        if (disabled) return List.of();
        try {
            return jdbc.query("SELECT name FROM tag ORDER BY name", (rs, i) -> rs.getString(1));
        } catch (Exception e) {
            return List.of();
        }
    }

    public List<String> tagsFor(UUID memoryId) {
        if (disabled) return List.of();
        try {
            return jdbc.query(
                    "SELECT t.name FROM tag t JOIN memory_tag mt ON mt.tag_id = t.id WHERE mt.memory_id = ? ORDER BY t.name",
                    (rs, i) -> rs.getString(1), memoryId);
        } catch (Exception e) {
            return List.of();
        }
    }

    // ------------------------------------------------------------------
    // Maintenance
    // ------------------------------------------------------------------

    public void wipeContent() {
        if (disabled) return;
        jdbc.update("TRUNCATE access_log, file_index, memory_tag, memory_chunk, memory, tag RESTART IDENTITY CASCADE");
    }

    public boolean ping() {
        if (disabled) return false;
        try {
            jdbc.queryForObject("SELECT 1", Integer.class);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    // ------------------------------------------------------------------
    // Internal helpers
    // ------------------------------------------------------------------

    public record ChunkData(int index, String text, float[] embedding) {}

    private static float[] toFloatArray(Array a) {
        try {
            Object raw = a.getArray();
            if (raw instanceof Float[] boxed) {
                float[] out = new float[boxed.length];
                for (int i = 0; i < boxed.length; i++) out[i] = boxed[i] == null ? 0f : boxed[i];
                return out;
            }
            if (raw instanceof Number[] nums) {
                float[] out = new float[nums.length];
                for (int i = 0; i < nums.length; i++) out[i] = nums[i] == null ? 0f : nums[i].floatValue();
                return out;
            }
            return new float[0];
        } catch (Exception e) {
            return new float[0];
        }
    }
}
