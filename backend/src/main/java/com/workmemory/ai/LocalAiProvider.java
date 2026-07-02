package com.workmemory.ai;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Deterministic, dependency-free provider so the whole product is testable with
 * zero API keys. Embeddings are hashed bag-of-words vectors (cosine ~ lexical/
 * semantic overlap); answers are extractive (sentences from the real sources).
 */
public class LocalAiProvider implements AiProvider {

    private static final Set<String> STOPWORDS = Set.of(
            "the", "a", "an", "is", "are", "was", "were", "be", "to", "of", "in", "on", "for",
            "and", "or", "but", "with", "at", "by", "from", "as", "it", "this", "that", "these",
            "those", "what", "which", "who", "how", "why", "when", "where", "did", "do", "does",
            "can", "could", "would", "should", "i", "you", "we", "they", "my", "our", "me");

    private final int dim;

    public LocalAiProvider(int dim) {
        this.dim = dim;
    }

    @Override
    public int dimension() { return dim; }

    @Override
    public String name() { return "local"; }

    @Override
    public boolean generative() { return false; }

    @Override
    public float[] embed(String text) {
        float[] v = new float[dim];
        List<String> tokens = TextUtil.tokenize(text);
        for (String tok : tokens) {
            addHashed(v, tok, 1.0f);
            // character trigrams give fuzzy / partial-match signal
            String padded = "#" + tok + "#";
            for (int i = 0; i + 3 <= padded.length(); i++) {
                addHashed(v, "tri:" + padded.substring(i, i + 3), 0.3f);
            }
        }
        VectorMath.l2NormalizeInPlace(v);
        return v;
    }

    private void addHashed(float[] v, String feature, float weight) {
        int h = feature.hashCode();
        int idx = Math.floorMod(h, dim);
        int sign = ((h >>> 31) & 1) == 0 ? 1 : -1;
        v[idx] += sign * weight;
    }

    @Override
    public List<float[]> embedBatch(List<String> texts) {
        List<float[]> out = new ArrayList<>(texts.size());
        for (String t : texts) out.add(embed(t));
        return out;
    }

    @Override
    public String generateAnswer(String question, List<String> contextSnippets) {
        Set<String> qTerms = new HashSet<>(TextUtil.tokenize(question));
        qTerms.removeAll(STOPWORDS);
        List<ScoredSentence> ranked = new ArrayList<>();
        int totalOverlap = 0;
        int n = contextSnippets.size();
        for (int si = 0; si < n; si++) {
            // earlier snippets are higher-ranked retrievals -> bias toward them
            double posWeight = (double) (n - si) / n;
            for (String sentence : TextUtil.splitSentences(contextSnippets.get(si))) {
                Set<String> matched = new HashSet<>();
                for (String tok : TextUtil.tokenize(sentence)) {
                    if (qTerms.contains(tok)) matched.add(tok);
                }
                int overlap = matched.size();
                totalOverlap += overlap;
                if (overlap > 0) ranked.add(new ScoredSentence(sentence, overlap + posWeight));
            }
        }
        // No real keyword overlap with any retrieved source -> refuse honestly
        // (don't fabricate from an irrelevant top chunk).
        if (totalOverlap == 0) return "";
        ranked.sort((a, b) -> Double.compare(b.score, a.score));
        StringBuilder sb = new StringBuilder();
        Set<String> seen = new HashSet<>();
        int used = 0;
        for (ScoredSentence s : ranked) {
            if (used >= 3) break;
            if (seen.add(s.text)) {
                if (sb.length() > 0) sb.append(' ');
                sb.append(s.text);
                used++;
            }
        }
        if (sb.length() == 0 && !contextSnippets.isEmpty()) {
            // fall back to the start of the best snippet
            String first = contextSnippets.get(0).strip();
            sb.append(first.length() > 400 ? first.substring(0, 400) + "\u2026" : first);
        }
        return sb.toString();
    }

    @Override
    public String summarize(String text) {
        if (text == null) return "";
        List<String> sentences = TextUtil.splitSentences(text);
        StringBuilder sb = new StringBuilder();
        for (String s : sentences) {
            if (sb.length() > 0) sb.append(' ');
            sb.append(s);
            if (sb.length() > 240) break;
        }
        String out = sb.toString().strip();
        return out.length() > 280 ? out.substring(0, 280) + "\u2026" : out;
    }

    @Override
    public List<String> suggestTags(String title, String text) {
        // Frequency-based keyword extraction: top non-stopword tokens
        java.util.Map<String, Integer> freq = new java.util.LinkedHashMap<>();
        for (String tok : TextUtil.tokenize(title + " " + text)) {
            if (!STOPWORDS.contains(tok) && tok.length() > 3) {
                freq.merge(tok, 1, Integer::sum);
            }
        }
        return freq.entrySet().stream()
                .sorted((a, b) -> b.getValue() - a.getValue())
                .map(java.util.Map.Entry::getKey)
                .limit(5)
                .collect(java.util.stream.Collectors.toList());
    }

    private record ScoredSentence(String text, double score) {}
}
