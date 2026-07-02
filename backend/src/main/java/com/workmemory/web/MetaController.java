package com.workmemory.web;

import com.workmemory.ai.AiProvider;
import com.workmemory.config.AppProperties;
import com.workmemory.store.StoreResolver;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class MetaController {

    private final AppProperties props;
    private final StoreResolver stores;
    private final AiProvider ai;

    public MetaController(AppProperties props, StoreResolver stores, AiProvider ai) {
        this.props = props;
        this.stores = stores;
        this.ai = ai;
    }

    @GetMapping("/health")
    public Map<String, Object> health() {
        Map<String, Object> m = new HashMap<>();
        m.put("status", "ok");
        m.put("aiProvider", props.getAi().getProvider());
        m.put("service", "workmemory");
        m.put("personal", stores.personal().ping() ? "up" : "down");
        m.put("teamEnabled", stores.teamEnabled());
        if (stores.teamEnabled()) {
            m.put("team", stores.team().ping() ? "up" : "offline");
            m.put("teamName", props.getTeam().getName());
        }
        return m;
    }

    @GetMapping("/tags")
    public List<String> tags(
            @RequestHeader(value = "X-Scope", defaultValue = "personal") String scope) {
        return stores.resolve(scope).tags();
    }

    @PostMapping("/tags/suggest")
    public Map<String, Object> suggestTags(@RequestBody Map<String, String> req) {
        String title = req.getOrDefault("title", "");
        String text  = req.getOrDefault("text", "");
        List<String> suggested = ai.suggestTags(title, text);
        return Map.of("tags", suggested);
    }
}
