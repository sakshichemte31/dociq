package com.dociq.storage.repository;

import com.dociq.storage.entity.PromptVersion;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface PromptVersionRepository extends JpaRepository<PromptVersion, UUID> {
    Optional<PromptVersion> findByNameAndActiveTrue(String name);
}
