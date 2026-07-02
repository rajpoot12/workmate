package com.workmemory.search;

import com.workmemory.config.AppProperties;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Decides when an Ask query should return raw_text verbatim instead of going
 * through RagEngine + LLM synthesis.
 *
 * Gate A — wantsVerbatim(): query signals "give me the full artifact"
 * Gate B — pickDominant(): search hits show one clearly matching memory
 *
 * Both gates must pass to trigger verbatim recall.
 */
@Component
public class VerbatimRecall {

    /** Leading force-prefix: "full: some query" or "verbatim: some query". */
    private static final Pattern FORCE_PREFIX = Pattern.compile(
            "^(full|verbatim)\\s*:\\s*", Pattern.CASE_INSENSITIVE);

    /**
     * Phrases that strongly signal "retrieve the full artifact, not an explanation".
     * Checked against the full lowercased query.
     */
    private static final Pattern RETRIEVAL_PHRASE = Pattern.compile(
            "\\b(show|give|get|send|fetch|display|return)\\s+(me\\s+)?(the\\s+)?(full|complete|entire\\s+)?"
            + "(script|sql|query|runbook|migration|procedure|function|snippet|code)\\b",
            Pattern.CASE_INSENSITIVE);

    /** "script to …" / "script for …" / "sql for …" / "query for …" */
    private static final Pattern SCRIPT_FOR = Pattern.compile(
            "^(script|sql|query|runbook|migration)\\s+(to|for)\\b",
            Pattern.CASE_INSENSITIVE);

    /** "full script …" / "complete sql …" / "entire runbook …" */
    private static final Pattern MODIFIER_ARTIFACT = Pattern.compile(
            "\\b(full|complete|entire)\\s+(script|sql|query|runbook|migration|procedure|code)\\b",
            Pattern.CASE_INSENSITIVE);

    /** Words that indicate the user wants understanding, not the full text. */
    private static final Set<String> QUESTION_WORDS = Set.of(
            "what", "why", "how", "who", "when", "which", "explain",
            "summarize", "summarise", "describe", "did", "does", "is",
            "are", "can", "could", "should", "would");

    /**
     * Heuristic to tell if raw_text looks like code/SQL worth fencing as {@code sql}.
     * Checked as a fast pre-scan on the first 400 chars.
     */
    private static final Pattern SQL_SIGNAL = Pattern.compile(
            "\\b(SET @|CREATE TABLE|INSERT INTO|DELETE FROM|UPDATE |DROP TABLE|SELECT |ALTER TABLE)\\b",
            Pattern.CASE_INSENSITIVE);

    private final double minConfidence;
    private static final double DOMINANCE_GAP = 0.05;
    private static final int MIN_CHUNK_FREQUENCY = 2;

    public VerbatimRecall(AppProperties props) {
        this.minConfidence = props.getRag().getMinConfidenceScore();
    }

    /**
     * Returns the effective search query with any force-prefix stripped, or the
     * original query if no prefix was present. The caller should search with this
     * stripped query so "full:" doesn't pollute embedding / keyword search.
     */
    public String stripForcePrefix(String query) {
        if (query == null) return "";
        return FORCE_PREFIX.matcher(query.strip()).replaceFirst("").strip();
    }

    /**
     * Gate A: does the query express verbatim retrieval intent?
     * Pass the original (un-stripped) query; the force-prefix short-circuits to true.
     */
    public boolean wantsVerbatim(String query) {
        if (query == null || query.isBlank()) return false;
        String q = query.strip();

        // Force prefix always wins
        if (FORCE_PREFIX.matcher(q).find()) return true;

        String lower = q.toLowerCase();
        String firstWord = lower.split("\\s+", 2)[0];

        // Block: explicit question intent
        if (QUESTION_WORDS.contains(firstWord)) return false;
        if (q.endsWith("?") && QUESTION_WORDS.contains(firstWord)) return false;

        // Allow: any retrieval signal
        if (RETRIEVAL_PHRASE.matcher(lower).find()) return true;
        if (SCRIPT_FOR.matcher(lower).find()) return true;
        if (MODIFIER_ARTIFACT.matcher(lower).find()) return true;

        return false;
    }

    /**
     * Gate B: given the already-retrieved and scored chunks, pick a dominant
     * single memory to return verbatim. Returns empty if no memory qualifies.
     */
    public Optional<UUID> pickDominant(List<ScoredChunk> hits) {
        if (hits == null || hits.isEmpty()) return Optional.empty();

        ScoredChunk top = hits.get(0);
        if (top.score < minConfidence) return Optional.empty();

        UUID topId = top.memoryId;

        // Count how many of the top hits share the same memory id
        long sameCount = hits.stream().filter(c -> topId.equals(c.memoryId)).count();
        if (sameCount >= MIN_CHUNK_FREQUENCY) return Optional.of(topId);

        // OR: top score is significantly ahead of the best score from a different memory
        double bestOther = hits.stream()
                .filter(c -> !topId.equals(c.memoryId))
                .mapToDouble(c -> c.score)
                .max()
                .orElse(0.0);
        if (top.score - bestOther >= DOMINANCE_GAP) return Optional.of(topId);

        return Optional.empty();
    }

    /**
     * Wraps raw text in an appropriate fenced code block.
     * Detects SQL by scanning the first 400 characters.
     */
    public String fenceContent(String rawText) {
        if (rawText == null) return "";
        String snippet = rawText.length() > 400 ? rawText.substring(0, 400) : rawText;
        String lang = SQL_SIGNAL.matcher(snippet).find() ? "sql" : "text";
        return "```" + lang + "\n" + rawText.strip() + "\n```";
    }
}
