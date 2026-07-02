package com.workmemory.ingest;

import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

@Component
public class Chunker {

    private static final int MAX_CHARS = 900;
    private static final int OVERLAP = 120;

    /** Split into overlapping chunks, preferring line boundaries. */
    public List<String> chunk(String text) {
        List<String> chunks = new ArrayList<>();
        if (text == null) return chunks;
        String t = text.strip();
        if (t.isEmpty()) return chunks;
        if (t.length() <= MAX_CHARS) {
            chunks.add(t);
            return chunks;
        }
        int start = 0;
        while (start < t.length()) {
            int end = Math.min(start + MAX_CHARS, t.length());
            if (end < t.length()) {
                int nl = t.lastIndexOf('\n', end);
                if (nl > start + MAX_CHARS / 2) {
                    end = nl;
                } else {
                    int sp = t.lastIndexOf(' ', end);
                    if (sp > start + MAX_CHARS / 2) end = sp;
                }
            }
            String piece = t.substring(start, end).strip();
            if (!piece.isEmpty()) chunks.add(piece);
            if (end >= t.length()) break;
            start = Math.max(end - OVERLAP, start + 1);
        }
        return chunks;
    }
}
