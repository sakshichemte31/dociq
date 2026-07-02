package com.dociq.storage.repository;

import com.dociq.storage.entity.Document;
import com.dociq.storage.entity.User;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface DocumentRepository extends JpaRepository<Document, UUID> {

    Page<Document> findByUserOrderByCreatedAtDesc(User user, Pageable pageable);

    List<Document> findByUserAndStatus(User user, Document.Status status);

    Optional<Document> findByIdAndUser(UUID id, User user);

    @Query("SELECT COUNT(d) FROM Document d WHERE d.user = :user")
    long countByUser(User user);
}
