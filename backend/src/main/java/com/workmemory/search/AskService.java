package com.workmemory.search;

import com.workmemory.ai.AiProvider;
import com.workmemory.config.AppProperties;
import com.workmemory.search.dto.AskResponse;
import com.workmemory.search.dto.FileHit;
import com.workmemory.search.dto.SourceRef;
import com.workmemory.store.AccessLogRow;
import com.workmemory.store.MemoryRow;
import com.workmemory.store.MemoryStore;
import com.workmemory.store.StoreResolver;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Orchestrates intent routing, scope-aware retrieval, verbatim recall, and answer generation.
 *
 * Search scope rules:
 *   personal → searches personal + team stores and merges results
 *   team     → searches team store only (no personal bleed-through)
 *
 * Verbatim recall: when a query signals "give me the full script/sql/runbook" and one
 * memory clearly dominates the search results, raw_text is returned directly without LLM
 * synthesis. All other queries continue through RagEngine as before.
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
    private final VerbatimRecall verbatim;

    public AskService(IntentRouter router, RagEngine rag, AiProvider ai,
                      StoreResolver stores, AppProperties props, VerbatimRecall verbatim) {
        this.router = router;
        this.rag = rag;
        this.ai = ai;
        this.stores = stores;
        this.props = props;
        this.verbatim = verbatim;
    }

    /**
     * @param query     the user's question or glob
     * @param teamName  team name for filtering team store (null/blank = no team filter in personal mode)
     * @param scope     "personal" or "team"
     */
    public AskResponse ask(String query, String teamName, String scope) {
        boolean isTeam = "team".equalsIgnoreCase(scope);

        // Guard: team mode requires the team store to be available
        if (isTeam) {
            if (!stores.teamEnabled()) {
                return noMemory(
                        "Team mode is on but the team database is not configured. "
                        + "Go to Settings → Team to set it up.", scope);
            }
            if (teamName == null || teamName.isBlank()) {
                return noMemory(
                        "Team mode is on but no team name is set. "
                        + "Go to Settings → Team and save your team name.", scope);
            }
        }

        // Strip any force-prefix before building the embedding/keyword query
        String effectiveQuery = verbatim.stripForcePrefix(query);
        IntentRouter.Intent intent = router.classify(effectiveQuery);
        int topK = props.getRag().getTopK();

        // File locate — personal store only (team servers have no local file index)
        List<FileHit> files = List.of();
        if (!isTeam && intent != IntentRouter.Intent.RAG) {
            files = stores.personal().locate(effectiveQuery, LOCATE_LIMIT);
        }

        // Hybrid vector + keyword search, scope-aware
        RagEngine.Result rr = null;
        if (intent != IntentRouter.Intent.LOCATE) {
            float[] qEmb = ai.embed(effectiveQuery);
            List<ScoredChunk> hits = buildHits(qEmb, effectiveQuery, teamName, isTeam, topK);

            // Verbatim path: full raw_text if query signals retrieval and one memory dominates
            if (verbatim.wantsVerbatim(query)) {
                Optional<UUID> dominant = verbatim.pickDominant(hits);
                if (dominant.isPresent()) {
                    AskResponse verbatimResponse = tryVerbatimResponse(
                            dominant.get(), hits, intent, scope);
                    if (verbatimResponse != null) return verbatimResponse;
                }
            }

            rr = rag.answer(effectiveQuery, hits);
        }

        // Compose standard RAG or locate response
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
        logAccess(effectiveQuery, routerName, sources, confidence, scope);
        return new AskResponse(answer, sources, files, confidence, routerName, "rag");
    }

    // ------------------------------------------------------------------
    // Scope-aware search
    // ------------------------------------------------------------------

    private List<ScoredChunk> buildHits(float[] qEmb, String query, String teamName,
                                         boolean isTeam, int topK) {
        List<ScoredChunk> hits = new ArrayList<>();

        if (isTeam) {
            // Team mode: team store only
            try {
                hits.addAll(stores.team().search(qEmb, query, teamName, topK));
            } catch (Exception e) {
                log.warn("Team search failed: {}", e.getMessage());
            }
        } else {
            // Personal mode: personal first, also team if available
            hits.addAll(stores.personal().search(qEmb, query, null, topK));
            if (stores.teamEnabled() && teamName != null && !teamName.isBlank()) {
                try {
                    List<ScoredChunk> teamHits = stores.team().search(qEmb, query, teamName, topK);
                    hits.addAll(teamHits);
                    log.debug("Team search returned {} chunks", teamHits.size());
                } catch (Exception e) {
                    log.warn("Team search failed (degrading to personal only): {}", e.getMessage());
                }
            }
        }

        hits.sort(Comparator.comparingDouble((ScoredChunk c) -> c.score).reversed());
        if (hits.size() > topK) hits = hits.subList(0, topK);
        return hits;
    }

    // ------------------------------------------------------------------
    // Verbatim response builder
    // ------------------------------------------------------------------

    private AskResponse tryVerbatimResponse(UUID memoryId, List<ScoredChunk> hits,
                                             IntentRouter.Intent intent, String scope) {
        // Resolve which store owns this memory (honoured by the db field on the chunk)
        ScoredChunk representative = hits.stream()
                .filter(c -> memoryId.equals(c.memoryId))
                .findFirst()
                .orElse(null);
        if (representative == null) return null;

        MemoryStore store = "team".equals(representative.db) ? stores.team() : stores.personal();
        MemoryRow m = store.findById(memoryId);
        if (m == null || m.rawText() == null || m.rawText().isBlank()) return null;

        String fenced = verbatim.fenceContent(m.rawText());
        SourceRef source = new SourceRef(
                m.id(), m.title(), m.sourceType(), m.sourceUri(),
                "verbatim recall", representative.db, representative.score);

        String routerName = intent.name().toLowerCase();
        logAccess("verbatim:" + m.title(), routerName, List.of(source), "high", scope);
        return new AskResponse(fenced, List.of(source), List.of(), "high", routerName, "verbatim");
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    private AskResponse noMemory(String message, String scope) {
        logAccess("(team-guard)", "rag", List.of(), "none", scope);
        return new AskResponse(message, List.of(), List.of(), "none", "rag", "rag");
    }

    private void logAccess(String query, String routerName, List<SourceRef> sources,
                           String confidence, String scope) {
        String ids = sources.stream().map(s -> s.memoryId().toString()).collect(Collectors.joining(","));
        // Log to personal store always (personal is always available; team log is future work)
        stores.personal().saveAccessLog(new AccessLogRow(
                UUID.randomUUID(), query, routerName, ids, confidence, scope, Instant.now()));
    }
}
