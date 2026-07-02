package com.workmemory.ingest;

import com.workmemory.store.FileIndexRow;
import com.workmemory.store.MemoryStore;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributes;
import java.time.Instant;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

/** Indexes a directory tree for locate/find (names + metadata; optional content). */
@Service
public class ScanService {

    private static final Logger log = LoggerFactory.getLogger(ScanService.class);
    private static final int MAX_FILES = 8000;
    private static final long MAX_CONTENT_BYTES = 256 * 1024;
    private static final Set<String> SKIP_DIRS = Set.of(
            ".git", "node_modules", "target", "build", "dist", ".gradle", ".idea",
            ".venv", "venv", "__pycache__", ".m2", ".pgdata", ".tools");
    private static final Set<String> SCRIPT_EXT = Set.of("sh", "bash", "zsh", "ps1", "bat", "sql");

    private final TextExtractor extractor;
    private final IngestService ingestService;

    public ScanService(TextExtractor extractor, IngestService ingestService) {
        this.extractor = extractor;
        this.ingestService = ingestService;
    }

    public record ScanResult(String rootDir, int filesIndexed, int contentIndexed, boolean exists) {}

    public ScanResult scan(String rootDirRaw, boolean indexContent, MemoryStore target) {
        Path root = Paths.get(rootDirRaw).toAbsolutePath().normalize();
        if (!Files.isDirectory(root)) {
            return new ScanResult(root.toString(), 0, 0, false);
        }
        target.deleteFilesByRoot(root.toString());

        AtomicInteger files = new AtomicInteger();
        AtomicInteger contentCount = new AtomicInteger();
        try {
            Files.walkFileTree(root, new SimpleFileVisitor<>() {
                @Override
                public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attrs) {
                    String n = dir.getFileName() == null ? "" : dir.getFileName().toString();
                    if (!dir.equals(root) && (n.startsWith(".") || SKIP_DIRS.contains(n))) {
                        return FileVisitResult.SKIP_SUBTREE;
                    }
                    return FileVisitResult.CONTINUE;
                }

                @Override
                public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
                    if (files.get() >= MAX_FILES) return FileVisitResult.TERMINATE;
                    try {
                        indexFile(root, file, attrs, indexContent, contentCount, target);
                        files.incrementAndGet();
                    } catch (Exception e) {
                        log.debug("skip {}: {}", file, e.toString());
                    }
                    return FileVisitResult.CONTINUE;
                }

                @Override
                public FileVisitResult visitFileFailed(Path file, IOException exc) {
                    return FileVisitResult.CONTINUE;
                }
            });
        } catch (IOException e) {
            log.warn("scan failed for {}: {}", root, e.toString());
        }
        return new ScanResult(root.toString(), files.get(), contentCount.get(), true);
    }

    private void indexFile(Path root, Path file, BasicFileAttributes attrs,
                           boolean indexContent, AtomicInteger contentCount, MemoryStore target) throws IOException {
        String name = file.getFileName().toString();
        String ext = extractor.extensionOf(name);
        boolean prodDanger = false;

        if (SCRIPT_EXT.contains(ext) && attrs.size() <= MAX_CONTENT_BYTES) {
            String content = new String(Files.readAllBytes(file), StandardCharsets.UTF_8);
            prodDanger = ProdDanger.isDangerous(content);
        }

        boolean didIndex = false;
        if (indexContent && attrs.size() <= MAX_CONTENT_BYTES) {
            byte[] bytes = Files.readAllBytes(file);
            TextExtractor.Extracted ex = extractor.extract(name, bytes);
            if (ex.text() != null && !ex.text().isBlank()) {
                IngestService.Spec spec = new IngestService.Spec();
                spec.title = name;
                spec.sourceType = SCRIPT_EXT.contains(ext) ? "script" : "file";
                spec.sourceUri = file.toString();
                spec.rawText = ex.text();
                spec.redact = false;
                ingestService.ingest(spec, target);
                didIndex = true;
                contentCount.incrementAndGet();
            }
        }

        FileIndexRow fi = new FileIndexRow(
                UUID.randomUUID(), root.toString(), file.toString(), name,
                ext.isEmpty() ? null : ext, attrs.size(),
                attrs.lastModifiedTime().toInstant(), didIndex, prodDanger, Instant.now());
        target.saveFileIndex(fi);
    }
}
