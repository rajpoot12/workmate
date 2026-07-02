package com.workmemory.search.dto;

import java.time.Instant;
import java.util.UUID;

public record FileHit(
        UUID id,
        String path,
        String name,
        String ext,
        Instant mtime,
        boolean prodDanger,
        double score
) {}
