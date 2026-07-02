package com.workmemory.web.dto;

import java.util.List;

public final class Requests {

    public record NoteRequest(
            String title,
            String text,
            List<String> tags,
            String teamName,    // optional: override team name from header
            String sensitivity) {}

    public record ScanRequest(String rootDir, boolean indexContent) {}

    public record AskRequest(String query) {}

    public record CaptureRequest(
            String mode,    // "save" | "ask"
            String text,
            String url,
            String title,
            List<String> tags) {}

    public record SaveAnswerRequest(String question, String answer, List<String> tags) {}

    public record RedactRequest(String text) {}

    private Requests() {}
}
