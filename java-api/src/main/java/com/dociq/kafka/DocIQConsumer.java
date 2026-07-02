package com.dociq.kafka;

import com.dociq.storage.entity.Document;
import com.dociq.storage.repository.DocumentRepository;
import com.dociq.websocket.DocumentStatusHandler;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.UUID;

@Component
@RequiredArgsConstructor
@Slf4j
public class DocIQConsumer {

    private final DocumentRepository documentRepository;
    private final DocumentStatusHandler statusHandler;

    /** Listens for document processing status events from Python ML */
    @KafkaListener(
        topics = "${app.kafka.topics.status}",
        groupId = "${spring.kafka.consumer.group-id}",
        containerFactory = "kafkaListenerContainerFactory"
    )
    public void handleStatusUpdate(@Payload Map<String, Object> payload) {
        // Ignore query events — handled by QueryResultConsumer
        String type = (String) payload.get("type");
        if (type != null && (type.startsWith("query_"))) return;

        String docIdStr  = (String) payload.get("docId");
        String status    = (String) payload.get("status");
        String message   = (String) payload.get("message");
        Integer pageCount = payload.get("pageCount") instanceof Number n ? n.intValue() : null;

        if (docIdStr == null || status == null) return;

        log.info("Received status update: docId={}, status={}", docIdStr, status);

        try {
            UUID docId = UUID.fromString(docIdStr);
            documentRepository.findById(docId).ifPresentOrElse(
                doc -> {
                    doc.setStatus(Document.Status.valueOf(status));
                    if (pageCount != null)     doc.setPageCount(pageCount);
                    if ("FAILED".equals(status) && message != null) doc.setErrorMessage(message);
                    documentRepository.save(doc);
                    statusHandler.broadcastStatus(docId, status, message);
                    log.info("Document {} → {}", docId, status);
                },
                () -> log.warn("Status update for unknown docId={}", docIdStr)
            );
        } catch (Exception e) {
            log.error("Error processing status update: {}", e.getMessage(), e);
        }
    }
}
