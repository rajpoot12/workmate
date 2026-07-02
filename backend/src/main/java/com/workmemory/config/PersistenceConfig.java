package com.workmemory.config;

import com.workmemory.store.MemoryStore;
import com.zaxxer.hikari.HikariDataSource;
import org.flywaydb.core.Flyway;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;

import javax.sql.DataSource;

@Configuration
@EnableTransactionManagement
public class PersistenceConfig {

    private static final Logger log = LoggerFactory.getLogger(PersistenceConfig.class);

    @Bean(name = "personalDataSource")
    @Primary
    public DataSource personalDataSource(AppProperties props) {
        HikariDataSource ds = new HikariDataSource();
        ds.setJdbcUrl(props.getPersonal().getUrl());
        ds.setUsername(props.getPersonal().getUsername());
        ds.setPassword(props.getPersonal().getPassword());
        ds.setPoolName("personal");
        ds.setMaximumPoolSize(10);
        return ds;
    }

    @Bean(name = "personalJdbc")
    @Primary
    public JdbcTemplate personalJdbc(@Qualifier("personalDataSource") DataSource ds) {
        return new JdbcTemplate(ds);
    }

    @Bean
    @Primary
    public PlatformTransactionManager transactionManager(@Qualifier("personalDataSource") DataSource ds) {
        return new DataSourceTransactionManager(ds);
    }

    @Bean(name = "personalStore")
    @Primary
    public MemoryStore personalStore(@Qualifier("personalJdbc") JdbcTemplate jdbc) {
        return new MemoryStore(jdbc, "personal", true);
    }

    @Bean(name = "teamStore")
    public MemoryStore teamStore(AppProperties props) {
        AppProperties.TeamDbConfig cfg = props.getTeam();
        if (!cfg.isEnabled() || cfg.getUrl() == null || cfg.getUrl().isBlank()) {
            log.info("Team DB disabled (WM_TEAM_ENABLED not set)");
            return MemoryStore.disabled();
        }
        try {
            HikariDataSource ds = new HikariDataSource();
            ds.setJdbcUrl(cfg.getUrl());
            ds.setUsername(cfg.getUsername());
            ds.setPassword(cfg.getPassword());
            ds.setPoolName("team");
            ds.setMaximumPoolSize(5);
            ds.setConnectionTimeout(5000);
            ds.setInitializationFailTimeout(-1); // Don't fail on startup if server offline
            JdbcTemplate jdbc = new JdbcTemplate(ds);
            log.info("Team DB configured: {}", cfg.getUrl());
            return new MemoryStore(jdbc, "team", false);
        } catch (Exception e) {
            log.warn("Team DB setup failed (will show as offline): {}", e.getMessage());
            return MemoryStore.disabled();
        }
    }

    @Bean
    public ApplicationRunner runMigrations(@Qualifier("personalDataSource") DataSource personal,
                                           AppProperties props) {
        return args -> {
            log.info("Running Flyway migration on personal DB...");
            Flyway.configure()
                    .dataSource(personal)
                    .locations("classpath:db/migration")
                    .load()
                    .migrate();

            AppProperties.TeamDbConfig team = props.getTeam();
            if (team.isEnabled() && team.getUrl() != null && !team.getUrl().isBlank()) {
                try {
                    log.info("Running Flyway migration on team DB...");
                    HikariDataSource ds = new HikariDataSource();
                    ds.setJdbcUrl(team.getUrl());
                    ds.setUsername(team.getUsername());
                    ds.setPassword(team.getPassword());
                    ds.setConnectionTimeout(5000);
                    ds.setMaximumPoolSize(2);
                    Flyway.configure()
                            .dataSource(ds)
                            .locations("classpath:db/migration")
                            .load()
                            .migrate();
                    ds.close();
                    log.info("Team DB migration complete");
                } catch (Exception e) {
                    log.warn("Team DB migration failed (team features will be unavailable): {}", e.getMessage());
                }
            }
        };
    }
}
