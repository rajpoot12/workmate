package com.workmemory.web;

import com.workmemory.search.AskService;
import com.workmemory.search.dto.AskResponse;
import com.workmemory.web.dto.Requests;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class AskController {

    private final AskService ask;

    public AskController(AskService ask) {
        this.ask = ask;
    }

    @PostMapping("/ask")
    public AskResponse ask(
            @RequestHeader(value = "X-Scope", defaultValue = "personal") String scope,
            @RequestHeader(value = "X-Team", required = false) String teamName,
            @RequestBody Requests.AskRequest req) {
        return ask.ask(req.query(), teamName, scope);
    }
}
