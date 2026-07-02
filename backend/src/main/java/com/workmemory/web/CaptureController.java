package com.workmemory.web;

import com.workmemory.ingest.IngestService;
import com.workmemory.ingest.ScanService;
import com.workmemory.ingest.TextExtractor;
import com.workmemory.search.AskService;
import com.workmemory.store.StoreResolver;
import com.workmemory.web.dto.Requests;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** Capture surfaces: notes, file upload, directory scan, browser capture. */
@RestController
@RequestMapping("/api")
public class CaptureController {

    private final IngestService ingest;
    private final ScanService scan;
    private final TextExtractor extractor;
    private final AskService ask;
    private final StoreResolver stores;

    public CaptureController(IngestService ingest, ScanService scan, TextExtractor extractor,
                             AskService ask, StoreResolver stores) {
        this.ingest = ingest;
        this.scan = scan;
        this.extractor = extractor;
        this.ask = ask;
        this.stores = stores;
    }

    @PostMapping("/notes")
    public Map<String, Object> createNote(
            @RequestHeader(value = "X-Scope", defaultValue = "personal") String scope,
            @RequestHeader(value = "X-Team", required = false) String teamName,
            @RequestBody Requests.NoteRequest req) {
        boolean isTeam = "team".equalsIgnoreCase(scope) && stores.teamEnabled();
        IngestService.Spec spec = buildSpec(req.title(), req.text(), "note", null,
                isTeam ? coalesce(teamName, req.teamName()) : null,
                isTeam, req.sensitivity(), req.tags());
        IngestService.Result r = ingest.ingest(spec, stores.resolve(scope));
        return resultMap(r);
    }

    @PostMapping(value = "/files/upload", consumes = "multipart/form-data")
    public ResponseEntity<Map<String, Object>> upload(
            @RequestHeader(value = "X-Scope", defaultValue = "personal") String scope,
            @RequestHeader(value = "X-Team", required = false) String teamName,
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "tags", required = false) String tags) throws IOException {
        TextExtractor.Extracted ex = extractor.extract(file.getOriginalFilename(), file.getBytes());
        if (ex.text() == null || ex.text().isBlank()) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "Could not extract text from this file type (" + ex.detectedType() + ")."));
        }
        boolean isTeam = "team".equalsIgnoreCase(scope) && stores.teamEnabled();
        IngestService.Spec spec = buildSpec(file.getOriginalFilename(), ex.text(), "file",
                file.getOriginalFilename(), isTeam ? teamName : null,
                isTeam, "internal", parseTags(tags));
        IngestService.Result r = ingest.ingest(spec, stores.resolve(scope));
        Map<String, Object> body = resultMap(r);
        body.put("detectedType", ex.detectedType());
        return ResponseEntity.ok(body);
    }

    @PostMapping("/files/scan")
    public ScanService.ScanResult scanDir(
            @RequestHeader(value = "X-Scope", defaultValue = "personal") String scope,
            @RequestBody Requests.ScanRequest req) {
        return scan.scan(req.rootDir(), req.indexContent(), stores.resolve(scope));
    }

    @PostMapping("/browser/capture")
    public Object browserCapture(
            @RequestHeader(value = "X-Scope", defaultValue = "personal") String scope,
            @RequestHeader(value = "X-Team", required = false) String teamName,
            @RequestBody Requests.CaptureRequest req) {
        if ("ask".equalsIgnoreCase(req.mode())) {
            return ask.ask(req.text(), teamName, scope);
        }
        boolean isTeam = "team".equalsIgnoreCase(scope) && stores.teamEnabled();
        IngestService.Spec spec = buildSpec(
                req.title() == null || req.title().isBlank() ? "Web clip" : req.title(),
                req.text(), "browser", req.url(),
                isTeam ? teamName : null, isTeam, "internal",
                req.tags() == null ? List.of() : req.tags());
        IngestService.Result r = ingest.ingest(spec, stores.resolve(scope));
        return resultMap(r);
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    private IngestService.Spec buildSpec(String title, String text, String sourceType, String sourceUri,
                                         String teamName, boolean redact, String sensitivity, List<String> tags) {
        IngestService.Spec s = new IngestService.Spec();
        s.title = title;
        s.sourceType = sourceType;
        s.sourceUri = sourceUri;
        s.rawText = text;
        s.teamName = teamName;
        s.redact = redact;
        s.sensitivity = sensitivity == null ? "internal" : sensitivity;
        s.tags = tags == null ? List.of() : tags;
        return s;
    }

    private Map<String, Object> resultMap(IngestService.Result r) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", r.id());
        m.put("title", r.title());
        m.put("sourceType", r.sourceType());
        m.put("scope", r.teamName() != null ? "team" : "personal");
        m.put("summary", r.summary());
        m.put("redactionCount", r.redaction().count());
        m.put("redactedTypes", r.redaction().byType());
        return m;
    }

    private List<String> parseTags(String tags) {
        if (tags == null || tags.isBlank()) return List.of();
        return List.of(tags.split("\\s*,\\s*"));
    }

    private String coalesce(String a, String b) {
        if (a != null && !a.isBlank()) return a;
        return b;
    }
}
