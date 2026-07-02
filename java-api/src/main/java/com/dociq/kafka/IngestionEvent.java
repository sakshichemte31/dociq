package com.dociq.kafka;

import lombok.*;
import java.util.UUID;

@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class IngestionEvent {
    private UUID docId;
    private String filePath;
    private UUID userId;
    private String filename;
}
