-- V1__initial_schema.sql
-- DocIQ Platform Initial Database Schema

-- ============================================================
-- EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================
-- ENUMS
-- ============================================================
CREATE TYPE document_status AS ENUM ('UPLOADED', 'PROCESSING', 'READY', 'FAILED');

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE users (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email        VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name    VARCHAR(255),
    role         VARCHAR(50) NOT NULL DEFAULT 'USER',
    enabled      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);

-- ============================================================
-- DOCUMENTS
-- ============================================================
CREATE TABLE documents (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    filename     VARCHAR(500) NOT NULL,
    original_filename VARCHAR(500) NOT NULL,
    file_path    VARCHAR(1000) NOT NULL,
    file_size    BIGINT,
    mime_type    VARCHAR(100) DEFAULT 'application/pdf',
    status       document_status NOT NULL DEFAULT 'UPLOADED',
    page_count   INTEGER,
    error_message TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_documents_user_id ON documents(user_id);
CREATE INDEX idx_documents_status ON documents(status);
CREATE INDEX idx_documents_created_at ON documents(created_at DESC);

-- ============================================================
-- CHUNKS (stored by Python, referenced by Java for citations)
-- ============================================================
CREATE TABLE document_chunks (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    doc_id       UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index  INTEGER NOT NULL,
    page_num     INTEGER NOT NULL,
    char_start   INTEGER NOT NULL,
    char_end     INTEGER NOT NULL,
    text         TEXT NOT NULL,
    token_count  INTEGER,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chunks_doc_id ON document_chunks(doc_id);
CREATE INDEX idx_chunks_doc_page ON document_chunks(doc_id, page_num);

-- ============================================================
-- PROMPT VERSIONS
-- ============================================================
CREATE TABLE prompt_versions (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name         VARCHAR(255) NOT NULL UNIQUE,
    content      TEXT NOT NULL,
    description  TEXT,
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default prompts
INSERT INTO prompt_versions (name, content, description) VALUES
(
    'rag_answer',
    'You are a precise document analysis assistant. Answer the question using ONLY the provided document excerpts.
If the answer cannot be found in the excerpts, say "I cannot find this in the document."
Always cite the page number when referencing information.

Document excerpts:
{context}

Question: {question}

Provide a clear, accurate answer:',
    'Main RAG answer generation prompt'
),
(
    'query_rewrite',
    'Generate 3 different search queries to find information relevant to the following question.
Each query should focus on a different aspect or phrasing.
Return ONLY the 3 queries, one per line, no numbering or explanation.

Original question: {question}',
    'Query rewriting for multi-query retrieval'
),
(
    'faithfulness_check',
    'Evaluate if the following answer is faithful to the provided context passages.
Score from 0.0 to 1.0 where:
- 1.0: All claims in the answer are directly supported by the context
- 0.7-0.99: Most claims supported, minor inference
- 0.4-0.69: Some claims lack support
- 0.0-0.39: Answer contains unsupported or contradicted claims

Context passages:
{context}

Answer to evaluate:
{answer}

Respond with JSON only: {"score": <float>, "explanation": "<brief reason>"}',
    'Faithfulness scoring for generated answers'
),
(
    'semantic_diff',
    'Compare these two document passages and describe what changed semantically.
Focus on meaning changes, not just wording differences.

Original passage:
{old_text}

New passage:
{new_text}

Describe the semantic changes in 1-3 sentences:',
    'Semantic diff between document versions'
);

-- ============================================================
-- QUERIES
-- ============================================================
CREATE TABLE queries (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    doc_id               UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    question             TEXT NOT NULL,
    answer               TEXT,
    faithfulness_score   DECIMAL(4,3),
    latency_ms           INTEGER,
    retrieved_chunks     JSONB,        -- array of chunk_ids + scores
    rewritten_queries    TEXT[],       -- the 3 sub-queries generated
    status               VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    error_message        TEXT,
    prompt_version_id    UUID REFERENCES prompt_versions(id),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at         TIMESTAMPTZ
);

CREATE INDEX idx_queries_user_id ON queries(user_id);
CREATE INDEX idx_queries_doc_id ON queries(doc_id);
CREATE INDEX idx_queries_created_at ON queries(created_at DESC);
CREATE INDEX idx_queries_faithfulness ON queries(faithfulness_score);

-- ============================================================
-- DIFF RESULTS
-- ============================================================
CREATE TABLE diff_results (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    doc_id_1     UUID NOT NULL REFERENCES documents(id),
    doc_id_2     UUID NOT NULL REFERENCES documents(id),
    result       JSONB NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_diff_user_id ON diff_results(user_id);

-- ============================================================
-- REFRESH TOKENS
-- ============================================================
CREATE TABLE refresh_tokens (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token        VARCHAR(500) NOT NULL UNIQUE,
    expires_at   TIMESTAMPTZ NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_token ON refresh_tokens(token);
CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);

-- ============================================================
-- AUDIT / UPDATED_AT TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_prompt_versions_updated_at BEFORE UPDATE ON prompt_versions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
