package com.dociq.api;

import com.dociq.storage.entity.Document;
import com.dociq.storage.entity.User;
import com.dociq.storage.repository.DocumentRepository;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.reactive.function.client.WebClient;

import java.io.IOException;
import java.nio.file.*;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class DocumentService {

    private final DocumentRepository documentRepository;
    private final WebClient.Builder webClientBuilder;

    @Value("${app.upload.base-dir}")
    private String baseUploadDir;

    @Value("${app.python-ml.base-url}")
    private String pythonMlUrl;

    /**
     * Uploads a PDF and ingests it synchronously (parse → chunk → embed)
     * before returning, so the response the client gets already reflects
     * the final READY/FAILED state — no separate Parse/Embed polling step.
     *
     * documentRepository.save(...) below is not wrapped in this method's
     * own @Transactional, so it commits immediately on return (Spring Data
     * repository methods are independently transactional). That guarantees
     * the row is visible to python-ml's own DB connection before we call
     * it — otherwise python's UPDATE/INSERT statements referencing this
     * document would silently miss it or violate the FK on document_chunks.
     */
    public DocumentResponse upload(MultipartFile file, User user) throws IOException {
        validateFile(file);

        UUID docId = UUID.randomUUID();
        String storedFilename = docId + ".pdf";

        Path userDir = Paths.get(baseUploadDir, user.getId().toString());
        Files.createDirectories(userDir);

        Path filePath = userDir.resolve(storedFilename);
        Files.copy(file.getInputStream(), filePath, StandardCopyOption.REPLACE_EXISTING);
        log.info("Saved PDF to {}", filePath);

        Document doc = Document.builder()
                .id(docId)
                .user(user)
                .filename(storedFilename)
                .originalFilename(file.getOriginalFilename())
                .filePath(filePath.toString())
                .fileSize(file.getSize())
                .status(Document.Status.UPLOADED)
                .build();

        doc = documentRepository.save(doc);
        log.info("Document {} uploaded, starting synchronous ingestion", docId);

        doc = ingestSynchronously(doc, filePath, user);
        return DocumentResponse.from(doc);
    }

    private Document ingestSynchronously(Document doc, Path filePath, User user) {
        try {
            JsonNode result = webClientBuilder.build()
                    .post()
                    .uri(pythonMlUrl + "/internal/ingest")
                    .bodyValue(Map.of(
                            "doc_id", doc.getId().toString(),
                            "file_path", filePath.toString(),
                            "user_id", user.getId().toString()
                    ))
                    .retrieve()
                    .bodyToMono(JsonNode.class)
                    .timeout(Duration.ofSeconds(180))
                    .block();

            if (result != null && "READY".equals(result.path("status").asText())) {
                doc.setStatus(Document.Status.READY);
                if (result.hasNonNull("pageCount")) {
                    doc.setPageCount(result.get("pageCount").asInt());
                }
            } else {
                String error = result != null ? result.path("error").asText("Ingestion failed") : "Ingestion failed";
                doc.setStatus(Document.Status.FAILED);
                doc.setErrorMessage(error);
                log.warn("Ingestion failed for document {}: {}", doc.getId(), error);
            }
        } catch (Exception e) {
            log.error("Ingestion call to python-ml failed for document {}: {}", doc.getId(), e.getMessage(), e);
            doc.setStatus(Document.Status.FAILED);
            doc.setErrorMessage("Could not reach the document processing service");
        }
        return documentRepository.save(doc);
    }

    @Transactional(readOnly = true)
    public DocumentResponse getStatus(UUID docId, User user) {
        Document doc = documentRepository.findByIdAndUser(docId, user)
                .orElseThrow(() -> new ResourceNotFoundException("Document not found: " + docId));
        return DocumentResponse.from(doc);
    }

    @Transactional(readOnly = true)
    public String getFilePath(UUID docId, User user) {
        Document doc = documentRepository.findByIdAndUser(docId, user)
                .orElseThrow(() -> new ResourceNotFoundException("Document not found: " + docId));
        return doc.getFilePath();
    }

    @Transactional(readOnly = true)
    public Page<DocumentResponse> listDocuments(User user, int page, int size) {
        return documentRepository.findByUserOrderByCreatedAtDesc(user, PageRequest.of(page, size))
                .map(DocumentResponse::from);
    }

    @Transactional
    public void deleteDocument(UUID docId, User user) throws IOException {
        Document doc = documentRepository.findByIdAndUser(docId, user)
                .orElseThrow(() -> new ResourceNotFoundException("Document not found: " + docId));

        Path filePath = Paths.get(doc.getFilePath());
        Files.deleteIfExists(filePath);

        documentRepository.delete(doc);
        log.info("Document {} deleted", docId);
    }

    private void validateFile(MultipartFile file) {
        if (file.isEmpty()) throw new IllegalArgumentException("Uploaded file is empty");
        String ct = file.getContentType();
        if (ct == null || !ct.equals("application/pdf"))
            throw new IllegalArgumentException("Only PDF files accepted. Got: " + ct);
        if (file.getSize() > 100L * 1024 * 1024)
            throw new IllegalArgumentException("File exceeds 100 MB limit");
    }
}
