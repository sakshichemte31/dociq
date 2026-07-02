-- V3: Shareable chat sessions + knowledge graph storage

-- Add share columns to queries
ALTER TABLE queries
    ADD COLUMN IF NOT EXISTS share_token  UUID    DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS is_public    BOOLEAN DEFAULT FALSE NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_queries_share_token
    ON queries(share_token) WHERE share_token IS NOT NULL;

-- Knowledge graph storage (cache per document)
CREATE TABLE IF NOT EXISTS document_graphs (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_id      UUID        NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    graph_json  JSONB       NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(doc_id)
);

CREATE INDEX IF NOT EXISTS idx_document_graphs_doc_id ON document_graphs(doc_id);
