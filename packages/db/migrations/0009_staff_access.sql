ALTER TABLE membership
ADD COLUMN title text,
    ADD COLUMN access text [] NOT NULL DEFAULT '{bookings,checkin,customers,venues,reports,earnings,settings}',
    ADD COLUMN venue_ids uuid [],
    ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
    ADD CONSTRAINT membership_access_known CHECK (
        access <@ '{bookings,checkin,customers,venues,reports,earnings,settings}'::text []
    ),
    ADD CONSTRAINT membership_title_length CHECK (
        title IS NULL
        OR length(btrim(title)) BETWEEN 1 AND 30
    ),
    ADD CONSTRAINT membership_venue_ids_not_empty CHECK (
        venue_ids IS NULL
        OR cardinality(venue_ids) > 0
    );
CREATE TRIGGER membership_updated_at BEFORE
UPDATE ON membership FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TABLE member_invite (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id uuid NOT NULL REFERENCES organisation (id),
    email text NOT NULL,
    name text NOT NULL,
    role member_role NOT NULL,
    title text NOT NULL,
    access text [] NOT NULL,
    venue_ids uuid [],
    invited_by uuid REFERENCES app_user (id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT member_invite_org_email_unique UNIQUE (organisation_id, email),
    CONSTRAINT member_invite_email_format CHECK (
        email = lower(email)
        AND length(email) <= 254
        AND email ~ '^[^@\s]+@[^@\s]+$'
    ),
    CONSTRAINT member_invite_name_length CHECK (
        length(btrim(name)) BETWEEN 1 AND 100
    ),
    CONSTRAINT member_invite_not_owner CHECK (role <> 'OWNER'),
    CONSTRAINT member_invite_title_length CHECK (
        length(btrim(title)) BETWEEN 1 AND 30
    ),
    CONSTRAINT member_invite_access_known CHECK (
        cardinality(access) > 0
        AND access <@ '{bookings,checkin,customers,venues,reports,earnings,settings}'::text []
    ),
    CONSTRAINT member_invite_venue_ids_not_empty CHECK (
        venue_ids IS NULL
        OR cardinality(venue_ids) > 0
    )
);
CREATE INDEX member_invite_email_idx ON member_invite (email);
CREATE TRIGGER member_invite_updated_at BEFORE
UPDATE ON member_invite FOR EACH ROW EXECUTE FUNCTION set_updated_at();
