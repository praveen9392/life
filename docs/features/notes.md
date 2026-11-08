# Notes, Directories and Tags

Last reviewed: 2026-10-10

## Overview
Markdown notes with pin/archive flags, tags, soft delete, and flat per-user folders (directories).

## Workflow
Create/update validates `directory_id` ownership (`NoteService._validate_directory`, 404 "Folder not found"). Folder delete: one `UPDATE` soft-deletes the folder's live notes and sets `directory_id=NULL`, then hard-deletes the folder (`note_directory_service.py`). Move: `POST /note-directories/{id}/notes` with note ids (`directory_id` None = unfiled); foreign note ids are ignored by the repository filter.

## Components
`routes/notes.py`, `note_directories.py`, `tags.py`; `services/note_service.py`, `note_directory_service.py`, `tag_service.py`; repositories of the same names; `schemas/note*.py`, `tag.py`.

## API contract
`GET /notes` (Page; `search`<=200, `sort`, `order`, `directory_id`, `unfiled`), `POST /notes`, `GET|PATCH|DELETE /notes/{id}`; `GET|POST /note-directories`, `PATCH|DELETE /note-directories/{id}`, `POST /note-directories/{id}/notes`; `GET|POST /tags`. Pinned notes sort first by default.

## Data model
`notes` (soft delete, GIN search_vector, index user+directory), `note_directories` (unique user+name), `tags` (unique user+name), `note_tags`, `task_tags`.

## Failure scenarios
Duplicate folder/tag name -> 409 via savepoint + `IntegrityError` translation (handled). Foreign folder -> 404. Foreign tag ids are silently dropped (partial). Concurrent edits: last write wins.

## Edge cases
Deleted folder's notes become trashed (not hard-deleted). `GET /note-directories` returns live (non-deleted, non-archived) counts. Notes `search` filter (`note_repository.py:58`) matches **title only** with unescaped ILIKE (wildcards `%`/`_` not escaped), unlike global search which escapes and searches content.

## Security
Owner-scoped queries; directory ownership validated.

## Logging
None.

## Testing
`backend/tests/api/test_notes.py`, `test_note_directories.py`, `test_tags.py`.

## Known limitations
Flat folders only; no trash/restore endpoint was found.
