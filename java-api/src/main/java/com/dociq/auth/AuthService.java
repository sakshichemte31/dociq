package com.dociq.auth;

import com.dociq.storage.entity.RefreshToken;
import com.dociq.storage.entity.User;
import com.dociq.storage.repository.RefreshTokenRepository;
import com.dociq.storage.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;

@Service
@RequiredArgsConstructor
@Slf4j
public class AuthService {

    private final UserRepository userRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final AuthenticationManager authenticationManager;

    @Value("${app.jwt.refresh-expiration-ms}")
    private long refreshExpirationMs;

    @Transactional
    public AuthResponse register(RegisterRequest request) {
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new IllegalArgumentException("Email already registered: " + request.getEmail());
        }
        var user = User.builder()
                .email(request.getEmail())
                .passwordHash(passwordEncoder.encode(request.getPassword()))
                .fullName(request.getFullName())
                .role("USER")
                .build();
        var saved = userRepository.save(user);
        log.info("New user registered: {}", saved.getEmail());
        return buildAuthResponse(saved);
    }

    @Transactional
    public AuthResponse login(LoginRequest request) {
        authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(request.getEmail(), request.getPassword()));
        var user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> new RuntimeException("User not found"));
        return buildAuthResponse(user);
    }

    @Transactional
    public AuthResponse refreshToken(String rawRefreshToken) {
        var stored = refreshTokenRepository.findByToken(rawRefreshToken)
                .orElseThrow(() -> new IllegalArgumentException("Invalid refresh token"));
        if (stored.isExpired()) {
            refreshTokenRepository.delete(stored);
            throw new IllegalArgumentException("Refresh token expired");
        }
        var user = stored.getUser();
        refreshTokenRepository.delete(stored);  // rotate token
        return buildAuthResponse(user);
    }

    @Transactional
    public void logout(String email) {
        userRepository.findByEmail(email).ifPresent(user -> {
            refreshTokenRepository.deleteByUser(user);
            log.info("User logged out: {}", email);
        });
    }

    /** Purge expired refresh tokens daily */
    @Scheduled(cron = "0 0 3 * * *")
    @Transactional
    public void purgeExpiredTokens() {
        refreshTokenRepository.deleteExpiredTokens(OffsetDateTime.now(ZoneOffset.UTC));
    }

    private AuthResponse buildAuthResponse(User user) {
        var accessToken  = jwtService.generateToken(user);
        var rawRefresh   = jwtService.generateRefreshToken(user);

        // Persist refresh token
        var expiresAt = OffsetDateTime.now(ZoneOffset.UTC).plusSeconds(refreshExpirationMs / 1000);
        refreshTokenRepository.save(RefreshToken.builder()
                .user(user)
                .token(rawRefresh)
                .expiresAt(expiresAt)
                .build());

        return AuthResponse.builder()
                .accessToken(accessToken)
                .refreshToken(rawRefresh)
                .userId(user.getId().toString())
                .email(user.getEmail())
                .fullName(user.getFullName())
                .build();
    }
}
