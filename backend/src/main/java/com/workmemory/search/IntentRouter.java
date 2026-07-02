package com.workmemory.search;

import org.springframework.stereotype.Component;

import java.util.Set;
import java.util.regex.Pattern;

/** Routes a query to content RAG, locate/find, or both. */
@Component
public class IntentRouter {

    public enum Intent { RAG, LOCATE, BOTH }

    private static final Pattern LOCATE_TOKEN = Pattern.compile(
            ".*([*?]|/|\\.[A-Za-z0-9]{1,5})($|\\s).*", Pattern.DOTALL);
    private static final Pattern EXT_TOKEN = Pattern.compile("\\S+\\.[A-Za-z0-9]{1,5}\\b");
    private static final Set<String> QUESTION_WORDS = Set.of(
            "what", "why", "how", "who", "when", "which", "explain", "summarize", "did", "does", "is", "are", "can");

    public Intent classify(String query) {
        if (query == null || query.isBlank()) return Intent.BOTH;
        String q = query.strip();
        String lower = q.toLowerCase();
        String firstWord = lower.split("\\s+", 2)[0];

        boolean hasLocateSignal = q.contains("*") || q.contains("?") && EXT_TOKEN.matcher(q).find()
                || q.contains("/") || EXT_TOKEN.matcher(q).find();
        // a bare path-ish / glob token also counts
        if (!hasLocateSignal) {
            hasLocateSignal = LOCATE_TOKEN.matcher(q).matches() && q.split("\\s+").length <= 3;
        }

        boolean isQuestion = q.endsWith("?") || QUESTION_WORDS.contains(firstWord) || lower.startsWith("where");

        if (hasLocateSignal && isQuestion) return Intent.BOTH;
        if (hasLocateSignal) return Intent.LOCATE;
        if (isQuestion) return Intent.RAG;
        // ambiguous bare keywords: search both and merge
        return Intent.BOTH;
    }
}
