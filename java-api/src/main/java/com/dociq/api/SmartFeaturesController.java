package com.dociq.api;

import com.dociq.storage.entity.Document;
import com.dociq.storage.entity.User;
import com.dociq.storage.repository.DocumentRepository;
import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.stereotype.Service;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import reactor.core.publisher.Mono;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;

// ── DTOs ──────────────────────────────────────────────────────

@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
@JsonInclude(JsonInclude.Include.NON_NULL)
class DocumentSummary {
    private String title;
    private String executiveSummary;
    private List<String> keyTopics;
    private String documentType;
    private Integer estimatedReadingTimeMinutes;
    private List<String> suggestedQuestions;
    private String complexityLevel;
    private String language;
}

@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
class MultiDocQueryRequest {
    private List<UUID> docIds;
    private String question;
}

// ── Service ───────────────────────────────────────────────────

@Service
@RequiredArgsConstructor
@Slf4j
class SmartFeaturesService {

    private final DocumentRepository documentRepository;
    private final WebClient.Builder webClientBuilder;

    @Value("${app.python-ml.base-url}")
    private String pythonMlUrl;

    public Map<String, Object> getDocumentSummary(UUID docId, User user) {
        documentRepository.findByIdAndUser(docId, user)
                .orElseThrow(() -> new ResourceNotFoundException("Document not found: " + docId));

        Map<String, Object> payload = Map.of("doc_id", docId.toString(), "user_id", user.getId().toString());

        return webClientBuilder.build().post()
                .uri(pythonMlUrl + "/internal/summary")
                .bodyValue(payload)
                .retrieve()
                .bodyToMono(Map.class)
                .timeout(Duration.ofSeconds(60))
                .block();
    }

    public Map<String, Object> multiDocQuery(List<UUID> docIds, String question, User user) {
        // Verify all docs belong to user
        for (UUID docId : docIds) {
            documentRepository.findByIdAndUser(docId, user)
                    .orElseThrow(() -> new ResourceNotFoundException("Document not found: " + docId));
        }

        UUID queryId = UUID.randomUUID();
        List<String> docIdStrings = docIds.stream().map(UUID::toString).toList();

        Map<String, Object> payload = Map.of(
                "doc_ids", docIdStrings,
                "question", question,
                "query_id", queryId.toString()
        );

        return webClientBuilder.build().post()
                .uri(pythonMlUrl + "/internal/multi-query")
                .bodyValue(payload)
                .retrieve()
                .bodyToMono(Map.class)
                .timeout(Duration.ofSeconds(120))
                .block();
    }
}

// ── Controller ────────────────────────────────────────────────

@RestController
@RequestMapping("/api/smart")
@RequiredArgsConstructor
@Slf4j
public class SmartFeaturesController {

    private final SmartFeaturesService smartFeaturesService;

    /**
     * GET /api/smart/summary/{docId}
     * Returns AI-generated summary, key topics, and suggested questions.
     */
    @GetMapping("/summary/{docId}")
    public ResponseEntity<Map<String, Object>> getSummary(
            @PathVariable UUID docId,
            @AuthenticationPrincipal User user) {
        log.info("Summary request docId={} user={}", docId, user.getId());
        return ResponseEntity.ok(smartFeaturesService.getDocumentSummary(docId, user));
    }

    /**
     * POST /api/smart/multi-query
     * Answer a question across multiple documents simultaneously.
     */
    @PostMapping("/multi-query")
    public ResponseEntity<Map<String, Object>> multiDocQuery(
            @RequestBody MultiDocQueryRequest request,
            @AuthenticationPrincipal User user) {
        log.info("Multi-doc query user={} docs={} question='{}'",
                user.getId(), request.getDocIds().size(), request.getQuestion());
        return ResponseEntity.ok(
                smartFeaturesService.multiDocQuery(request.getDocIds(), request.getQuestion(), user)
        );
    }
}
