package com.workmemory.seed;

import com.workmemory.config.AppProperties;
import com.workmemory.ingest.IngestService;
import com.workmemory.store.StoreResolver;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.List;

/** Seeds sample personal memories on first boot when WM_SEED=true. */
@Configuration
public class DataSeeder {

    private static final Logger log = LoggerFactory.getLogger(DataSeeder.class);

    @Bean
    ApplicationRunner seedRunner(IngestService ingest, StoreResolver stores, AppProperties props) {
        return args -> {
            if (!props.isSeed()) {
                log.info("Seed disabled (set WM_SEED=true to load demo data)");
                return;
            }
            if (!stores.personal().listMemories(null, null, null).isEmpty()) {
                log.info("Seed skipped: personal store already has memories");
                return;
            }
            log.info("Seeding demo personal memories...");

            seed("Staging Postgres connection string",
                    "Staging DB: host=db-staging.internal port=5432 db=orders user=app. "
                            + "Use the read replica for analytics. Rotate the password monthly.",
                    List.of("postgres", "staging"), ingest, stores);

            seed("Fix: Vite dev proxy CORS for the API",
                    "The web app got CORS errors hitting the Spring API from the Vite dev server. "
                            + "Fix was to add a server.proxy entry in vite.config.ts mapping /api to http://localhost:8080, "
                            + "and to allow chrome-extension origins on the backend CORS config.",
                    List.of("frontend", "vite", "cors"), ingest, stores);

            seed("Reset a Kafka consumer group offset",
                    "To reset offsets for a stuck consumer group: stop the consumers, then "
                            + "kafka-consumer-groups.sh --bootstrap-server localhost:9092 --group payments "
                            + "--reset-offsets --to-latest --execute --topic payment-events. Restart consumers afterwards.",
                    List.of("kafka", "runbook"), ingest, stores);

            seed("INC-219: Payment timeout root cause",
                    "INC-219: payment checkout was timing out during peak load. Root cause: the database "
                            + "connection pool was exhausted. HikariCP maximumPoolSize was 10 and requests queued. "
                            + "Fix: raised maximumPoolSize to 30, set connectionTimeout=2000ms, and added pool metrics. "
                            + "After the change p99 latency dropped from 4.2s to 380ms and timeouts went to zero.",
                    List.of("incident", "payments", "postgres"), ingest, stores);

            log.info("Seed complete");
        };
    }

    private void seed(String title, String text, List<String> tags,
                      IngestService ingest, StoreResolver stores) {
        IngestService.Spec s = new IngestService.Spec();
        s.title = title;
        s.sourceType = "note";
        s.rawText = text;
        s.redact = false;
        s.tags = tags;
        ingest.ingest(s, stores.personal());
    }
}
