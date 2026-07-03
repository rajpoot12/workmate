package com.workmemory.web;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.Map;
import java.util.Set;

/**
 * Single source of truth for the UI theme ("dev" | "friendly").
 *
 * Set once from the web app's Config page — every surface (web app, browser
 * extension popup, in-page floater) reads from here so they always match,
 * without needing their own settings screen.
 *
 * GET  /api/theme  — read current theme (defaults to "dev")
 * POST /api/theme  — { "theme": "friendly" } — persists instantly, no restart needed
 */
@RestController
@RequestMapping("/api/theme")
public class ThemeController {

    private static final Logger log = LoggerFactory.getLogger(ThemeController.class);
    private static final Set<String> VALID = Set.of("dev", "friendly");
    private static final String DEFAULT_THEME = "dev";

    private final Path projectRoot;
    private final Path themeFile;

    public ThemeController() {
        this.projectRoot = resolveProjectRoot();
        this.themeFile = projectRoot.resolve(".wm-theme");
    }

    @GetMapping
    public Map<String, Object> getTheme() {
        return Map.of("theme", readTheme());
    }

    @PostMapping
    public Map<String, Object> setTheme(@RequestBody Map<String, String> req) {
        String theme = req.getOrDefault("theme", DEFAULT_THEME);
        if (!VALID.contains(theme)) theme = DEFAULT_THEME;
        writeTheme(theme);
        log.info("Theme changed to '{}'", theme);
        return Map.of("theme", theme, "saved", true);
    }

    private String readTheme() {
        try {
            if (Files.exists(themeFile)) {
                String v = Files.readString(themeFile).strip();
                if (VALID.contains(v)) return v;
            }
        } catch (IOException ignored) {
        }
        return DEFAULT_THEME;
    }

    private void writeTheme(String theme) {
        try {
            Path tmp = projectRoot.resolve(".wm-theme.tmp");
            Files.writeString(tmp, theme);
            Files.move(tmp, themeFile, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException e) {
            log.error("Failed to persist theme: {}", e.getMessage());
        }
    }

    private Path resolveProjectRoot() {
        Path cwd = Paths.get(System.getProperty("user.dir")).toAbsolutePath();
        if (cwd.endsWith("backend")) return cwd.getParent();
        if (Files.exists(cwd.resolve("wm.sh"))) return cwd;
        Path parent = cwd.getParent();
        if (parent != null && Files.exists(parent.resolve("wm.sh"))) return parent;
        return cwd;
    }
}
