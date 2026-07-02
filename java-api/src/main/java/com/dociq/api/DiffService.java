package com.dociq.api;

import com.dociq.storage.entity.User;
import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.time.Duration;
import java.util.List;
import java.util.UUID;

// ── DTOs ──────────────────────────────────────────────────────

@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
class DiffRequest {
    private UUID docId1;
    private UUID docId2;
}

@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
@JsonInclude(JsonInclude.Include.NON_NULL)
class DiffResponse {
    private UUID docId1;
    private UUID docId2;
    private List<DiffSection> sections;
    private int totalChanges;
}

@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
@JsonInclude(JsonInclude.Include.NON_NULL)
class DiffSection {
    private String section;
    private String changeType;   // ADDED | REMOVED | MODIFIED | UNCHANGED
    private String oldSummary;
    private String newSummary;
    private double similarity;
}

// ── Service ───────────────────────────────────────────────────

@Service
@RequiredArgsConstructor
@Slf4j
class DiffService {

    private final WebClient.Builder webClientBuilder;

    @Value("${app.python-ml.base-url}")
    private String pythonMlBaseUrl;

    public DiffResponse diff(DiffRequest request, User user) {
        log.info("Computing semantic diff: docId1={}, docId2={}", request.getDocId1(), request.getDocId2());

        var internalRequest = new java.util.HashMap<String, String>();
        internalRequest.put("doc_id_1", request.getDocId1().toString());
        internalRequest.put("doc_id_2", request.getDocId2().toString());
        internalRequest.put("user_id", user.getId().toString());

        DiffResponse response = webClientBuilder.build()
                .post()
                .uri(pythonMlBaseUrl + "/internal/diff")
                .bodyValue(internalRequest)
                .retrieve()
                .bodyToMono(DiffResponse.class)
                .timeout(Duration.ofSeconds(120))
                .block();

        if (response != null) {
            response.setDocId1(request.getDocId1());
            response.setDocId2(request.getDocId2());
        }

        return response;
    }
}
