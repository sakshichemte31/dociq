package com.dociq.kafka;

import com.dociq.storage.entity.Query;
import com.dociq.storage.repository.QueryRepository;
import com.dociq.websocket.DocumentStatusHandler;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Component
@RequiredArgsConstructor
@Slf4j
public class QueryResultConsumer {

    private final QueryRepository queryRepository;
    private final DocumentStatusHandler statusHandler;
    private final ObjectMapper objectMapper;

    @KafkaListener(topics = "${app.kafka.topics.status}", groupId = "${spring.kafka.consumer.group-id}-query")
    public void handleStatusOrQueryResult(@Payload Map<String, Object> payload) {
        String type = (String) payload.get("type");

        if ("query_complete".equals(type)) {
            handleQueryComplete(payload);
        } else if ("query_error".equals(type)) {
            handleQueryError(payload);
        }
        // document status events handled by DocIQConsumer
    }

    private void handleQueryComplete(Map<String, Object> payload) {
        String queryIdStr = (String) payload.get("queryId");
        if (queryIdStr == null) return;

        try {
            UUID queryId = UUID.fromString(queryIdStr);
            queryRepository.findById(queryId).ifPresent(query -> {
                query.setAnswer((String) payload.get("answer"));
                query.setStatus("COMPLETED");
                query.setCompletedAt(OffsetDateTime.now());

                if (payload.get("faithfulnessScore") instanceof Number n) {
                    query.setFaithfulnessScore(BigDecimal.valueOf(n.doubleValue()));
                }
                if (payload.get("latencyMs") instanceof Number n) {
                    query.setLatencyMs(n.intValue());
                }
                if (payload.get("rewrittenQueries") instanceof List<?> rq) {
                    query.setRewrittenQueries(rq.stream().map(Object::toString).toArray(String[]::new));
                }
                if (payload.get("retrievedChunks") != null) {
                    query.setRetrievedChunks(payload.get("retrievedChunks"));
                }

                queryRepository.save(query);
                log.info("Query {} completed, faithfulness={}", queryId, query.getFaithfulnessScore());

                // Must match the useQueryStream contract: /stream destination
                // (not /result, which the frontend never subscribes to) and a
                // "type" field to switch on, with the same snake_case score/
                // latency keys python's own SSE "done" event uses.
                statusHandler.streamQueryEvent(queryId, Map.of(
                        "type", "done",
                        "queryId", queryId.toString(),
                        "full_answer", payload.getOrDefault("answer", ""),
                        "faithfulness_score", payload.getOrDefault("faithfulnessScore", 0.0),
                        "latency_ms", payload.getOrDefault("latencyMs", 0),
                        "retrievedChunks", payload.getOrDefault("retrievedChunks", List.of()),
                        "rewrittenQueries", payload.getOrDefault("rewrittenQueries", List.of())
                ));
            });
        } catch (Exception e) {
            log.error("Failed to handle query_complete: {}", e.getMessage(), e);
        }
    }

    private void handleQueryError(Map<String, Object> payload) {
        String queryIdStr = (String) payload.get("queryId");
        if (queryIdStr == null) return;
        try {
            UUID queryId = UUID.fromString(queryIdStr);
            queryRepository.findById(queryId).ifPresent(query -> {
                query.setStatus("FAILED");
                query.setErrorMessage((String) payload.get("error"));
                query.setCompletedAt(OffsetDateTime.now());
                queryRepository.save(query);
            });
            statusHandler.streamQueryEvent(queryId, Map.of(
                    "type", "error",
                    "queryId", queryIdStr,
                    "message", payload.getOrDefault("error", "Unknown error")
            ));
        } catch (Exception e) {
            log.error("Failed to handle query_error: {}", e.getMessage(), e);
        }
    }
}
