-- Schema bootstrap for RaceScan backend
-- This script is executed automatically by the MySQL container on first start.

CREATE TABLE IF NOT EXISTS users (
    id                     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    first_name             VARCHAR(100)           NOT NULL,
    last_name              VARCHAR(100)           NOT NULL,
    email                  VARCHAR(255)           NOT NULL,
    password_hash          VARCHAR(255)           NOT NULL,
    subscribed             TINYINT(1)     DEFAULT 0,
    tier                   VARCHAR(50)    DEFAULT NULL,
    email_verified         TINYINT(1)     DEFAULT 0,
    verification_code      VARCHAR(12)    DEFAULT NULL,
    reset_token            VARCHAR(128)   DEFAULT NULL,
    reset_token_expiry     DATETIME       DEFAULT NULL,
    stripe_subscription_id VARCHAR(128)   DEFAULT NULL,
    subscription_status    VARCHAR(50)    DEFAULT NULL,
    next_billing_date      DATETIME       DEFAULT NULL,
    daypass_ends           DATETIME       DEFAULT NULL,
    created_at             DATETIME       DEFAULT CURRENT_TIMESTAMP,
    updated_at             DATETIME       DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS day_passes (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id     INT UNSIGNED          NOT NULL,
    event_id    VARCHAR(64)           NOT NULL,
    event_name  VARCHAR(255)          NOT NULL,
    event_date  VARCHAR(64)           NOT NULL,
    created_at  DATETIME    DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_day_pass (user_id, event_id),
    CONSTRAINT fk_day_pass_user
        FOREIGN KEY (user_id)
        REFERENCES users (id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
