package com.workmemory.search;

import com.workmemory.ai.AiProvider;
import com.workmemory.config.AppProperties;
import com.workmemory.search.dto.SourceRef;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/** Content search (RAG): retrieve -> ground -> answer with honest confidence. */
@Service
public class RagEngine {

    private final AiProvider ai;
    private final AppProperties props;

    public RagEngine(AiProvider ai, AppProperties props) {
        this.ai = ai;
        this.props = props;
    }

    public record Result(String answer, List<SourceRef> sources, String confidence, boolean grounded) {}

    /**
     * Runs RAG over a pre-fetched, merged list of scored chunks.
     * Chunks already have {@code db} set to "personal" or "team".
     */
    public Result answer(String query, List<ScoredChunk> hits) {
        double minConf = props.getRag().getMinConfidenceScore();
        if (hits.isEmpty() || hits.get(0).score < minConf) {
            return new Result(
                    "I don't have a memory for this yet \u2014 want to save one?",
                    List.of(), "none", false);
        }

        List<String> snippets = new ArrayList<>();
        for (ScoredChunk c : hits) snippets.add(c.text);
        String answer = ai.generateAnswer(query, snippets);

        if (answer == null || answer.isBlank()) {
            return new Result(
                    "I don't have a memory for this yet \u2014 want to save one?",
                    List.of(), "none", false);
        }

        List<SourceRef> sources = new ArrayList<>();
        Set<UUID> seen = new LinkedHashSet<>();
        for (ScoredChunk c : hits) {
            if (c.score <= 0) continue;
            if (seen.add(c.memoryId)) {
                sources.add(new SourceRef(
                        c.memoryId, c.memoryTitle, c.sourceType, c.sourceUri,
                        quote(c.text), c.db, round(c.score)));
            }
            if (sources.size() >= 4) break;
        }

        double top = hits.get(0).score;
        String confidence = top >= 0.45 ? "high" : top >= 0.30 ? "medium" : "low";
        return new Result(answer, sources, confidence, true);
    }

    private String quote(String text) {
        String t = text.strip().replaceAll("\\s+", " ");
        return t.length() > 220 ? t.substring(0, 220) + "\u2026" : t;
    }

    private double round(double v) {
        return Math.round(v * 1000.0) / 1000.0;
    }
}
