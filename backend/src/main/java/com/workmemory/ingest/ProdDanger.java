package com.workmemory.ingest;

import java.util.regex.Pattern;

/** Flags destructive / production-dangerous operations in scripts and notes. */
public final class ProdDanger {

    private static final Pattern[] PATTERNS = {
            Pattern.compile("(?i)rm\\s+-rf"),
            Pattern.compile("(?i)\\bdrop\\s+(table|database|schema)\\b"),
            Pattern.compile("(?i)\\btruncate\\s+table\\b"),
            Pattern.compile("(?i)delete\\s+from\\s+\\w+\\s*;?\\s*$"),
            Pattern.compile("(?i)(restart|stop|kill)\\b.*\\bprod"),
            Pattern.compile("(?i)\\bshutdown\\b"),
            Pattern.compile("(?i)kubectl\\s+delete"),
            Pattern.compile("(?i)\\bDROP\\s+USER\\b"),
            Pattern.compile("(?i)mkfs|dd\\s+if=")
    };

    private ProdDanger() {}

    public static boolean isDangerous(String text) {
        if (text == null) return false;
        for (Pattern p : PATTERNS) {
            if (p.matcher(text).find()) return true;
        }
        return false;
    }
}
