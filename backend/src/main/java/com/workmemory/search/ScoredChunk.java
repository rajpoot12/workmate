package com.workmemory.search;

import java.time.Instant;
import java.util.UUID;

public class ScoredChunk {
    public UUID chunkId;
    public UUID memoryId;
    public String text;
    public String memoryTitle;
    public String sourceType;
    public String sourceUri;
    public String db;         // "personal" or "team" — set by MemoryStore
    public Instant createdAt;
    public double cosine;
    public double keyword;
    public double score;
}
