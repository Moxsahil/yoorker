CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at := now();
RETURN NEW;
END;
$$;
CREATE TABLE app_user (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    phone text NOT NULL,
    name text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT app_user_phone_unique UNIQUE (phone),
    CONSTRAINT app_user_phone_e164 CHECK (phone ~ '^\+[1-9][0-9]{7,14}$'),
    CONSTRAINT app_user_name_length CHECK (
        name IS NULL
        OR length(btrim(name)) BETWEEN 1 AND 100
    )
);
CREATE TABLE organisation (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT organisation_name_length CHECK (
        length(btrim(name)) BETWEEN 1 AND 120
    )
);
CREATE TYPE member_role AS ENUM ('OWNER', 'MANAGER', 'STAFF');
CREATE TABLE membership (
    organisation_id uuid NOT NULL REFERENCES organisation (id),
    user_id uuid NOT NULL REFERENCES app_user (id),
    role member_role NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (organisation_id, user_id)
);
CREATE INDEX membership_user_idx ON membership (user_id);
CREATE TABLE venue (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id uuid NOT NULL REFERENCES organisation (id),
    slug text NOT NULL,
    name text NOT NULL,
    address text NOT NULL,
    location geography (Point, 4326) NOT NULL,
    timezone text NOT NULL DEFAULT 'Asia/Kolkata',
    amenities text [] NOT NULL DEFAULT '{}',
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT venue_slug_unique UNIQUE (slug),
    CONSTRAINT venue_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    CONSTRAINT venue_name_length CHECK (
        length(btrim(name)) BETWEEN 1 AND 120
    ),
    CONSTRAINT venue_address_length CHECK (
        length(btrim(address)) BETWEEN 1 AND 300
    )
);
CREATE INDEX venue_organisation_idx ON venue (organisation_id);
CREATE INDEX venue_location_idx ON venue USING gist (location);
CREATE TABLE venue_photo (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    venue_id uuid NOT NULL REFERENCES venue (id),
    object_key text NOT NULL,
    position smallint NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT venue_photo_object_key_unique UNIQUE (object_key)
);
CREATE INDEX venue_photo_venue_idx ON venue_photo (venue_id, position);
CREATE TYPE court_surface AS ENUM (
    'ARTIFICIAL_TURF',
    'NATURAL_GRASS',
    'HARD_COURT',
    'SYNTHETIC',
    'WOODEN',
    'CLAY'
);
CREATE TABLE court (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    venue_id uuid NOT NULL REFERENCES venue (id),
    name text NOT NULL,
    sports text [] NOT NULL,
    surface court_surface NOT NULL,
    capacity smallint NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT court_name_unique UNIQUE (venue_id, name),
    CONSTRAINT court_name_length CHECK (
        length(btrim(name)) BETWEEN 1 AND 60
    ),
    CONSTRAINT court_sports_valid CHECK (
        cardinality(sports) >= 1
        AND sports <@ ARRAY ['FOOTBALL', 'CRICKET', 'BADMINTON', 'PICKLEBALL', 'TENNIS', 'BASKETBALL']
    ),
    CONSTRAINT court_capacity_range CHECK (
        capacity BETWEEN 1 AND 50
    )
);
CREATE INDEX court_venue_idx ON court (venue_id);
CREATE TABLE audit_log (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organisation_id uuid REFERENCES organisation (id),
    actor_user_id uuid REFERENCES app_user (id),
    action text NOT NULL,
    -- e.g. 'venue.create', 'court.update'
    entity_type text NOT NULL,
    -- e.g. 'venue'
    entity_id text NOT NULL,
    before jsonb,
    after jsonb,
    request_id text,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_organisation_time_idx ON audit_log (organisation_id, created_at DESC);
CREATE INDEX audit_log_entity_idx ON audit_log (entity_type, entity_id);
CREATE FUNCTION reject_audit_log_change() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit_log is append-only';
END;
$$;
CREATE TRIGGER audit_log_append_only BEFORE
UPDATE
    OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION reject_audit_log_change();
CREATE TRIGGER app_user_updated_at BEFORE
UPDATE ON app_user FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER organisation_updated_at BEFORE
UPDATE ON organisation FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER venue_updated_at BEFORE
UPDATE ON venue FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER court_updated_at BEFORE
UPDATE ON court FOR EACH ROW EXECUTE FUNCTION set_updated_at();