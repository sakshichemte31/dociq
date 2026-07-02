package com.dociq.storage.repository;

import com.dociq.storage.entity.Query;
import com.dociq.storage.entity.User;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface QueryRepository extends JpaRepository<Query, UUID> {

    Page<Query> findByUserAndDocument_IdOrderByCreatedAtDesc(User user, UUID docId, Pageable pageable);

    List<Query> findByDocument_IdAndStatusOrderByCreatedAtDesc(UUID docId, String status);

    Optional<Query> findByIdAndUser(UUID id, User user);

    @org.springframework.data.jpa.repository.Query(
        "SELECT AVG(q.faithfulnessScore) FROM Query q WHERE q.user = :user AND q.faithfulnessScore IS NOT NULL")
    Double avgFaithfulnessByUser(User user);

    @org.springframework.data.jpa.repository.Query(
        "SELECT q FROM Query q WHERE q.document.id = :docId ORDER BY q.createdAt DESC")
    List<Query> findRecentByDocId(UUID docId, Pageable pageable);
}
