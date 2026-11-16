ALTER TABLE app_user
ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE app_user
ADD COLUMN phone_verified_at timestamptz;
ALTER TABLE app_user
ADD COLUMN email text;
ALTER TABLE app_user
ADD COLUMN email_verified_at timestamptz;
-- Everyone so far signed in with a phone OTP, so their numbers are verified.
UPDATE app_user
SET phone_verified_at = created_at
WHERE phone IS NOT NULL;
ALTER TABLE app_user
ADD CONSTRAINT app_user_phone_verified_needs_phone CHECK (
        phone_verified_at IS NULL
        OR phone IS NOT NULL
    ),
    ADD CONSTRAINT app_user_email_format CHECK (
        email IS NULL
        OR (
            email = lower(email)
            AND length(email) <= 254
            AND email ~ '^[^@\s]+@[^@\s]+$'
        )
    ),
    ADD CONSTRAINT app_user_email_verified_needs_email CHECK (
        email_verified_at IS NULL
        OR email IS NOT NULL
    );
-- A number is unique only once verified. Anyone can type any number, and an
-- unverified claim must not lock the real owner out.
ALTER TABLE app_user DROP CONSTRAINT app_user_phone_unique;
CREATE UNIQUE INDEX app_user_verified_phone_unique ON app_user (phone)
WHERE phone_verified_at IS NOT NULL;
-- How a user signs in, kept apart from the user so phone OTP can be linked on later.
CREATE TYPE identity_provider AS ENUM ('GOOGLE');
CREATE TABLE user_identity (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES app_user (id),
    provider identity_provider NOT NULL,
    -- The provider's stable account id (Google's "sub"). Never the email, which can change.
    subject text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    last_used_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT user_identity_provider_subject_unique UNIQUE (provider, subject),
    CONSTRAINT user_identity_subject_length CHECK (
        length(subject) BETWEEN 1 AND 255
    )
);
CREATE INDEX user_identity_user_idx ON user_identity (user_id);