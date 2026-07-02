package com.workmemory.web;

import com.workmemory.ingest.IngestService;
import com.workmemory.store.StoreResolver;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Slack slash-command webhook: /wm <text>
 *
 * Setup in Slack App dashboard:
 *   - Create a Slash Command: /wm
 *   - Request URL: http://<your-server>:8080/api/webhook/slack
 *   - Optionally set SLACK_TOKEN in .env and uncomment the token check below.
 *
 * Microsoft Teams: use a Power Automate flow to POST to /api/webhook/slack
 * with the same form parameters (text, user_name).
 */
@RestController
@RequestMapping("/api/webhook")
public class SlackController {

    private static final Logger log = LoggerFactory.getLogger(SlackController.class);

    private final IngestService ingest;
    private final StoreResolver stores;

    public SlackController(IngestService ingest, StoreResolver stores) {
        this.ingest = ingest;
        this.stores = stores;
    }

    @PostMapping(value = "/slack", consumes = MediaType.APPLICATION_FORM_URLENCODED_VALUE)
    public ResponseEntity<Map<String, Object>> slashCommand(
            @RequestParam(value = "text", required = false) String text,
            @RequestParam(value = "user_name", required = false, defaultValue = "slack-user") String userName,
            @RequestParam(value = "command", required = false, defaultValue = "/wm") String command) {

        if (text == null || text.isBlank()) {
            return ok("ephemeral", "Usage: `/wm <your note or knowledge>`\nExample: `/wm The staging DB password rotates every 30 days`");
        }

        text = text.strip();

        // /wm help
        if ("help".equalsIgnoreCase(text)) {
            return ok("ephemeral",
                    "*WorkMemory AI* — save team knowledge from Slack\n"
                    + "• `/wm <text>` — save a note to team memory\n"
                    + "• `/wm tags:<tag1,tag2> <text>` — save with tags\n"
                    + "• `/wm help` — show this message");
        }

        // Parse optional inline tags: "tags:kafka,runbook Do the thing"
        List<String> tags = List.of("slack", userName);
        String noteText = text;
        if (text.startsWith("tags:")) {
            int space = text.indexOf(' ');
            if (space > 0) {
                String tagPart = text.substring(5, space);
                noteText = text.substring(space + 1).strip();
                List<String> parsed = new java.util.ArrayList<>(List.of(tagPart.split(",")));
                parsed.add("slack");
                parsed.add(userName);
                tags = parsed;
            }
        }

        try {
            IngestService.Spec spec = new IngestService.Spec();
            spec.title = noteText.length() > 80 ? noteText.substring(0, 80) + "…" : noteText;
            spec.sourceType = "slack";
            spec.rawText = noteText;
            spec.redact = false; // Saves to personal by default; set true for team
            spec.tags = tags;
            IngestService.Result r = ingest.ingest(spec, stores.personal());

            log.info("Slack capture from @{}: {}", userName, r.title());
            return ok("ephemeral",
                    "✅ *Saved to WorkMemory*\n> " + r.title()
                    + (r.redaction().count() > 0 ? "\n_" + r.redaction().count() + " items masked_" : ""));
        } catch (Exception e) {
            log.error("Slack webhook ingest failed", e);
            return ok("ephemeral", "❌ Failed to save: " + e.getMessage());
        }
    }

    private ResponseEntity<Map<String, Object>> ok(String responseType, String text) {
        Map<String, Object> body = new HashMap<>();
        body.put("response_type", responseType);
        body.put("text", text);
        return ResponseEntity.ok(body);
    }
}
