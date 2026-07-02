package com.workmemory.web;

import com.workmemory.ai.AiProvider;
import com.workmemory.ingest.IngestService;
import com.workmemory.search.ScoredChunk;
import com.workmemory.store.MemoryRow;
import com.workmemory.store.MemoryStore;
import com.workmemory.store.MemoryStore.ChunkData;
import com.workmemory.store.MemoryView;
import com.workmemory.store.StoreResolver;
import com.workmemory.web.dto.Requests;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

@RestController
@RequestMapping("/api")
public class MemoryController {

    private static final Logger log = LoggerFactory.getLogger(MemoryController.class);

    private static final double SIMILAR_THRESHOLD = 0.78;

    private final StoreResolver stores;
    private final IngestService ingest;
    private final AiProvider ai;

    public MemoryController(StoreResolver stores, IngestService ingest, AiProvider ai) {
        this.stores = stores;
        this.ingest = ingest;
        this.ai = ai;
    }

    @GetMapping("/memories")
    public List<MemoryView> list(
            @RequestHeader(value = "X-Scope", defaultValue = "personal") String scope,
            @RequestHeader(value = "X-Team", required = false) String teamName,
            @RequestParam(required = false) String tag,
            @RequestParam(required = false) String q) {
        String tn = "team".equalsIgnoreCase(scope) ? teamName : null;
        return stores.resolve(scope).listMemories(q, tag, tn);
    }

    @GetMapping("/memories/{id}")
    public ResponseEntity<Map<String, Object>> get(
            @RequestHeader(value = "X-Scope", defaultValue = "personal") String scope,
            @PathVariable UUID id) {
        MemoryRow m = stores.resolve(scope).findById(id);
        if (m == null && stores.teamEnabled()) {
            m = stores.team().findById(id);
        }
        if (m == null) return ResponseEntity.notFound().build();

        MemoryRow fm = m;
        List<String> tags = stores.resolve(scope).tagsFor(id);
        Map<String, Object> body = new HashMap<>();
        body.put("id", fm.id());
        body.put("title", fm.title());
        body.put("sourceType", fm.sourceType());
        body.put("sourceUri", fm.sourceUri());
        body.put("rawText", fm.rawText());
        body.put("summary", fm.summary());
        body.put("scope", fm.teamName() != null ? "team" : "personal");
        body.put("teamName", fm.teamName());
        body.put("sensitivity", fm.sensitivity());
        body.put("redactionCount", fm.redactionCount());
        body.put("staleFlag", fm.staleFlag());
        body.put("createdAt", fm.createdAt());
        body.put("tags", tags);
        return ResponseEntity.ok(body);
    }

    @DeleteMapping("/memories/{id}")
    public Map<String, Object> delete(
            @PathVariable UUID id,
            @RequestHeader(value = "X-Scope", defaultValue = "personal") String scope,
            @RequestHeader(value = "X-Team", required = false) String teamName) {
        boolean deleted = stores.resolve(scope).deleteMemory(id);
        return Map.of("deleted", deleted, "id", id.toString());
    }

    /**
     * Find memories similar to the given text (before saving). Used for duplicate warnings.
     */
    @PostMapping("/memories/similar")
    public List<Map<String, Object>> similar(
            @RequestHeader(value = "X-Scope", defaultValue = "personal") String scope,
            @RequestHeader(value = "X-Team", required = false) String teamName,
            @RequestBody Map<String, String> req) {
        String title = req.getOrDefault("title", "");
        String text  = req.getOrDefault("text", "");
        if (text.isBlank() && title.isBlank()) return List.of();
        float[] emb = ai.embed(title + " " + text);
        String tn = "team".equalsIgnoreCase(scope) ? teamName : null;
        List<ScoredChunk> hits = stores.resolve(scope).search(emb, title + " " + text, tn, 5);
        List<Map<String, Object>> result = new ArrayList<>();
        java.util.Set<java.util.UUID> seen = new java.util.LinkedHashSet<>();
        for (ScoredChunk c : hits) {
            if (c.score >= SIMILAR_THRESHOLD && seen.add(c.memoryId)) {
                result.add(Map.of(
                        "memoryId", c.memoryId,
                        "title", c.memoryTitle,
                        "score", Math.round(c.score * 100) + "%"));
            }
        }
        return result;
    }

    /**
     * Re-embeds all memories in the given scope using the latest chunking strategy
     * (title + tags now prepended to chunks). Call this once after upgrading or
     * whenever the AI provider changes.
     */
    @PostMapping("/memories/reindex")
    public Map<String, Object> reindex(
            @RequestHeader(value = "X-Scope", defaultValue = "personal") String scope,
            @RequestHeader(value = "X-Team", required = false) String teamName) {
        MemoryStore store = stores.resolve(scope);
        String tn = "team".equalsIgnoreCase(scope) ? teamName : null;
        List<MemoryView> all = store.listMemories(null, null, tn);
        AtomicInteger ok = new AtomicInteger();
        AtomicInteger fail = new AtomicInteger();

        for (MemoryView view : all) {
            try {
                MemoryRow m = store.findById(view.id());
                if (m == null) continue;
                List<String> tags = store.tagsFor(view.id());

                // Delete old chunks
                store.deleteChunks(m.id());

                // Re-chunk with title+tags header
                List<ChunkData> chunks = ingest.buildChunks(m.title(), tags, m.rawText() == null ? "" : m.rawText());
                if (!chunks.isEmpty()) {
                    store.saveChunks(m.id(), chunks);
                }
                ok.incrementAndGet();
                log.info("Reindexed: {}", m.title());
            } catch (Exception e) {
                log.warn("Reindex failed for {}: {}", view.id(), e.getMessage());
                fail.incrementAndGet();
            }
        }
        return Map.of("reindexed", ok.get(), "failed", fail.get(), "total", all.size());
    }

    @PostMapping("/memories/save-answer")
    public Map<String, Object> saveAnswer(
            @RequestHeader(value = "X-Scope", defaultValue = "personal") String scope,
            @RequestHeader(value = "X-Team", required = false) String teamName,
            @RequestBody Requests.SaveAnswerRequest req) {
        boolean isTeam = "team".equalsIgnoreCase(scope) && stores.teamEnabled();
        IngestService.Spec spec = new IngestService.Spec();
        spec.title = req.question().length() > 80
                ? req.question().substring(0, 80) + "\u2026" : req.question();
        spec.sourceType = "answer";
        spec.rawText = "Q: " + req.question() + "\n\nA: " + req.answer();
        spec.teamName = isTeam ? teamName : null;
        spec.redact = isTeam;
        spec.tags = req.tags() == null ? List.of() : req.tags();
        IngestService.Result r = ingest.ingest(spec, stores.resolve(scope));
        return Map.of("id", r.id(), "title", r.title(),
                "scope", r.teamName() != null ? "team" : "personal");
    }
}
