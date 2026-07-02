package com.dociq.websocket;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Component
@RequiredArgsConstructor
@Slf4j
public class DocumentStatusHandler {

    private final SimpMessagingTemplate messagingTemplate;

    /**
     * Broadcast document processing status to subscribers on /topic/documents/{docId}/status
     */
    public void broadcastStatus(UUID docId, String status, String message) {
        var payload = Map.of(
                "docId", docId.toString(),
                "status", status,
                "message", message != null ? message : "",
                "timestamp", Instant.now().toEpochMilli()
        );

        String destination = "/topic/documents/" + docId + "/status";
        messagingTemplate.convertAndSend(destination, payload);
        log.debug("Status broadcast → {}: {}", destination, status);
    }

    /**
     * Stream query answer tokens to a specific query subscriber
     */
    public void streamQueryToken(UUID queryId, String token, boolean done) {
        var payload = Map.of(
                "queryId", queryId.toString(),
                "token", token != null ? token : "",
                "done", done,
                "timestamp", Instant.now().toEpochMilli()
        );

        String destination = "/topic/queries/" + queryId + "/stream";
        messagingTemplate.convertAndSend(destination, payload);
    }

    /**
     * Send any structured event (meta, done, error, faithfulness_fail) to the query stream
     */
    public void streamQueryEvent(UUID queryId, Object event) {
        String destination = "/topic/queries/" + queryId + "/stream";
        messagingTemplate.convertAndSend(destination, event);
    }

    /**
     * Send full query result once complete (used by QueryResultConsumer for final persistence ack)
     */
    public void sendQueryResult(UUID queryId, Object result) {
        String destination = "/topic/queries/" + queryId + "/result";
        messagingTemplate.convertAndSend(destination, result);
    }
}
