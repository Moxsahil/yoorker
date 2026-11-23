ALTER TABLE venue
ADD COLUMN deleted_at timestamptz,
    ADD CONSTRAINT venue_deleted_is_inactive CHECK (
        deleted_at IS NULL
        OR NOT is_active
    );
CREATE INDEX venue_organisation_live_idx ON venue (organisation_id)
WHERE deleted_at IS NULL;
