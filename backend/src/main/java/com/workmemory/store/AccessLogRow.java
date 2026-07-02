package com.workmemory.store;

import java.time.Instant;
import java.util.UUID;

public record AccessLogRow(
        UUID id,
        String query,
        String router,
        String memoryIdsUsed,
        String confidence,
        String scope,
        Instant createdAt
) {}
