-- Phone OTP sign-in and sessions (TURF-101).
-- One row per code sent. Only an HMAC of the code is stored.
CREATE TABLE otp_challenge (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    phone text NOT NULL,
    code_hash text NOT NULL,
    attempts smallint NOT NULL DEFAULT 0,
    request_ip text,
    expires_at timestamptz NOT NULL,
    consumed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT otp_challenge_phone_e164 CHECK (phone ~ '^\+[1-9][0-9]{7,14}$'),
    CONSTRAINT otp_challenge_attempts_range CHECK (
        attempts BETWEEN 0 AND 10
    )
);
-- Rate limits count recent rows per phone and per IP.
CREATE INDEX otp_challenge_phone_time_idx ON otp_challenge (phone, created_at DESC);
CREATE INDEX otp_challenge_ip_time_idx ON otp_challenge (request_ip, created_at DESC);
-- A signed-in device. The cookie holds a random token; only its SHA-256 is stored,
-- so a copy of this table does not hand out working sessions.
CREATE TABLE user_session (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES app_user (id),
    token_hash text NOT NULL,
    user_agent text,
    ip text,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    CONSTRAINT user_session_token_hash_unique UNIQUE (token_hash)
);
CREATE INDEX user_session_user_idx ON user_session (user_id);