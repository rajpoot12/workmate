package com.workmemory.ai;

import com.workmemory.config.AppProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class AiConfig {

    private static final Logger log = LoggerFactory.getLogger(AiConfig.class);

    @Bean
    public AiProvider aiProvider(AppProperties props) {
        AppProperties.Ai cfg = props.getAi();
        String provider = cfg.getProvider();
        if ("openai".equalsIgnoreCase(provider)) {
            if (cfg.getOpenai().getApiKey() == null || cfg.getOpenai().getApiKey().isBlank()) {
                log.warn("ai.provider=openai but no OPENAI_API_KEY set; falling back to local provider");
                return new LocalAiProvider(cfg.getEmbeddingDimension());
            }
            log.info("Using OpenAI provider ({} / {})", cfg.getOpenai().getChatModel(),
                    cfg.getOpenai().getEmbeddingModel());
            return new OpenAiProvider(cfg);
        }
        log.info("Using local deterministic AI provider (dim={})", cfg.getEmbeddingDimension());
        return new LocalAiProvider(cfg.getEmbeddingDimension());
    }
}
