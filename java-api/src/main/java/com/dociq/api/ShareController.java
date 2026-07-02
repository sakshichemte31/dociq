package com.dociq.api;

import com.dociq.storage.entity.Query;
import com.dociq.storage.entity.User;
import com.dociq.storage.repository.QueryRepository;
import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
@JsonInclude(JsonInclude.Include.NON_NULL)
class ShareResponse {
    private String shareToken;
    private String shareUrl;
    private String queryId;
}

@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
@JsonInclude(JsonInclude.Include.NON_NULL)
class SharedSessionResponse {
    private String queryId;
    private String question;
    private String answer;
    private Double faithfulnessScore;
    private Long latencyMs;
    private String createdAt;
    private List<String> rewrittenQueries;
    private String documentName;
    private Integer pageCount;
}

@RestController
@RequiredArgsConstructor
@Slf4j
public class ShareController {

    private final QueryRepository queryRepository;
    private final JdbcTemplate jdbcTemplate;

    /**
     * POST /api/queries/{queryId}/share
     * Generates a public share link for a completed chat answer.
     */
    @PostMapping("/api/queries/{queryId}/share")
    public ResponseEntity<ShareResponse> shareQuery(
            @PathVariable UUID queryId,
            @AuthenticationPrincipal User user) {

        Query query = queryRepository.findByIdAndUser(queryId, user)
                .orElseThrow(() -> new ResourceNotFoundException("Query not found: " + queryId));

        // Generate or reuse share token
        UUID shareToken = UUID.randomUUID();
        jdbcTemplate.update(
                "UPDATE queries SET share_token = ?, is_public = true WHERE id = ?",
                shareToken, queryId);

        String shareUrl = "/share/" + shareToken;
        log.info("Share link created queryId={} token={}", queryId, shareToken);

        return ResponseEntity.ok(ShareResponse.builder()
                .shareToken(shareToken.toString())
                .shareUrl(shareUrl)
                .queryId(queryId.toString())
                .build());
    }

    /**
     * GET /share/{token}
     * Public endpoint — no authentication required.
     * Returns the shared Q&A session for display.
     */
    @GetMapping("/share/{token}")
    public ResponseEntity<SharedSessionResponse> getSharedSession(@PathVariable UUID token) {
        var rows = jdbcTemplate.query("""
            SELECT q.id, q.question, q.answer, q.faithfulness_score,
                   q.latency_ms, q.created_at, q.rewritten_queries,
                   d.original_filename, d.page_count
            FROM queries q
            JOIN documents d ON q.doc_id = d.id
            WHERE q.share_token = ? AND q.is_public = true
            """,
                (rs, i) -> SharedSessionResponse.builder()
                        .queryId(rs.getString("id"))
                        .question(rs.getString("question"))
                        .answer(rs.getString("answer"))
                        .faithfulnessScore(rs.getObject("faithfulness_score", Double.class))
                        .latencyMs(rs.getObject("latency_ms", Long.class))
                        .createdAt(rs.getString("created_at"))
                        .documentName(rs.getString("original_filename"))
                        .pageCount(rs.getObject("page_count", Integer.class))
                        .build(),
                token);

        if (rows.isEmpty()) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(rows.get(0));
    }
}
