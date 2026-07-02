package com.dociq.kafka;

import lombok.*;
import java.util.UUID;

@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
class StatusEvent {
    private UUID docId;
    private String status;
    private String message;
    private Integer pageCount;
    private long timestamp;
}
