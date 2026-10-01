-- Run as database administrator. Applies only to new connections to SC Insight.
-- Keep fsync, synchronous_commit and full_page_writes enabled.
ALTER DATABASE sc_insight_app SET wal_compression = 'lz4';
-- Rollback to the previous inherited setting:
-- ALTER DATABASE sc_insight_app RESET wal_compression;
