package com.workmemory.ingest;

import com.workmemory.ai.AiProvider;
import com.workmemory.store.MemoryRow;
import com.workmemory.store.MemoryStore;
import com.workmemory.store.MemoryStore.ChunkData;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/** Extract -> (optional redact) -> summarize -> chunk -> embed -> store. */
@Service
public class IngestService {

    private final RedactionService redaction;
    private final Chunker chunker;
    private final AiProvider ai;

    public IngestService(RedactionService redaction, Chunker chunker, AiProvider ai) {
        this.redaction = redaction;
        this.chunker = chunker;
        this.ai = ai;
    }

    public static class Spec {
        public String title;
        public String sourceType = "note";
        public String sourceUri;
        public String rawText;
        /** null means personal, non-null means team (the value is the team name). */
        public String teamName;
        /** If true the text is redacted before storage (enforced for team). */
        public boolean redact = false;
        public String sensitivity = "internal";
        public List<String> tags = new ArrayList<>();
    }

    public record Result(UUID id, String title, String sourceType, String teamName,
                         String summary, RedactionService.Result redaction) {}

    public Result ingest(Spec spec, MemoryStore target) {
        String raw = spec.rawText == null ? "" : spec.rawText;
        RedactionService.Result red = spec.redact ? redaction.redact(raw) : new RedactionService.Result(raw, 0, java.util.Map.of());

        Instant now = Instant.now();
        UUID id = UUID.randomUUID();
        String title = (spec.title == null || spec.title.isBlank())
                ? deriveTitle(red.redactedText()) : spec.title.strip();
        String summary = ai.summarize(red.redactedText());

        MemoryRow m = new MemoryRow(id, title, spec.sourceType, spec.sourceUri,
                red.redactedText(), summary, spec.sensitivity, spec.teamName,
                red.count(), false, now, now);
        target.saveMemory(m);

        List<ChunkData> data = buildChunks(title, spec.tags, red.redactedText());
        if (!data.isEmpty()) {
            target.saveChunks(id, data);
        }

        target.attachTags(id, spec.tags);
        return new Result(id, title, spec.sourceType, spec.teamName, summary, red);
    }

    /**
     * Chunks the text and prepends a metadata header (title + tags) to the first
     * chunk so that tag-based keyword queries can always find this memory.
     */
    public List<ChunkData> buildChunks(String title, List<String> tags, String text) {
        // Build a plain-English header that makes tags/title searchable
        StringBuilder header = new StringBuilder();
        header.append("Title: ").append(title);
        if (tags != null && !tags.isEmpty()) {
            header.append("\nTags: ").append(String.join(", ", tags));
        }

        List<String> rawChunks = chunker.chunk(text);

        List<String> finalChunks = new ArrayList<>();
        if (rawChunks.isEmpty()) {
            finalChunks.add(header.toString());
        } else {
            // First chunk carries the header so every memory is discoverable by title/tags
            finalChunks.add(header + "\n\n" + rawChunks.get(0));
            finalChunks.addAll(rawChunks.subList(1, rawChunks.size()));
        }

        List<float[]> embeddings = ai.embedBatch(finalChunks);
        List<ChunkData> data = new ArrayList<>();
        for (int i = 0; i < finalChunks.size(); i++) {
            data.add(new ChunkData(i, finalChunks.get(i), embeddings.get(i)));
        }
        return data;
    }

    private String deriveTitle(String text) {
        if (text == null || text.isBlank()) return "Untitled";
        String first = text.strip().split("\\r?\\n", 2)[0].strip();
        return first.length() > 80 ? first.substring(0, 80) + "\u2026" : first;
    }
}
