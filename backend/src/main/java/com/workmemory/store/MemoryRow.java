package com.workmemory.store;

import java.time.Instant;
import java.util.UUID;

public record MemoryRow(
        UUID id,
        String title,
        String sourceType,
        String sourceUri,
        String rawText,
        String summary,
        String sensitivity,
        String teamName,
        int redactionCount,
        boolean staleFlag,
        Instant createdAt,
        Instant updatedAt
) {}
