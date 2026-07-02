package com.workmemory;

import com.workmemory.config.AppProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@SpringBootApplication
@EnableConfigurationProperties(AppProperties.class)
public class WorkMemoryApplication {
    public static void main(String[] args) {
        SpringApplication.run(WorkMemoryApplication.class, args);
    }
}
