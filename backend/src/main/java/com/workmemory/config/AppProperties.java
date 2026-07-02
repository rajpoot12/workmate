package com.workmemory.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.NestedConfigurationProperty;

@ConfigurationProperties(prefix = "workmemory")
public class AppProperties {

    @NestedConfigurationProperty
    private Ai ai = new Ai();
    @NestedConfigurationProperty
    private Rag rag = new Rag();
    @NestedConfigurationProperty
    private DbConfig personal = new DbConfig();
    @NestedConfigurationProperty
    private TeamDbConfig team = new TeamDbConfig();
    private boolean seed = false;

    public Ai getAi() { return ai; }
    public void setAi(Ai ai) { this.ai = ai; }
    public Rag getRag() { return rag; }
    public void setRag(Rag rag) { this.rag = rag; }
    public DbConfig getPersonal() { return personal; }
    public void setPersonal(DbConfig personal) { this.personal = personal; }
    public TeamDbConfig getTeam() { return team; }
    public void setTeam(TeamDbConfig team) { this.team = team; }
    public boolean isSeed() { return seed; }
    public void setSeed(boolean seed) { this.seed = seed; }

    public static class Ai {
        private String provider = "local";
        private int embeddingDimension = 1536;
        private OpenAi openai = new OpenAi();

        public String getProvider() { return provider; }
        public void setProvider(String p) { this.provider = p; }
        public int getEmbeddingDimension() { return embeddingDimension; }
        public void setEmbeddingDimension(int d) { this.embeddingDimension = d; }
        public OpenAi getOpenai() { return openai; }
        public void setOpenai(OpenAi o) { this.openai = o; }
    }

    public static class OpenAi {
        private String apiKey = "";
        private String baseUrl = "https://api.openai.com/v1";
        private String chatModel = "gpt-4o-mini";
        private String embeddingModel = "text-embedding-3-small";

        public String getApiKey() { return apiKey; }
        public void setApiKey(String k) { this.apiKey = k; }
        public String getBaseUrl() { return baseUrl; }
        public void setBaseUrl(String u) { this.baseUrl = u; }
        public String getChatModel() { return chatModel; }
        public void setChatModel(String m) { this.chatModel = m; }
        public String getEmbeddingModel() { return embeddingModel; }
        public void setEmbeddingModel(String m) { this.embeddingModel = m; }
    }

    public static class Rag {
        private int topK = 6;
        private double minConfidenceScore = 0.18;

        public int getTopK() { return topK; }
        public void setTopK(int k) { this.topK = k; }
        public double getMinConfidenceScore() { return minConfidenceScore; }
        public void setMinConfidenceScore(double s) { this.minConfidenceScore = s; }
    }

    public static class DbConfig {
        private String url = "jdbc:postgresql://127.0.0.1:5433/workmemory";
        private String username = "workmemory";
        private String password = "workmemory";

        public String getUrl() { return url; }
        public void setUrl(String u) { this.url = u; }
        public String getUsername() { return username; }
        public void setUsername(String u) { this.username = u; }
        public String getPassword() { return password; }
        public void setPassword(String p) { this.password = p; }
    }

    public static class TeamDbConfig extends DbConfig {
        private boolean enabled = false;
        private String name = "";

        public boolean isEnabled() { return enabled; }
        public void setEnabled(boolean e) { this.enabled = e; }
        public String getName() { return name; }
        public void setName(String n) { this.name = n; }
    }
}
