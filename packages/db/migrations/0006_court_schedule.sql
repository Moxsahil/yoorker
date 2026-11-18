-- Court schedules (TURF-206): when each court is open, how often a booking can start, and
-- which booking lengths players can choose (1 h football, 3 h 30 m T20 cricket, a full day).
-- Opening hours are local wall-clock times in the venue's timezone. Slots, bookings and
-- blocks become UTC instants in the API.
ALTER TABLE court
ADD COLUMN start_step_minutes smallint NOT NULL DEFAULT 30,
    ADD CONSTRAINT court_start_step CHECK (start_step_minutes IN (15, 30, 60));
-- One row per opening window. A court with no rows is closed.
CREATE TABLE opening_hours (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    court_id uuid NOT NULL REFERENCES court (id) ON DELETE CASCADE,
    -- ISO weekday: 1 = Monday ... 7 = Sunday
    weekday smallint NOT NULL,
    -- Minutes after local midnight. closes_minute above 1440 ends the next day (18:00-02:00).
    opens_minute smallint NOT NULL,
    closes_minute smallint NOT NULL,
    CONSTRAINT opening_hours_weekday CHECK (
        weekday BETWEEN 1 AND 7
    ),
    CONSTRAINT opening_hours_opens CHECK (
        opens_minute BETWEEN 0 AND 1439
    ),
    CONSTRAINT opening_hours_length CHECK (
        closes_minute > opens_minute
        AND closes_minute <= opens_minute + 1440
    ),
    -- Windows of a court never overlap within the week. The API also checks a Sunday-night
    -- window running into Monday morning, which this range cannot see.
    CONSTRAINT opening_hours_no_overlap EXCLUDE USING gist (
        court_id WITH =,
        int4range(
            weekday * 1440 + opens_minute,
            weekday * 1440 + closes_minute
        ) WITH &&
    )
);
CREATE INDEX opening_hours_court_idx ON opening_hours (court_id, weekday);
-- The booking lengths a court offers. sport NULL means every sport on the court.
CREATE TABLE court_duration (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    court_id uuid NOT NULL REFERENCES court (id) ON DELETE CASCADE,
    minutes smallint NOT NULL,
    label text,
    sport text,
    -- A fixed package price, e.g. a corporate T20. NULL: priced per hour (TURF-201).
    price_paise integer,
    position smallint NOT NULL DEFAULT 0,
    CONSTRAINT court_duration_minutes CHECK (
        minutes BETWEEN 15 AND 720
    ),
    CONSTRAINT court_duration_label_length CHECK (
        label IS NULL
        OR length(btrim(label)) BETWEEN 1 AND 40
    ),
    CONSTRAINT court_duration_sport_valid CHECK (
        sport IS NULL
        OR sport IN (
            'FOOTBALL',
            'CRICKET',
            'BADMINTON',
            'PICKLEBALL',
            'TENNIS',
            'BASKETBALL'
        )
    ),
    CONSTRAINT court_duration_price CHECK (
        price_paise IS NULL
        OR price_paise BETWEEN 0 AND 10000000
    )
);
CREATE UNIQUE INDEX court_duration_unique ON court_duration (court_id, coalesce(sport, ''), minutes);