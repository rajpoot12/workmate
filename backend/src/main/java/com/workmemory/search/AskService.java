package com.workmemory.search;

import com.workmemory.ai.AiProvider;
import com.workmemory.config.AppProperties;
import com.workmemory.search.dto.AskResponse;
import com.workmemory.search.dto.FileHit;
import com.workmemory.search.dto.SourceRef;
import com.workmemory.store.AccessLogRow;
import com.workmemory.store.MemoryStore;
import com.workmemory.store.StoreResolver;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Orchestrates intent routing, dual-store retrieval, merge, and answer generation.
 * Ask always searches BOTH personal and team stores and merges results.
 * Files are only fetched from personal store (local file system).
 */
@Service
public class AskService {

    private static final Logger log = LoggerFactory.getLogger(AskService.class);
    private static final int LOCATE_LIMIT = 12;

    private final IntentRouter router;
    private final RagEngine rag;
    private final AiProvider ai;
    private final StoreResolver stores;
    private final AppProperties props;

    public AskService(IntentRouter router, RagEngine rag, AiProvider ai,
                      StoreResolver stores, AppProperties props) {
        this.router = router;
        this.rag = rag;
        this.ai = ai;
        this.stores = stores;
        this.props = props;
    }

    /**
     * @param query     the user's question or glob
     * @param teamName  team name for filtering team store (null/blank = no team filter)
     * @param scope     "personal" or "team" (only used for access log; search always covers both)
     */
    public AskResponse ask(String query, String teamName, String scope) {
        IntentRouter.Intent intent = router.classify(query);
        int topK = props.getRag().getTopK();

        // --- File locate (personal only) ---
        List<FileHit> files = List.of();
        if (intent != IntentRouter.Intent.RAG) {
            files = stores.personal().locate(query, LOCATE_LIMIT);
        }

        // --- Hybrid search across both stores ---
        RagEngine.Result rr = null;
        if (intent != IntentRouter.Intent.LOCATE) {
            float[] qEmb = ai.embed(query);

            List<ScoredChunk> hits = new ArrayList<>();
            // Always search personal
            hits.addAll(stores.personal().search(qEmb, query, null, topK));

            // Also search team if enabled and team name known
            if (stores.teamEnabled() && teamName != null && !teamName.isBlank()) {
                try {
                    List<ScoredChunk> teamHits = stores.team().search(qEmb, query, teamName, topK);
                    hits.addAll(teamHits);
                    log.debug("Team search returned {} chunks", teamHits.size());
                } catch (Exception e) {
                    log.warn("Team search failed (degrading to personal only): {}", e.getMessage());
                }
            }

            // Merge and take top-K
            hits.sort(Comparator.comparingDouble((ScoredChunk c) -> c.score).reversed());
            if (hits.size() > topK) hits = hits.subList(0, topK);

            rr = rag.answer(query, hits);
        }

        // --- Compose response ---
        String answer;
        String confidence;
        List<SourceRef> sources;
        if (rr != null) {
            answer = rr.answer();
            confidence = rr.confidence();
            sources = rr.sources();
        } else {
            sources = List.of();
            answer = files.isEmpty()
                    ? "No matching files found."
                    : "Found " + files.size() + " matching file" + (files.size() == 1 ? "" : "s") + ".";
            confidence = files.isEmpty() ? "none" : "high";
        }
        if (rr != null && !rr.grounded() && !files.isEmpty()) {
            answer = "No grounded answer, but I found " + files.size() + " related file"
                    + (files.size() == 1 ? "" : "s") + ".";
            confidence = "low";
        }

        String routerName = intent.name().toLowerCase();
        logAccess(query, routerName, sources, confidence, scope);
        return new AskResponse(answer, sources, files, confidence, routerName);
    }

    private void logAccess(String query, String routerName, List<SourceRef> sources,
                           String confidence, String scope) {
        String ids = sources.stream().map(s -> s.memoryId().toString()).collect(Collectors.joining(","));
        stores.personal().saveAccessLog(new AccessLogRow(
                UUID.randomUUID(), query, routerName, ids, confidence, scope, Instant.now()));
    }
}
