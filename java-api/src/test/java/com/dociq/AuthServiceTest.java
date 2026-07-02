package com.dociq;

import com.dociq.auth.AuthService;
import com.dociq.auth.JwtService;
import com.dociq.storage.entity.User;
import com.dociq.storage.repository.RefreshTokenRepository;
import com.dociq.storage.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("Auth Service Tests")
class AuthServiceTest {

    @Mock UserRepository userRepository;
    @Mock RefreshTokenRepository refreshTokenRepository;
    @Mock JwtService jwtService;
    @Mock AuthenticationManager authenticationManager;

    private PasswordEncoder passwordEncoder = new BCryptPasswordEncoder();
    private AuthService authService;

    @BeforeEach
    void setUp() {
        authService = new AuthService(userRepository, refreshTokenRepository, passwordEncoder, jwtService, authenticationManager);
    }

    @Test
    @DisplayName("register() - happy path creates user and returns tokens")
    void register_happyPath() {
        var req = new com.dociq.auth.RegisterRequest("alice@example.com", "password123", "Alice");
        when(userRepository.existsByEmail("alice@example.com")).thenReturn(false);
        when(userRepository.save(any(User.class))).thenAnswer(inv -> {
            User u = inv.getArgument(0);
            ReflectionTestUtils.setField(u, "id", UUID.randomUUID());
            return u;
        });
        when(jwtService.generateToken(any())).thenReturn("access-token");
        when(jwtService.generateRefreshToken(any())).thenReturn("refresh-token");

        var response = authService.register(req);

        assertThat(response.getAccessToken()).isEqualTo("access-token");
        assertThat(response.getRefreshToken()).isEqualTo("refresh-token");
        assertThat(response.getEmail()).isEqualTo("alice@example.com");
        verify(userRepository).save(any(User.class));
    }

    @Test
    @DisplayName("register() - duplicate email throws IllegalArgumentException")
    void register_duplicateEmail() {
        when(userRepository.existsByEmail("dupe@example.com")).thenReturn(true);
        var req = new com.dociq.auth.RegisterRequest("dupe@example.com", "password123", "Dupe");
        assertThatThrownBy(() -> authService.register(req))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("already registered");
    }
}

@ExtendWith(MockitoExtension.class)
@DisplayName("JWT Service Tests")
class JwtServiceTest {

    private JwtService jwtService;

    @BeforeEach
    void setUp() {
        jwtService = new JwtService();
        ReflectionTestUtils.setField(jwtService, "secretKey",
                "test-secret-key-that-is-long-enough-for-hs256-algorithm-and-testing");
        ReflectionTestUtils.setField(jwtService, "jwtExpirationMs", 3600000L);
        ReflectionTestUtils.setField(jwtService, "refreshExpirationMs", 86400000L);
    }

    @Test
    @DisplayName("generateToken() then extractUsername() round-trips correctly")
    void generateAndExtract() {
        User user = User.builder()
                .email("test@example.com")
                .passwordHash("hash")
                .build();

        String token = jwtService.generateToken(user);
        assertThat(token).isNotBlank();
        assertThat(jwtService.extractUsername(token)).isEqualTo("test@example.com");
    }

    @Test
    @DisplayName("isTokenValid() returns true for valid token")
    void validToken() {
        User user = User.builder().email("u@test.com").passwordHash("x").build();
        String token = jwtService.generateToken(user);
        assertThat(jwtService.isTokenValid(token, user)).isTrue();
    }

    @Test
    @DisplayName("isTokenValid() returns false for wrong user")
    void invalidToken_wrongUser() {
        User user1 = User.builder().email("a@test.com").passwordHash("x").build();
        User user2 = User.builder().email("b@test.com").passwordHash("x").build();
        String token = jwtService.generateToken(user1);
        assertThat(jwtService.isTokenValid(token, user2)).isFalse();
    }
}
