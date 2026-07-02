package com.workmemory.web;

import com.workmemory.config.AppProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestClient;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.sql.DriverManager;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * In-app configuration management.
 *
 * GET  /api/settings        — read current config (passwords masked)
 * POST /api/settings        — write .env + schedule backend restart
 * POST /api/settings/test   — test a DB or OpenAI connection without saving
 */
@RestController
@RequestMapping("/api/settings")
public class SettingsController {

    private static final Logger log = LoggerFactory.getLogger(SettingsController.class);
    private static final String MASKED = "***";

    private final AppProperties props;

    /** Root directory of the project (parent of backend/). Resolved at startup. */
    private final Path projectRoot;

    public SettingsController(AppProperties props) {
        this.props = props;
        // Resolve project root: go up from the running JVM's working dir
        this.projectRoot = resolveProjectRoot();
    }

    // ------------------------------------------------------------------
    // GET /api/settings
    // ------------------------------------------------------------------

    @GetMapping
    public Map<String, Object> getSettings() {
        Map<String, Object> m = new LinkedHashMap<>();

        // AI
        m.put("aiProvider", props.getAi().getProvider());
        String key = props.getAi().getOpenai().getApiKey();
        m.put("openaiApiKey", key == null || key.isBlank() ? "" : MASKED);
        m.put("openaiBaseUrl", props.getAi().getOpenai().getBaseUrl());
        m.put("openaiChatModel", props.getAi().getOpenai().getChatModel());
        m.put("openaiEmbeddingModel", props.getAi().getOpenai().getEmbeddingModel());

        // Personal DB — parse URL into host/port/db
        String personalUrl = props.getPersonal().getUrl();
        m.putAll(parseJdbcUrl(personalUrl, "personal"));
        m.put("personalUsername", props.getPersonal().getUsername());
        m.put("personalPassword", MASKED);

        // Team DB
        m.put("teamEnabled", props.getTeam().isEnabled());
        m.put("teamName", props.getTeam().getName());
        String teamUrl = props.getTeam().getUrl();
        m.putAll(parseJdbcUrl(teamUrl, "team"));
        m.put("teamUsername", props.getTeam().getUsername());
        String teamPass = props.getTeam().getPassword();
        m.put("teamPassword", teamPass == null || teamPass.isBlank() ? "" : MASKED);

        return m;
    }

    // ------------------------------------------------------------------
    // POST /api/settings/test
    // ------------------------------------------------------------------

    @PostMapping("/test")
    public ResponseEntity<Map<String, Object>> testConnection(@RequestBody Map<String, String> req) {
        String type = req.getOrDefault("type", "");
        try {
            switch (type) {
                case "personal-db" -> {
                    String url = buildJdbcUrl(req.get("host"), req.get("port"), req.get("database"));
                    String user = req.getOrDefault("username", "workmemory");
                    String pass = req.getOrDefault("password", "");
                    // If caller sent masked value, use current config password
                    if (MASKED.equals(pass)) pass = props.getPersonal().getPassword();
                    testDbConnection(url, user, pass);
                }
                case "team-db" -> {
                    String url = buildJdbcUrl(req.get("host"), req.get("port"), req.get("database"));
                    String user = req.getOrDefault("username", "workmemory");
                    String pass = req.getOrDefault("password", "");
                    if (MASKED.equals(pass)) pass = props.getTeam().getPassword();
                    testDbConnection(url, user, pass);
                }
                case "openai" -> {
                    String apiKey = req.getOrDefault("apiKey", "");
                    if (MASKED.equals(apiKey)) apiKey = props.getAi().getOpenai().getApiKey();
                    String baseUrl = req.getOrDefault("baseUrl", "https://api.openai.com/v1");
                    testOpenAi(apiKey, baseUrl);
                }
                default -> {
                    return ResponseEntity.badRequest().body(Map.of("ok", false, "error", "Unknown test type: " + type));
                }
            }
            return ResponseEntity.ok(Map.of("ok", true));
        } catch (Exception e) {
            log.debug("Connection test failed ({}): {}", type, e.getMessage());
            return ResponseEntity.ok(Map.of("ok", false, "error", friendlyError(e)));
        }
    }

    // ------------------------------------------------------------------
    // POST /api/settings
    // ------------------------------------------------------------------

    @PostMapping
    public ResponseEntity<Map<String, Object>> saveSettings(@RequestBody Map<String, Object> req) {
        try {
            String env = buildEnvContent(req);
            writeEnvFile(env);
            log.info("Settings saved to .env — scheduling backend restart");
            scheduleRestart();
            return ResponseEntity.ok(Map.of("saved", true, "restarting", true));
        } catch (Exception e) {
            log.error("Failed to save settings: {}", e.getMessage(), e);
            return ResponseEntity.internalServerError()
                    .body(Map.of("saved", false, "error", e.getMessage()));
        }
    }

    @PostMapping("/restart")
    public ResponseEntity<Map<String, Object>> restartOnly() {
        log.info("Manual restart requested via /api/settings/restart");
        scheduleRestart();
        return ResponseEntity.ok(Map.of("restarting", true));
    }

    private void scheduleRestart() {
        Thread t = new Thread(() -> {
            try {
                // Wait long enough for the HTTP response to be fully delivered
                Thread.sleep(3000);
                restartBackend();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }, "settings-restart");
        t.setDaemon(true);
        t.start();
    }

    // ------------------------------------------------------------------
    // Internal helpers
    // ------------------------------------------------------------------

    private String buildEnvContent(Map<String, Object> req) {
        StringBuilder sb = new StringBuilder();
        sb.append("# WorkMemory AI configuration — managed by Settings UI\n");

        // Each line uses 'export' so variables are visible to backend subprocess launched by wm.sh

        // AI provider
        String aiProvider = str(req, "aiProvider", "local");
        sb.append("export WM_AI_PROVIDER=").append(aiProvider).append("\n");

        // OpenAI
        String apiKey = str(req, "openaiApiKey", "");
        if (!MASKED.equals(apiKey)) {
            sb.append("export OPENAI_API_KEY=").append(apiKey).append("\n");
        } else {
            String existing = props.getAi().getOpenai().getApiKey();
            sb.append("export OPENAI_API_KEY=").append(existing == null ? "" : existing).append("\n");
        }
        sb.append("export OPENAI_BASE_URL=").append(str(req, "openaiBaseUrl", "https://api.openai.com/v1")).append("\n");
        sb.append("export OPENAI_CHAT_MODEL=").append(str(req, "openaiChatModel", "gpt-4o-mini")).append("\n");
        sb.append("export OPENAI_EMBEDDING_MODEL=").append(str(req, "openaiEmbeddingModel", "text-embedding-3-small")).append("\n");

        // Personal DB
        String pHost = str(req, "personalHost", "localhost");
        String pPort = str(req, "personalPort", "5433");
        String pDb   = str(req, "personalDatabase", "workmemory");
        sb.append("export WM_PERSONAL_DB_URL=").append(buildJdbcUrl(pHost, pPort, pDb)).append("\n");
        sb.append("export WM_PERSONAL_DB_USER=").append(str(req, "personalUsername", "workmemory")).append("\n");
        String pPass = str(req, "personalPassword", "");
        if (MASKED.equals(pPass)) pPass = props.getPersonal().getPassword();
        sb.append("export WM_PERSONAL_DB_PASSWORD=").append(pPass).append("\n");

        // Team DB
        boolean teamEnabled = Boolean.TRUE.equals(req.get("teamEnabled"));
        sb.append("export WM_TEAM_ENABLED=").append(teamEnabled).append("\n");
        sb.append("export WM_TEAM_NAME=").append(str(req, "teamName", "")).append("\n");

        String tHost = str(req, "teamHost", "");
        String tPort = str(req, "teamPort", "5432");
        String tDb   = str(req, "teamDatabase", "workmemory");
        sb.append("export WM_TEAM_DB_URL=").append(tHost.isBlank() ? "" : buildJdbcUrl(tHost, tPort, tDb)).append("\n");
        sb.append("export WM_TEAM_DB_USER=").append(str(req, "teamUsername", "workmemory")).append("\n");
        String tPass = str(req, "teamPassword", "");
        if (MASKED.equals(tPass)) tPass = props.getTeam().getPassword() == null ? "" : props.getTeam().getPassword();
        sb.append("export WM_TEAM_DB_PASSWORD=").append(tPass).append("\n");

        return sb.toString();
    }

    private void writeEnvFile(String content) throws IOException {
        Path envFile = projectRoot.resolve(".env");
        Path tmpFile = projectRoot.resolve(".env.tmp");
        Path bakFile = projectRoot.resolve(".env.bak");

        // Backup existing
        if (Files.exists(envFile)) {
            Files.copy(envFile, bakFile, StandardCopyOption.REPLACE_EXISTING);
        }
        // Atomic write
        Files.writeString(tmpFile, content);
        Files.move(tmpFile, envFile, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        log.info("Wrote .env to {}", envFile);
    }

    private void restartBackend() {
        try {
            Path wmSh = projectRoot.resolve("wm.sh");
            if (!Files.exists(wmSh)) {
                log.warn("wm.sh not found at {} — cannot auto-restart", wmSh);
                return;
            }
            log.info("Triggering backend restart via wm.sh restart backend");
            // IMPORTANT: redirect output to a FILE (not a pipe).
            // If we use a pipe (default), bash gets SIGPIPE when this JVM is killed
            // and exits immediately — the restart never completes.
            File restartLog = new File("/tmp/wm-restart.log");
            new ProcessBuilder("bash", wmSh.toString(), "restart", "backend")
                    .directory(projectRoot.toFile())
                    .redirectOutput(restartLog)
                    .redirectErrorStream(true)
                    .start();
        } catch (IOException e) {
            log.error("Failed to trigger restart: {}", e.getMessage());
        }
    }

    private void testDbConnection(String jdbcUrl, String user, String pass) throws Exception {
        if (jdbcUrl == null || jdbcUrl.isBlank()) {
            throw new IllegalArgumentException("Host is required — please fill in the host field");
        }
        // Load driver explicitly (JDBC 4 auto-load may not work in all envs)
        try { Class.forName("org.postgresql.Driver"); } catch (ClassNotFoundException ignored) {}
        var conn = DriverManager.getConnection(jdbcUrl + "?connectTimeout=3&socketTimeout=3", user, pass);
        conn.close();
    }

    private void testOpenAi(String apiKey, String baseUrl) {
        if (apiKey == null || apiKey.isBlank()) throw new IllegalArgumentException("API key is empty");
        RestClient client = RestClient.builder()
                .baseUrl(baseUrl)
                .defaultHeader("Authorization", "Bearer " + apiKey)
                .build();
        // Call /models — lightweight, doesn't consume tokens
        client.get().uri("/models").retrieve().toBodilessEntity();
    }

    private String buildJdbcUrl(String host, String port, String database) {
        if (host == null || host.isBlank()) return "";
        String h = host.strip();
        String p = (port == null || port.isBlank()) ? "5432" : port.strip();
        String d = (database == null || database.isBlank()) ? "workmemory" : database.strip();
        return "jdbc:postgresql://" + h + ":" + p + "/" + d;
    }

    /** Parse a JDBC URL like jdbc:postgresql://host:port/db into map keys prefixed by prefix. */
    private Map<String, Object> parseJdbcUrl(String url, String prefix) {
        Map<String, Object> m = new LinkedHashMap<>();
        if (url == null || url.isBlank()) {
            m.put(prefix + "Host", "");
            m.put(prefix + "Port", prefix.equals("personal") ? "5433" : "5432");
            m.put(prefix + "Database", "workmemory");
            return m;
        }
        try {
            // jdbc:postgresql://host:port/dbname
            String stripped = url.replaceFirst("^jdbc:postgresql://", "");
            String[] parts = stripped.split("/", 2);
            String hostPort = parts[0];
            String db = parts.length > 1 ? parts[1].split("\\?")[0] : "workmemory";
            String[] hp = hostPort.split(":", 2);
            m.put(prefix + "Host", hp[0]);
            m.put(prefix + "Port", hp.length > 1 ? hp[1] : (prefix.equals("personal") ? "5433" : "5432"));
            m.put(prefix + "Database", db);
        } catch (Exception e) {
            m.put(prefix + "Host", "");
            m.put(prefix + "Port", prefix.equals("personal") ? "5433" : "5432");
            m.put(prefix + "Database", "workmemory");
        }
        return m;
    }

    private String str(Map<String, Object> m, String key, String def) {
        Object v = m.get(key);
        return (v instanceof String s) ? s : def;
    }

    private String friendlyError(Exception e) {
        String msg = e.getMessage();
        if (msg == null) return "Connection failed";
        if (msg.contains("Connection refused")) return "Connection refused — check host and port";
        if (msg.contains("authentication")) return "Authentication failed — check username and password";
        if (msg.contains("timeout")) return "Connection timed out — check host and firewall";
        if (msg.contains("does not exist")) return "Database not found — check database name";
        if (msg.contains("Unauthorized") || msg.contains("401")) return "Invalid API key";
        return msg.length() > 120 ? msg.substring(0, 120) + "…" : msg;
    }

    private Path resolveProjectRoot() {
        // When running via mvn spring-boot:run, cwd is backend/
        // When running as a fat JAR, cwd is wherever the jar is launched from
        Path cwd = Paths.get(System.getProperty("user.dir")).toAbsolutePath();
        // If cwd is backend/, go up one level
        if (cwd.endsWith("backend")) return cwd.getParent();
        // If wm.sh exists in cwd, we're already at root
        if (Files.exists(cwd.resolve("wm.sh"))) return cwd;
        // Try parent
        Path parent = cwd.getParent();
        if (parent != null && Files.exists(parent.resolve("wm.sh"))) return parent;
        return cwd;
    }
}
