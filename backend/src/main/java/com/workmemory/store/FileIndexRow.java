package com.workmemory.store;

import java.time.Instant;
import java.util.UUID;

public record FileIndexRow(
        UUID id,
        String rootDir,
        String path,
        String name,
        String ext,
        Long sizeBytes,
        Instant mtime,
        boolean indexedContent,
        boolean prodDanger,
        Instant createdAt
) {}
