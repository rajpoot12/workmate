package com.workmemory.ai;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public final class TextUtil {

    private TextUtil() {}

    public static List<String> tokenize(String text) {
        List<String> out = new ArrayList<>();
        if (text == null) return out;
        // Split camelCase and letter/digit boundaries so identifiers like
        // "passwordHashing" / "PASSWORD_SALT" yield "password","hashing","salt".
        String spaced = text
                .replaceAll("([a-z0-9])([A-Z])", "$1 $2")
                .replaceAll("([A-Za-z])([0-9])", "$1 $2")
                .replaceAll("([0-9])([A-Za-z])", "$1 $2");
        for (String t : spaced.toLowerCase(Locale.ROOT).split("[^a-z0-9]+")) {
            if (t.length() >= 2) out.add(t);
        }
        return out;
    }

    /** Naive sentence/line splitter that also keeps code-ish lines intact. */
    public static List<String> splitSentences(String text) {
        List<String> out = new ArrayList<>();
        if (text == null || text.isBlank()) return out;
        for (String para : text.split("\\r?\\n")) {
            String line = para.strip();
            if (line.isEmpty()) continue;
            // further split prose lines on sentence boundaries
            for (String s : line.split("(?<=[.!?])\\s+(?=[A-Z0-9\"'])")) {
                String sent = s.strip();
                if (!sent.isEmpty()) out.add(sent);
            }
        }
        return out;
    }
}
