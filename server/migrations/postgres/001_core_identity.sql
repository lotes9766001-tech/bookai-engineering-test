-- Canonical identity/company tables. No seed data; forward-only and transactional.
CREATE TABLE IF NOT EXISTS bookai_schema_contract_marker (version TEXT PRIMARY KEY, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);
