package com.workmemory.search.dto;

import java.util.UUID;

/** scope = "personal" | "team" — which database this source came from. */
public record SourceRef(
        UUID memoryId,
        String title,
        String sourceType,
        String sourceUri,
        String quote,
        String scope,   // kept as "scope" for frontend compatibility
        double score
) {}
