package com.dociq.api;

import com.dociq.storage.entity.Document;
import com.dociq.storage.entity.User;
import com.dociq.storage.repository.DocumentRepository;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.stereotype.Service;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.reactive.function.client.WebClient;

import java.time.Duration;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
class GraphService {
    private final DocumentRepository documentRepository;
    private final WebClient.Builder webClientBuilder;
    private final JdbcTemplate jdbcTemplate;

    @Value("${app.python-ml.base-url}")
    private String pythonMlUrl;

    public JsonNode getOrBuildGraph(UUID docId, User user) {
        documentRepository.findByIdAndUser(docId, user)
                .orElseThrow(() -> new ResourceNotFoundException("Document not found: " + docId));

        // Return cached graph if exists
        var cached = jdbcTemplate.query(
                "SELECT graph_json::text FROM document_graphs WHERE doc_id = ?",
                (rs, i) -> rs.getString(1), docId);
        if (!cached.isEmpty()) {
            try {
                return new com.fasterxml.jackson.databind.ObjectMapper().readTree(cached.get(0));
            } catch (Exception e) {
                log.warn("Failed to parse cached graph for doc {}", docId);
            }
        }

        // Build new graph via Python
        JsonNode graph = webClientBuilder.build()
                .post()
                .uri(pythonMlUrl + "/internal/graph")
                .bodyValue(Map.of("doc_id", docId.toString()))
                .retrieve()
                .bodyToMono(JsonNode.class)
                .timeout(Duration.ofSeconds(90))
                .block();

        // Cache it
        if (graph != null) {
            jdbcTemplate.update(
                    "INSERT INTO document_graphs (doc_id, graph_json) VALUES (?, ?::jsonb) " +
                    "ON CONFLICT (doc_id) DO UPDATE SET graph_json = EXCLUDED.graph_json, created_at = NOW()",
                    docId, graph.toString());
        }
        return graph;
    }

    public void invalidateGraph(UUID docId) {
        jdbcTemplate.update("DELETE FROM document_graphs WHERE doc_id = ?", docId);
    }
}

@RestController
@RequestMapping("/api/documents")
@RequiredArgsConstructor
@Slf4j
public class GraphController {

    private final GraphService graphService;

    /**
     * GET /api/documents/{docId}/graph
     * Returns knowledge graph (nodes + edges) — cached after first build.
     */
    @GetMapping("/{docId}/graph")
    public ResponseEntity<JsonNode> getGraph(
            @PathVariable UUID docId,
            @AuthenticationPrincipal User user) {
        log.info("Graph request docId={} user={}", docId, user.getId());
        return ResponseEntity.ok(graphService.getOrBuildGraph(docId, user));
    }
}
