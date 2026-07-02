package com.workmemory.store;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record MemoryView(
        UUID id,
        String title,
        String sourceType,
        String sourceUri,
        String summary,
        String teamName,
        String sensitivity,
        int redactionCount,
        boolean staleFlag,
        Instant createdAt,
        List<String> tags,
        String db   // "personal" or "team" — which store this came from
) {}
