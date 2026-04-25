import { pool } from "../server/db";

const SQL = `
-- users.languagePreference
ALTER TABLE users ADD COLUMN IF NOT EXISTS language_preference text DEFAULT 'en';

-- realtime_conversations: muted/pinned arrays
ALTER TABLE realtime_conversations
  ADD COLUMN IF NOT EXISTS muted_by text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS pinned_by text[] NOT NULL DEFAULT '{}'::text[];

-- realtime_messages: read receipts + attachments + voice notes
ALTER TABLE realtime_messages
  ADD COLUMN IF NOT EXISTS read_at timestamp,
  ADD COLUMN IF NOT EXISTS attachment_url text,
  ADD COLUMN IF NOT EXISTS attachment_type text,
  ADD COLUMN IF NOT EXISTS attachment_name text,
  ADD COLUMN IF NOT EXISTS voice_note_url text,
  ADD COLUMN IF NOT EXISTS voice_duration_sec integer;

-- notification_preferences
CREATE TABLE IF NOT EXISTS notification_preferences (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL UNIQUE REFERENCES users(id),
  email_enabled boolean NOT NULL DEFAULT true,
  sms_enabled boolean NOT NULL DEFAULT false,
  whatsapp_enabled boolean NOT NULL DEFAULT false,
  push_enabled boolean NOT NULL DEFAULT true,
  in_app_enabled boolean NOT NULL DEFAULT true,
  event_overrides text,
  quiet_hours_start text,
  quiet_hours_end text,
  email_digest text NOT NULL DEFAULT 'off',
  language text DEFAULT 'en',
  updated_at timestamp DEFAULT now()
);

-- push_subscriptions
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id),
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth_key text NOT NULL,
  user_agent text,
  created_at timestamp DEFAULT now()
);

-- video_sessions
CREATE TABLE IF NOT EXISTS video_sessions (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id varchar NOT NULL UNIQUE REFERENCES appointments(id),
  provider text NOT NULL DEFAULT 'stub',
  room_url text NOT NULL,
  room_name text,
  patient_token text,
  provider_token text,
  expires_at timestamp,
  started_at timestamp,
  ended_at timestamp,
  created_at timestamp DEFAULT now()
);

-- provider_office_hours
CREATE TABLE IF NOT EXISTS provider_office_hours (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_user_id varchar NOT NULL UNIQUE REFERENCES users(id),
  weekly_schedule text,
  timezone text DEFAULT 'UTC',
  auto_reply_enabled boolean NOT NULL DEFAULT false,
  auto_reply_message text DEFAULT 'Thanks for your message. I''m currently outside my office hours and will reply as soon as possible.',
  emergency_contact text,
  updated_at timestamp DEFAULT now()
);

-- notification_delivery_logs
CREATE TABLE IF NOT EXISTS notification_delivery_logs (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id),
  event_key text NOT NULL,
  channel text NOT NULL,
  status text NOT NULL,
  external_id text,
  error_message text,
  payload text,
  created_at timestamp DEFAULT now()
);

-- admin_broadcasts
CREATE TABLE IF NOT EXISTS admin_broadcasts (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id varchar NOT NULL REFERENCES users(id),
  title text NOT NULL,
  message text NOT NULL,
  audience text NOT NULL DEFAULT 'all',
  channels text[] NOT NULL DEFAULT '{in_app}'::text[],
  recipient_count integer DEFAULT 0,
  created_at timestamp DEFAULT now()
);
`;

(async () => {
  try {
    await pool.query(SQL);
    console.log("✓ comms migration applied");
  } catch (e) {
    console.error("✗ migration failed:", e);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
