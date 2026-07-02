package com.workmemory.web;

import com.workmemory.ingest.RedactionService;
import com.workmemory.web.dto.Requests;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api")
public class RedactController {

    private final RedactionService redaction;

    public RedactController(RedactionService redaction) {
        this.redaction = redaction;
    }

    @PostMapping("/redact/preview")
    public Map<String, Object> preview(@RequestBody Requests.RedactRequest req) {
        RedactionService.Result r = redaction.redact(req.text());
        return Map.of(
                "redactedText", r.redactedText(),
                "count", r.count(),
                "byType", r.byType());
    }
}
