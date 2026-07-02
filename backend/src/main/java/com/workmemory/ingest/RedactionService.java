package com.workmemory.ingest;

import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Masks secrets / PII before anything is stored or sent to the AI.
 * Masking is counted and labelled so the UI can show it visibly.
 */
@Service
public class RedactionService {

    public record Result(String redactedText, int count, Map<String, Integer> byType) {}

    private record Rule(String type, Pattern pattern, java.util.function.Function<Matcher, String> replace) {}

    private final List<Rule> rules = new ArrayList<>();

    public RedactionService() {
        // Order matters: most specific first.
        add("PRIVATE_KEY", "(?s)-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----",
                m -> "[REDACTED:PRIVATE_KEY]");
        add("JWT", "eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+",
                m -> "[REDACTED:JWT]");
        add("BEARER", "(?i)bearer\\s+[A-Za-z0-9._\\-]{8,}",
                m -> "Bearer [REDACTED:TOKEN]");
        add("API_KEY", "\\bsk-[A-Za-z0-9]{16,}\\b",
                m -> "[REDACTED:API_KEY]");
        add("SLACK_TOKEN", "\\bxox[baprs]-[A-Za-z0-9-]{8,}\\b",
                m -> "[REDACTED:SLACK_TOKEN]");
        add("AWS_KEY", "\\bAKIA[0-9A-Z]{16}\\b",
                m -> "[REDACTED:AWS_KEY]");
        // crypto/hash function calls with quoted args: AES_ENCRYPT('secret','key'), MD5('x'), etc.
        add("CRYPTO_ARG", "(?i)\\b(AES_ENCRYPT|AES_DECRYPT|ENCRYPT|DECRYPT|PASSWORD|MD5|SHA1|SHA2|HASH)\\s*\\(\\s*'[^']*'(\\s*,\\s*'[^']*')*\\s*\\)",
                m -> m.group(1) + "([REDACTED:SECRET])");
        // quoted credential assignment (SQL/code): PASSWORD = 'literal', secret: "literal"
        add("CREDENTIAL", "(?i)\\b(password|passwd|pwd|secret|api[_-]?key|access[_-]?token|token|client[_-]?secret)\\b\\s*[:=]\\s*[\"'][^\"']*[\"']",
                m -> m.group(1) + "=[REDACTED:CREDENTIAL]");
        // unquoted credential assignment: password=foo, token: abc123
        add("CREDENTIAL", "(?i)\\b(password|passwd|pwd|secret|api[_-]?key|access[_-]?token|token|client[_-]?secret)\\b\\s*[:=]\\s*[^\\s\"';,)]+",
                m -> m.group(1) + "=[REDACTED:CREDENTIAL]");
        add("EMAIL", "\\b[A-Za-z0-9._%+\\-]+@[A-Za-z0-9.\\-]+\\.[A-Za-z]{2,}\\b",
                m -> "[REDACTED:EMAIL]");
        add("INTERNAL_HOST", "\\b[a-z0-9\\-]+\\.(?:internal|corp|local|intra)\\b",
                m -> "[REDACTED:HOST]");
        add("PRIVATE_IP", "\\b(?:10\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}|192\\.168\\.\\d{1,3}\\.\\d{1,3}|172\\.(?:1[6-9]|2\\d|3[01])\\.\\d{1,3}\\.\\d{1,3})\\b",
                m -> "[REDACTED:IP]");
        add("CUSTOMER_ID", "\\b(?:CUST|CUSTOMER|ACCT)-\\d{3,}\\b",
                m -> "[REDACTED:CUSTOMER_ID]");
    }

    private void add(String type, String regex, java.util.function.Function<Matcher, String> repl) {
        rules.add(new Rule(type, Pattern.compile(regex), repl));
    }

    public Result redact(String input) {
        if (input == null) return new Result("", 0, Map.of());
        String text = input;
        int total = 0;
        Map<String, Integer> byType = new LinkedHashMap<>();
        for (Rule rule : rules) {
            Matcher m = rule.pattern().matcher(text);
            StringBuilder sb = new StringBuilder();
            int hits = 0;
            while (m.find()) {
                hits++;
                m.appendReplacement(sb, Matcher.quoteReplacement(rule.replace().apply(m)));
            }
            m.appendTail(sb);
            if (hits > 0) {
                byType.merge(rule.type(), hits, Integer::sum);
                total += hits;
                text = sb.toString();
            }
        }
        return new Result(text, total, byType);
    }
}
