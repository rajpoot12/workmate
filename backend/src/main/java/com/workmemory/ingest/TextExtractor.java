package com.workmemory.ingest;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * Extracts text from uploaded bytes. Covers the dev-centric formats from the
 * plan (PDF via PDFBox, DOCX via OOXML zip, and all text/code/markdown/json/yaml
 * natively). Apache Tika is the planned drop-in for the long tail of formats.
 */
@Component
public class TextExtractor {

    private static final Logger log = LoggerFactory.getLogger(TextExtractor.class);

    private static final Set<String> TEXT_EXT = Set.of(
            "txt", "md", "markdown", "rst", "log", "csv", "tsv", "json", "yaml", "yml",
            "xml", "html", "htm", "css", "scss", "properties", "env", "ini", "toml", "conf",
            "cfg", "sql", "sh", "bash", "zsh", "bat", "ps1", "java", "kt", "kts", "groovy",
            "gradle", "py", "rb", "go", "rs", "c", "h", "cpp", "hpp", "cc", "cs", "js", "jsx",
            "ts", "tsx", "vue", "php", "pl", "lua", "r", "scala", "swift", "dockerfile", "tf",
            "makefile", "gitignore");

    public record Extracted(String text, String detectedType) {}

    public Extracted extract(String filename, byte[] bytes) {
        String ext = extensionOf(filename);
        try {
            if ("pdf".equals(ext)) {
                return new Extracted(extractPdf(bytes), "pdf");
            }
            if ("docx".equals(ext)) {
                return new Extracted(extractDocx(bytes), "docx");
            }
            if (TEXT_EXT.contains(ext) || looksTextual(bytes)) {
                return new Extracted(new String(bytes, StandardCharsets.UTF_8), ext.isEmpty() ? "text" : ext);
            }
        } catch (Exception e) {
            log.warn("extraction failed for {}: {}", filename, e.toString());
        }
        return new Extracted("", ext.isEmpty() ? "binary" : ext);
    }

    public String extensionOf(String filename) {
        if (filename == null) return "";
        String name = filename;
        int slash = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'));
        if (slash >= 0) name = name.substring(slash + 1);
        if (name.equalsIgnoreCase("Dockerfile")) return "dockerfile";
        if (name.equalsIgnoreCase("Makefile")) return "makefile";
        int dot = name.lastIndexOf('.');
        return dot >= 0 ? name.substring(dot + 1).toLowerCase() : "";
    }

    private String extractPdf(byte[] bytes) throws Exception {
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            return new PDFTextStripper().getText(doc).strip();
        }
    }

    private String extractDocx(byte[] bytes) throws Exception {
        StringBuilder xml = new StringBuilder();
        try (ZipInputStream zis = new ZipInputStream(new ByteArrayInputStream(bytes))) {
            ZipEntry e;
            while ((e = zis.getNextEntry()) != null) {
                if ("word/document.xml".equals(e.getName())) {
                    byte[] buf = zis.readAllBytes();
                    xml.append(new String(buf, StandardCharsets.UTF_8));
                    break;
                }
            }
        }
        // Insert breaks for paragraph/line tags, then strip remaining tags.
        String withBreaks = xml.toString()
                .replaceAll("(?i)</w:p>", "\n")
                .replaceAll("(?i)<w:tab[^>]*/>", "\t")
                .replaceAll("(?i)<w:br[^>]*/>", "\n");
        return withBreaks.replaceAll("<[^>]+>", "").replaceAll("[ \\t]+\n", "\n").strip();
    }

    private boolean looksTextual(byte[] bytes) {
        int sample = Math.min(bytes.length, 1024);
        if (sample == 0) return false;
        int printable = 0;
        for (int i = 0; i < sample; i++) {
            int b = bytes[i] & 0xff;
            if (b == 9 || b == 10 || b == 13 || (b >= 32 && b < 127) || b >= 160) printable++;
        }
        return printable >= sample * 0.9;
    }
}
