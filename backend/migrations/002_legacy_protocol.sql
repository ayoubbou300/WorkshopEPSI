-- Mode compatibilité avec l'ancien firmware (topics partagés, sans confirmation).

ALTER TABLE devices
    ADD COLUMN protocol TEXT NOT NULL DEFAULT 'v1' CHECK (protocol IN ('v1', 'legacy'));

-- 'sent' : commande publiée vers un boîtier qui ne renvoie jamais de confirmation.
ALTER TABLE commands DROP CONSTRAINT commands_status_check;
ALTER TABLE commands
    ADD CONSTRAINT commands_status_check
    CHECK (status IN ('pending', 'confirmed', 'failed', 'timeout', 'sent'));
