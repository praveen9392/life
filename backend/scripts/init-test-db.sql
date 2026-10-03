-- Runs once when the postgres container's data volume is first initialized.
-- Creates a separate life_test database (used by the automated test suite)
-- alongside the life_dev database created by POSTGRES_DB, and enables the
-- pgcrypto extension (for gen_random_uuid()) in both.
CREATE DATABASE life_test;
\c life_dev
CREATE EXTENSION IF NOT EXISTS pgcrypto;
\c life_test
CREATE EXTENSION IF NOT EXISTS pgcrypto;
