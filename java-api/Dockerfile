# ── Stage 1: Build ───────────────────────────────────────────
FROM maven:3.9.6-eclipse-temurin-17 AS builder
WORKDIR /build

# Cache dependencies first
COPY pom.xml .
RUN mvn dependency:go-offline -B

# Build application
COPY src ./src
ARG CACHE_BUST=1
RUN mvn package -DskipTests -B

# ── Stage 2: Runtime ──────────────────────────────────────────
FROM eclipse-temurin:17-jre-alpine AS runtime
WORKDIR /app

# Needed for the docker-compose healthcheck (curl -f http://localhost:8080/actuator/health)
RUN apk add --no-cache curl

# Security: non-root user
RUN addgroup -S dociq && adduser -S dociq -G dociq

# Copy JAR
COPY --from=builder /build/target/dociq-api-*.jar app.jar

# Upload directory
RUN mkdir -p /uploads && chown -R dociq:dociq /uploads /app

USER dociq

EXPOSE 8080

ENTRYPOINT ["java", \
  "-XX:+UseContainerSupport", \
  "-XX:MaxRAMPercentage=75", \
  "-XX:+HeapDumpOnOutOfMemoryError", \
  "-Djava.security.egd=file:/dev/./urandom", \
  "-jar", "app.jar"]
