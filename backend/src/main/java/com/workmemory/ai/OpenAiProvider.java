package com.workmemory.ai;

import com.workmemory.config.AppProperties;
import org.springframework.web.client.RestClient;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * OpenAI-backed provider (gpt-4o-mini + text-embedding-3-small) via direct REST.
 * LangChain4j is the planned orchestration layer; this interface is the seam
 * that makes the swap a one-liner.
 */
public class OpenAiProvider implements AiProvider {

    private final int dim;
    private final String chatModel;
    private final String embeddingModel;
    private final RestClient client;

    public OpenAiProvider(AppProperties.Ai cfg) {
        this.dim = cfg.getEmbeddingDimension();
        this.chatModel = cfg.getOpenai().getChatModel();
        this.embeddingModel = cfg.getOpenai().getEmbeddingModel();
        this.client = RestClient.builder()
                .baseUrl(cfg.getOpenai().getBaseUrl())
                .defaultHeader("Authorization", "Bearer " + cfg.getOpenai().getApiKey())
                .build();
    }

    @Override
    public int dimension() { return dim; }

    @Override
    public String name() { return "openai"; }

    @Override
    public boolean generative() { return true; }

    @Override
    public float[] embed(String text) {
        return embedBatch(List.of(text)).get(0);
    }

    @Override
    @SuppressWarnings("unchecked")
    public List<float[]> embedBatch(List<String> texts) {
        Map<String, Object> body = Map.of("model", embeddingModel, "input", texts);
        Map<String, Object> resp = client.post().uri("/embeddings")
                .body(body).retrieve().body(Map.class);
        List<Map<String, Object>> data = (List<Map<String, Object>>) resp.get("data");
        List<float[]> out = new ArrayList<>();
        for (Map<String, Object> d : data) {
            List<Number> emb = (List<Number>) d.get("embedding");
            float[] v = new float[emb.size()];
            for (int i = 0; i < emb.size(); i++) v[i] = emb.get(i).floatValue();
            out.add(v);
        }
        return out;
    }

    @Override
    public String generateAnswer(String question, List<String> contextSnippets) {
        StringBuilder ctx = new StringBuilder();
        for (int i = 0; i < contextSnippets.size(); i++) {
            ctx.append("[").append(i + 1).append("] ").append(contextSnippets.get(i)).append("\n\n");
        }
        String user = "Question: " + question + "\n\nContext:\n" + ctx;
        return chat(Prompts.ANSWER_SYSTEM, user);
    }

    @Override
    public String summarize(String text) {
        String t = text.length() > 6000 ? text.substring(0, 6000) : text;
        return chat(Prompts.SUMMARIZE_SYSTEM, t);
    }

    @Override
    public java.util.List<String> suggestTags(String title, String text) {
        String snippet = (title + " " + text).strip();
        if (snippet.length() > 800) snippet = snippet.substring(0, 800);
        String user = "Suggest tags for this content:\n" + snippet;
        String raw = chat(Prompts.TAG_SYSTEM, user);
        return java.util.Arrays.stream(raw.split(","))
                .map(s -> s.trim().toLowerCase().replaceAll("[^a-z0-9\\-]", ""))
                .filter(s -> !s.isBlank() && s.length() <= 30)
                .limit(5)
                .collect(java.util.stream.Collectors.toList());
    }

    @SuppressWarnings("unchecked")
    private String chat(String system, String user) {
        Map<String, Object> body = Map.of(
                "model", chatModel,
                "temperature", 0.2,
                "messages", List.of(
                        Map.of("role", "system", "content", system),
                        Map.of("role", "user", "content", user)));
        Map<String, Object> resp = client.post().uri("/chat/completions")
                .body(body).retrieve().body(Map.class);
        List<Map<String, Object>> choices = (List<Map<String, Object>>) resp.get("choices");
        Map<String, Object> msg = (Map<String, Object>) choices.get(0).get("message");
        return String.valueOf(msg.get("content")).strip();
    }
}
