package com.dociq.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.SendResult;
import org.springframework.stereotype.Service;

import java.util.concurrent.CompletableFuture;

@Service
@RequiredArgsConstructor
@Slf4j
public class DocIQProducer {

    private final KafkaTemplate<String, Object> kafkaTemplate;

    @Value("${app.kafka.topics.ingestion}")
    private String ingestionTopic;

    @Value("${app.kafka.topics.query}")
    private String queryTopic;

    public CompletableFuture<SendResult<String, Object>> publishIngestionEvent(IngestionEvent event) {
        log.info("Publishing ingestion event docId={}", event.getDocId());
        return kafkaTemplate.send(ingestionTopic, event.getDocId().toString(), event)
                .whenComplete((result, ex) -> {
                    if (ex != null) {
                        log.error("Failed to publish ingestion event docId={}: {}", event.getDocId(), ex.getMessage());
                    } else {
                        log.debug("Ingestion event published docId={} partition={} offset={}",
                                event.getDocId(),
                                result.getRecordMetadata().partition(),
                                result.getRecordMetadata().offset());
                    }
                });
    }

    public CompletableFuture<SendResult<String, Object>> publishQueryEvent(QueryEvent event) {
        log.info("Publishing query event queryId={} docId={}", event.getQueryId(), event.getDocId());
        return kafkaTemplate.send(queryTopic, event.getQueryId().toString(), event)
                .whenComplete((result, ex) -> {
                    if (ex != null) {
                        log.error("Failed to publish query event queryId={}: {}", event.getQueryId(), ex.getMessage());
                    }
                });
    }
}
