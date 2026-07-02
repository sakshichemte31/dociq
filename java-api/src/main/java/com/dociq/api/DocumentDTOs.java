package com.dociq.api;

import com.dociq.storage.entity.Document;
import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.*;

import java.time.OffsetDateTime;
import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@JsonInclude(JsonInclude.Include.NON_NULL)
class DocumentResponse {
    private UUID id;
    private String filename;
    private String originalFilename;
    private String status;
    private Integer pageCount;
    private Long fileSize;
    private String errorMessage;
    private OffsetDateTime createdAt;
    private OffsetDateTime updatedAt;

    public static DocumentResponse from(Document doc) {
        return DocumentResponse.builder()
                .id(doc.getId())
                .filename(doc.getFilename())
                .originalFilename(doc.getOriginalFilename())
                .status(doc.getStatus().name())
                .pageCount(doc.getPageCount())
                .fileSize(doc.getFileSize())
                .errorMessage(doc.getErrorMessage())
                .createdAt(doc.getCreatedAt())
                .updatedAt(doc.getUpdatedAt())
                .build();
    }
}

