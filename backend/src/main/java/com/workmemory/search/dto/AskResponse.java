package com.workmemory.search.dto;

import java.util.List;

/** The grounding contract returned by every /api/ask call. */
public record AskResponse(
        String answer,
        List<SourceRef> sources,
        List<FileHit> files,
        String confidence,   // high | medium | low | none
        String router,       // rag | locate | both
        String mode          // rag | verbatim | locate — how the answer was produced
) {}
