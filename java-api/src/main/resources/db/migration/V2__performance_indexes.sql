-- V2__performance_indexes.sql
-- Additional indexes for query performance

-- Full-text search on document filenames
CREATE INDEX IF NOT EXISTS idx_documents_filename_trgm
    ON documents USING gin (original_filename gin_trgm_ops);

-- Composite index for analytics queries
CREATE INDEX IF NOT EXISTS idx_queries_user_status_created
    ON queries (user_id, status, created_at DESC);

-- Composite index for faithfulness analytics
CREATE INDEX IF NOT EXISTS idx_queries_user_faithfulness
    ON queries (user_id, faithfulness_score, created_at DESC)
    WHERE faithfulness_score IS NOT NULL;

-- Index for status polling
CREATE INDEX IF NOT EXISTS idx_documents_user_status
    ON documents (user_id, status, created_at DESC);

-- Refresh token cleanup index
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires
    ON refresh_tokens (expires_at);
