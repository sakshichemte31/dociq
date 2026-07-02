package com.dociq.storage.repository;

import com.dociq.storage.entity.Document;
import com.dociq.storage.entity.DocumentChunk;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface DocumentChunkRepository extends JpaRepository<DocumentChunk, UUID> {
    List<DocumentChunk> findByDocumentOrderByChunkIndex(Document document);
    long countByDocument(Document document);
}
