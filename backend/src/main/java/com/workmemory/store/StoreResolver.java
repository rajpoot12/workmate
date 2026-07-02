package com.workmemory.store;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;

/**
 * Resolves which MemoryStore to use based on the requested scope.
 * Personal scope: local personal DB (always available).
 * Team scope: shared team server DB (may be disabled or offline).
 */
@Component
public class StoreResolver {

    private final MemoryStore personal;
    private final MemoryStore team;

    public StoreResolver(
            @Qualifier("personalStore") MemoryStore personal,
            @Qualifier("teamStore") MemoryStore team) {
        this.personal = personal;
        this.team = team;
    }

    public MemoryStore resolve(String scope) {
        if ("team".equalsIgnoreCase(scope) && !team.isDisabled()) return team;
        return personal;
    }

    public MemoryStore personal() { return personal; }
    public MemoryStore team() { return team; }
    public boolean teamEnabled() { return !team.isDisabled(); }
}
