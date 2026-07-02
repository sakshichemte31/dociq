package com.dociq.api;

import com.dociq.storage.entity.User;
import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;

@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
@JsonInclude(JsonInclude.Include.NON_NULL)
class AnalyticsSummaryItem {
    private String date;
    private Double avgFaithfulness;
    private Long p50Latency;
    private Long p95Latency;
    private Long queryCount;
}

@Service
@Slf4j
class AnalyticsService {

    @PersistenceContext
    private EntityManager em;

    @Transactional(readOnly = true)
    @SuppressWarnings("unchecked")
    public List<AnalyticsSummaryItem> getDailySummary(User user, int days) {
        OffsetDateTime since = OffsetDateTime.now(ZoneOffset.UTC).minusDays(days);

        // Use native SQL for percentile functions not supported in JPQL
        List<Object[]> rows = em.createNativeQuery("""
                SELECT
                    DATE(q.created_at) AS day,
                    AVG(q.faithfulness_score),
                    COUNT(*),
                    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY q.latency_ms),
                    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY q.latency_ms)
                FROM queries q
                WHERE q.user_id = :userId
                  AND q.created_at >= :since
                  AND q.status = 'COMPLETED'
                  AND q.faithfulness_score IS NOT NULL
                GROUP BY DATE(q.created_at)
                ORDER BY DATE(q.created_at)
                """)
                .setParameter("userId", user.getId())
                .setParameter("since", since)
                .getResultList();

        List<AnalyticsSummaryItem> result = new ArrayList<>();
        for (Object[] row : rows) {
            result.add(AnalyticsSummaryItem.builder()
                    .date(row[0] != null ? row[0].toString() : null)
                    .avgFaithfulness(row[1] != null ? ((Number) row[1]).doubleValue() : null)
                    .queryCount(row[2] != null ? ((Number) row[2]).longValue() : 0L)
                    .p50Latency(row[3] != null ? ((Number) row[3]).longValue() : null)
                    .p95Latency(row[4] != null ? ((Number) row[4]).longValue() : null)
                    .build());
        }
        return result;
    }
}

@RestController
@RequestMapping("/api/analytics")
@RequiredArgsConstructor
@Slf4j
public class AnalyticsController {

    private final AnalyticsService analyticsService;

    @GetMapping("/summary")
    public ResponseEntity<List<AnalyticsSummaryItem>> getSummary(
            @AuthenticationPrincipal User user) {
        return ResponseEntity.ok(analyticsService.getDailySummary(user, 14));
    }
}
