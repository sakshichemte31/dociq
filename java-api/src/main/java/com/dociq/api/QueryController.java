package com.dociq.api;

import com.dociq.kafka.DocIQProducer;
import com.dociq.kafka.QueryEvent;
import com.dociq.storage.entity.Document;
import com.dociq.storage.entity.Query;
import com.dociq.storage.entity.User;
import com.dociq.storage.repository.DocumentRepository;
import com.dociq.storage.repository.QueryRepository;
import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

// ── DTOs ──────────────────────────────────────────────────────

@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
class QueryRequest {
    @NotNull private UUID docId;
    @NotBlank private String question;
    @Builder.Default private boolean stream = true;
    // Optional: if the frontend already subscribed to
    // /topic/queries/{clientQueryId}/stream before calling this endpoint
    // (to avoid losing the SimpleBroker's fire-and-forget publish to a
    // subscriber that joins too late), it passes that id here so the
    // server uses it as the query's actual id instead of generating a
    // new one. Falls back to a server-generated id if omitted.
    private UUID clientQueryId;
}

@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
@JsonInclude(JsonInclude.Include.NON_NULL)
class QuerySubmittedResponse {
    private UUID queryId;
    private String status;
    private String wsEndpoint;
}

@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
@JsonInclude(JsonInclude.Include.NON_NULL)
class QueryHistoryItem {
    private UUID id;
    private String question;
    private String answer;
    private BigDecimal faithfulnessScore;
    private Integer latencyMs;
    private String status;
    private OffsetDateTime createdAt;
    private OffsetDateTime completedAt;

    public static QueryHistoryItem from(Query q) {
        return QueryHistoryItem.builder()
                .id(q.getId())
                .question(q.getQuestion())
                .answer(q.getAnswer())
                .faithfulnessScore(q.getFaithfulnessScore())
                .latencyMs(q.getLatencyMs())
                .status(q.getStatus())
                .createdAt(q.getCreatedAt())
                .completedAt(q.getCompletedAt())
                .build();
    }
}

// ── Service ───────────────────────────────────────────────────

@Service
@RequiredArgsConstructor
@Slf4j
class QueryService {

    private final QueryRepository queryRepository;
    private final DocumentRepository documentRepository;
    private final DocIQProducer producer;

    @Transactional
    public QuerySubmittedResponse submitQuery(QueryRequest request, User user) {
        Document doc = documentRepository.findByIdAndUser(request.getDocId(), user)
                .orElseThrow(() -> new ResourceNotFoundException("Document not found: " + request.getDocId()));

        if (doc.getStatus() != Document.Status.READY) {
            throw new IllegalStateException("Document is not ready for querying. Status: " + doc.getStatus());
        }

        // Prefer the client-supplied id (it already subscribed to
        // /topic/queries/{id}/stream before calling this endpoint, closing
        // the race against the Kafka-driven publish below). Guard against a
        // colliding id — astronomically unlikely with crypto.randomUUID(),
        // but a duplicate primary key must never silently overwrite an
        // existing query.
        UUID assignedId = request.getClientQueryId();
        if (assignedId != null && queryRepository.existsById(assignedId)) {
            log.warn("Client-supplied queryId {} already exists, generating a new one", assignedId);
            assignedId = null;
        }
        if (assignedId == null) {
            assignedId = UUID.randomUUID();
        }

        Query query = Query.builder()
                .id(assignedId)
                .user(user)
                .document(doc)
                .question(request.getQuestion())
                .status("PENDING")
                .build();

        queryRepository.save(query);
        log.info("Query {} created for doc={}", query.getId(), doc.getId());

        UUID queryId = query.getId();
        UUID docId = doc.getId();
        UUID userId = user.getId();
        String question = request.getQuestion();
        boolean stream = request.isStream();

        // Defer publish until after commit — python-ml's save_query_result is an
        // UPDATE keyed on queries.id, which would silently affect 0 rows if it
        // runs before this row is committed and visible to its connection.
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    producer.publishQueryEvent(QueryEvent.builder()
                            .queryId(queryId)
                            .docId(docId)
                            .userId(userId)
                            .question(question)
                            .stream(stream)
                            .build());
                }
            });
        } else {
            producer.publishQueryEvent(QueryEvent.builder()
                    .queryId(queryId)
                    .docId(docId)
                    .userId(userId)
                    .question(question)
                    .stream(stream)
                    .build());
        }

        return QuerySubmittedResponse.builder()
                .queryId(query.getId())
                .status("PENDING")
                .wsEndpoint("/topic/queries/" + query.getId() + "/stream")
                .build();
    }

    @Transactional(readOnly = true)
    public Page<QueryHistoryItem> getHistory(UUID docId, User user, int page, int size) {
        return queryRepository.findByUserAndDocument_IdOrderByCreatedAtDesc(user, docId, PageRequest.of(page, size))
                .map(QueryHistoryItem::from);
    }

    // Fallback for clients that missed the STOMP stream (e.g. subscribed
    // after the Kafka-driven bridge already finished publishing — the
    // SimpleBroker doesn't replay messages to late subscribers). The row
    // in Postgres is the source of truth regardless of whether the
    // WebSocket delivery succeeded.
    @Transactional(readOnly = true)
    public QueryHistoryItem getQuery(UUID queryId, User user) {
        Query query = queryRepository.findByIdAndUser(queryId, user)
                .orElseThrow(() -> new ResourceNotFoundException("Query not found: " + queryId));
        return QueryHistoryItem.from(query);
    }
}

// ── Controller ────────────────────────────────────────────────

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
@Slf4j
class QueryController {

    private final QueryService queryService;

    @PostMapping("/query")
    public ResponseEntity<QuerySubmittedResponse> submitQuery(
            @Valid @RequestBody QueryRequest request,
            @AuthenticationPrincipal User user) {
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(queryService.submitQuery(request, user));
    }

    @GetMapping("/queries/history")
    public ResponseEntity<Page<QueryHistoryItem>> getHistory(
            @RequestParam UUID docId,
            @AuthenticationPrincipal User user,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return ResponseEntity.ok(queryService.getHistory(docId, user, page, size));
    }

    // Fallback fetch for a single query. The frontend calls this if the
    // STOMP stream never delivers a "done" event within its timeout, since
    // the answer may already be fully persisted even though the WebSocket
    // message was lost (broker doesn't replay to late subscribers).
    @GetMapping("/queries/{queryId}")
    public ResponseEntity<QueryHistoryItem> getQuery(
            @PathVariable UUID queryId,
            @AuthenticationPrincipal User user) {
        return ResponseEntity.ok(queryService.getQuery(queryId, user));
    }
}
