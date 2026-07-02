package com.dociq.kafka;

import com.dociq.websocket.DocumentStatusHandler;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Flux;

import java.util.Map;
import java.util.UUID;

/**
 * Bridges Python ML SSE stream → Java WebSocket (STOMP).
 *
 * On every doc.query Kafka event:
 *   1. Calls Python /internal/query with SSE streaming enabled
 *   2. Parses each SSE data line
 *   3. Forwards token/meta/done/error events over STOMP to the client
 *
 * This runs on the Spring reactive thread pool (non-blocking).
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class QueryStreamBridge {

    private final DocumentStatusHandler statusHandler;
    private final WebClient.Builder webClientBuilder;
    private final ObjectMapper objectMapper;

    @Value("${app.python-ml.base-url}")
    private String pythonMlUrl;

    @KafkaListener(
        topics = "${app.kafka.topics.query}",
        groupId = "${spring.kafka.consumer.group-id}-stream-bridge",
        containerFactory = "kafkaListenerContainerFactory"
    )
    public void handleQueryEvent(@Payload Map<String, Object> payload) {
        String queryIdStr = (String) payload.get("queryId");
        String docIdStr   = (String) payload.get("docId");
        String question   = (String) payload.get("question");

        if (queryIdStr == null || docIdStr == null || question == null) {
            log.warn("QueryStreamBridge: incomplete payload {}", payload);
            return;
        }

        UUID queryId = UUID.fromString(queryIdStr);

        Map<String, String> body = Map.of(
            "doc_id",   docIdStr,
            "question", question,
            "query_id", queryIdStr,
            "stream",   "true"
        );

        log.info("QueryStreamBridge: opening SSE stream queryId={}", queryId);

        webClientBuilder.build()
            .post()
            .uri(pythonMlUrl + "/internal/query")
            .bodyValue(body)
            .retrieve()
            .bodyToFlux(String.class)          // raw SSE lines
            .filter(line -> line.startsWith("data: "))
            .map(line -> line.substring(6).trim())
            .filter(data -> !data.isEmpty())
            .flatMap(data -> {
                try {
                    Map<String, Object> event = objectMapper.readValue(
                        data, new TypeReference<Map<String, Object>>() {});

                    // Forward every event (token, meta, done, faithfulness_fail,
                    // error) verbatim — python's SSE payloads already carry the
                    // exact { type, ... } shape the frontend's useQueryStream
                    // hook expects. Reshaping "token" events into a different
                    // key structure here (as this used to do via
                    // streamQueryToken) drops the `type` field the frontend
                    // switches on, so tokens silently never render.
                    statusHandler.streamQueryEvent(queryId, event);
                } catch (Exception e) {
                    log.warn("QueryStreamBridge: failed to parse SSE event: {}", data, e);
                }
                return Flux.empty();
            })
            .doOnError(err -> {
                log.error("QueryStreamBridge: SSE stream error queryId={}: {}", queryId, err.getMessage());
                // Must go to the same /stream destination the frontend is
                // actually subscribed to (sendQueryResult publishes to
                // /result, which nothing listens on) or the UI spins forever
                // instead of surfacing the error.
                statusHandler.streamQueryEvent(queryId, Map.of(
                    "type", "error",
                    "queryId", queryIdStr,
                    "message", err.getMessage() != null ? err.getMessage() : "Stream error"
                ));
            })
            .doOnComplete(() -> log.info("QueryStreamBridge: stream complete queryId={}", queryId))
            .subscribe();  // non-blocking; subscribe returns immediately
    }
}
