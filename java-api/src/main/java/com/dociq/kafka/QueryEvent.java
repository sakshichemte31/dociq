package com.dociq.kafka;

import lombok.*;
import java.util.UUID;

@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class QueryEvent {
    private UUID queryId;
    private UUID docId;
    private UUID userId;
    private String question;
    private boolean stream;
}
