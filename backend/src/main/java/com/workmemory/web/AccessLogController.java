package com.workmemory.web;

import com.workmemory.store.AccessLogRow;
import com.workmemory.store.StoreResolver;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api")
public class AccessLogController {

    private final StoreResolver stores;

    public AccessLogController(StoreResolver stores) {
        this.stores = stores;
    }

    @GetMapping("/access-log")
    public List<AccessLogRow> list() {
        return stores.personal().listAccessLog(50);
    }
}
