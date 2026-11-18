-- Venue city, locality, PIN code and facility rules (TURF-108, RFC-003).
-- Yoorker works in any Indian city. A city row is created the first time an owner
-- adds a venue there; is_live marks the cities we actively launch (Gurugram first).
CREATE TABLE city (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug text NOT NULL,
    name text NOT NULL,
    state text NOT NULL,
    centroid geography (Point, 4326) NOT NULL,
    is_live boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT city_slug_unique UNIQUE (slug),
    CONSTRAINT city_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    CONSTRAINT city_name_length CHECK (
        length(btrim(name)) BETWEEN 1 AND 80
    ),
    CONSTRAINT city_state_length CHECK (
        length(btrim(state)) BETWEEN 1 AND 80
    )
);
-- The same city name can exist in two states (Aurangabad: Maharashtra and Bihar).
CREATE UNIQUE INDEX city_name_state_unique ON city (lower(name), lower(state));
INSERT INTO city (slug, name, state, centroid, is_live)
VALUES (
        'gurugram',
        'Gurugram',
        'Haryana',
        ST_SetSRID(ST_MakePoint(77.0266, 28.4595), 4326)::geography,
        true
    );
ALTER TABLE venue
ADD COLUMN city_id uuid REFERENCES city (id),
    ADD COLUMN locality text,
    ADD COLUMN pincode text,
    ADD COLUMN rules text [] NOT NULL DEFAULT '{}';
-- Only development and staging data exists so far, all of it in Gurugram.
UPDATE venue
SET city_id = (
        SELECT id
        FROM city
        WHERE slug = 'gurugram'
    );
ALTER TABLE venue
ALTER COLUMN city_id
SET NOT NULL,
    ADD CONSTRAINT venue_locality_length CHECK (
        locality IS NULL
        OR length(btrim(locality)) BETWEEN 1 AND 100
    ),
    ADD CONSTRAINT venue_pincode_format CHECK (
        pincode IS NULL
        OR pincode ~ '^[1-9][0-9]{5}$'
    ),
    ADD CONSTRAINT venue_rules_count CHECK (cardinality(rules) <= 20);
CREATE INDEX venue_city_idx ON venue (city_id);