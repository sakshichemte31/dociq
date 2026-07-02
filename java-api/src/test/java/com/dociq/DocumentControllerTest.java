package com.dociq;

import com.dociq.kafka.DocIQProducer;
import com.dociq.storage.entity.Document;
import com.dociq.storage.entity.User;
import com.dociq.storage.repository.DocumentRepository;
import com.dociq.storage.repository.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;
import java.util.concurrent.CompletableFuture;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@DisplayName("Document API Integration Tests")
class DocumentControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired ObjectMapper objectMapper;
    @Autowired UserRepository userRepository;
    @Autowired DocumentRepository documentRepository;
    @Autowired PasswordEncoder passwordEncoder;
    @Autowired com.dociq.auth.JwtService jwtService;

    @MockBean DocIQProducer kafkaProducer;

    private String token;
    private User testUser;

    @BeforeEach
    void setUp() {
        documentRepository.deleteAll();
        userRepository.deleteAll();

        testUser = userRepository.save(User.builder()
                .email("test@dociq.com")
                .passwordHash(passwordEncoder.encode("password123"))
                .fullName("Test User")
                .build());

        token = "Bearer " + jwtService.generateToken(testUser);

        when(kafkaProducer.publishIngestionEvent(any()))
                .thenReturn(CompletableFuture.completedFuture(null));
    }

    @Test
    @DisplayName("POST /api/documents/upload — valid PDF returns 201; ingestion runs synchronously")
    void upload_validPdf_returns201() throws Exception {
        MockMultipartFile pdf = new MockMultipartFile(
                "file", "test.pdf", "application/pdf",
                "%PDF-1.4 test content".getBytes()
        );

        // In this test profile there's no python-ml service running at
        // app.python-ml.base-url, so ingestion is expected to fail
        // gracefully (status FAILED) rather than throw — the endpoint
        // itself must still respond 201 with a well-formed document.
        mockMvc.perform(multipart("/api/documents/upload")
                        .file(pdf)
                        .header("Authorization", token))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isNotEmpty())
                .andExpect(jsonPath("$.originalFilename").value("test.pdf"));
    }

    @Test
    @DisplayName("POST /api/documents/upload — non-PDF returns 400")
    void upload_nonPdf_returns400() throws Exception {
        MockMultipartFile txt = new MockMultipartFile(
                "file", "doc.txt", "text/plain", "hello".getBytes()
        );

        mockMvc.perform(multipart("/api/documents/upload")
                        .file(txt)
                        .header("Authorization", token))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("GET /api/documents/{id}/status — returns current status")
    void getStatus_existingDoc_returnsStatus() throws Exception {
        Document doc = documentRepository.save(Document.builder()
                .user(testUser)
                .filename("test.pdf")
                .originalFilename("test.pdf")
                .filePath("/tmp/test.pdf")
                .status(Document.Status.READY)
                .pageCount(5)
                .build());

        mockMvc.perform(get("/api/documents/{id}/status", doc.getId())
                        .header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("READY"))
                .andExpect(jsonPath("$.pageCount").value(5));
    }

    @Test
    @DisplayName("GET /api/documents/{id}/status — 404 for wrong user")
    void getStatus_wrongUser_returns404() throws Exception {
        User otherUser = userRepository.save(User.builder()
                .email("other@dociq.com")
                .passwordHash(passwordEncoder.encode("pass"))
                .build());
        Document doc = documentRepository.save(Document.builder()
                .user(otherUser)
                .filename("secret.pdf")
                .originalFilename("secret.pdf")
                .filePath("/tmp/secret.pdf")
                .status(Document.Status.READY)
                .build());

        mockMvc.perform(get("/api/documents/{id}/status", doc.getId())
                        .header("Authorization", token))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("GET /api/documents — lists user's documents paginated")
    void listDocuments_returnsPaginatedList() throws Exception {
        for (int i = 0; i < 3; i++) {
            documentRepository.save(Document.builder()
                    .user(testUser)
                    .filename("doc" + i + ".pdf")
                    .originalFilename("doc" + i + ".pdf")
                    .filePath("/tmp/doc" + i + ".pdf")
                    .status(Document.Status.READY)
                    .build());
        }

        mockMvc.perform(get("/api/documents")
                        .header("Authorization", token)
                        .param("page", "0")
                        .param("size", "10"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(3))
                .andExpect(jsonPath("$.totalElements").value(3));
    }

    @Test
    @DisplayName("Unauthenticated request returns 401")
    void unauthenticated_returns401() throws Exception {
        mockMvc.perform(get("/api/documents"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("POST /api/auth/register — creates account and returns tokens")
    void register_createsAccount() throws Exception {
        var body = objectMapper.writeValueAsString(
                new java.util.HashMap<String, String>() {{
                    put("email", "new@dociq.com");
                    put("password", "newpass123");
                    put("fullName", "New User");
                }}
        );

        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.accessToken").isNotEmpty())
                .andExpect(jsonPath("$.email").value("new@dociq.com"));
    }

    @Test
    @DisplayName("POST /api/auth/login — valid credentials return tokens")
    void login_validCredentials() throws Exception {
        var body = objectMapper.writeValueAsString(
                new java.util.HashMap<String, String>() {{
                    put("email", "test@dociq.com");
                    put("password", "password123");
                }}
        );

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").isNotEmpty())
                .andExpect(jsonPath("$.userId").isNotEmpty());
    }
}
