package com.dociq.api;

import com.dociq.storage.entity.User;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.UUID;

@RestController
@RequestMapping("/api/documents")
@RequiredArgsConstructor
@Slf4j
public class DocumentController {

    private final DocumentService documentService;
    private final DiffService diffService;

    /**
     * POST /api/documents/upload
     * Accepts a multipart PDF, stores it, and ingests it synchronously
     * (parse → chunk → embed) before responding — the document is already
     * READY (or FAILED) for querying by the time this call returns.
     */
    @PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<DocumentResponse> upload(
            @RequestParam("file") MultipartFile file,
            @AuthenticationPrincipal User user) throws IOException {
        log.info("Upload request user={} file={} size={}", user.getId(), file.getOriginalFilename(), file.getSize());
        return ResponseEntity.status(HttpStatus.CREATED).body(documentService.upload(file, user));
    }

    /**
     * GET /api/documents/{id}/status
     */
    @GetMapping("/{id}/status")
    public ResponseEntity<DocumentResponse> getStatus(
            @PathVariable UUID id,
            @AuthenticationPrincipal User user) {
        return ResponseEntity.ok(documentService.getStatus(id, user));
    }

    /**
     * GET /api/documents/{id}/file
     * Serve the raw PDF file for the PDF viewer.
     */
    @GetMapping("/{id}/file")
    public ResponseEntity<Resource> serveFile(
            @PathVariable UUID id,
            @AuthenticationPrincipal User user) {
        DocumentResponse doc = documentService.getStatus(id, user);
        Path filePath = Paths.get(documentService.getFilePath(id, user));
        Resource resource = new FileSystemResource(filePath);

        if (!resource.exists()) {
            return ResponseEntity.notFound().build();
        }

        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "inline; filename=\"" + doc.getOriginalFilename() + "\"")
                .body(resource);
    }

    /**
     * GET /api/documents
     */
    @GetMapping
    public ResponseEntity<Page<DocumentResponse>> listDocuments(
            @AuthenticationPrincipal User user,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return ResponseEntity.ok(documentService.listDocuments(user, page, size));
    }

    /**
     * DELETE /api/documents/{id}
     */
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteDocument(
            @PathVariable UUID id,
            @AuthenticationPrincipal User user) throws IOException {
        documentService.deleteDocument(id, user);
        return ResponseEntity.noContent().build();
    }

    /**
     * POST /api/documents/diff
     */
    @PostMapping("/diff")
    public ResponseEntity<DiffResponse> diff(
            @RequestBody DiffRequest request,
            @AuthenticationPrincipal User user) {
        return ResponseEntity.ok(diffService.diff(request, user));
    }
}
