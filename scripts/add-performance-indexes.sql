-- Performance indexes added to speed up the most common queries.
-- Safe to run repeatedly: every statement uses IF NOT EXISTS.

-- providers
CREATE INDEX IF NOT EXISTS idx_providers_user_id        ON providers (user_id);
CREATE INDEX IF NOT EXISTS idx_providers_status         ON providers (status);
CREATE INDEX IF NOT EXISTS idx_providers_is_active      ON providers (is_active);
CREATE INDEX IF NOT EXISTS idx_providers_created_at     ON providers (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_providers_provider_type  ON providers (provider_type);

-- services
CREATE INDEX IF NOT EXISTS idx_services_provider_id     ON services (provider_id);
CREATE INDEX IF NOT EXISTS idx_services_sub_service_id  ON services (sub_service_id);
CREATE INDEX IF NOT EXISTS idx_services_is_active       ON services (is_active);

-- practitioners
CREATE INDEX IF NOT EXISTS idx_practitioners_provider_id ON practitioners (provider_id);

-- service_practitioners
CREATE INDEX IF NOT EXISTS idx_service_practitioners_service_id      ON service_practitioners (service_id);
CREATE INDEX IF NOT EXISTS idx_service_practitioners_practitioner_id ON service_practitioners (practitioner_id);

-- time_slots
CREATE INDEX IF NOT EXISTS idx_time_slots_provider_id        ON time_slots (provider_id);
CREATE INDEX IF NOT EXISTS idx_time_slots_provider_date      ON time_slots (provider_id, date);

-- appointments
CREATE INDEX IF NOT EXISTS idx_appointments_patient_id       ON appointments (patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_provider_id      ON appointments (provider_id);
CREATE INDEX IF NOT EXISTS idx_appointments_service_id       ON appointments (service_id);
CREATE INDEX IF NOT EXISTS idx_appointments_practitioner_id  ON appointments (practitioner_id);
CREATE INDEX IF NOT EXISTS idx_appointments_status           ON appointments (status);
CREATE INDEX IF NOT EXISTS idx_appointments_date             ON appointments (date);
CREATE INDEX IF NOT EXISTS idx_appointments_created_at       ON appointments (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_appointments_provider_date    ON appointments (provider_id, date);
CREATE INDEX IF NOT EXISTS idx_appointments_patient_created  ON appointments (patient_id, created_at DESC);

-- reviews
CREATE INDEX IF NOT EXISTS idx_reviews_provider_id     ON reviews (provider_id);
CREATE INDEX IF NOT EXISTS idx_reviews_patient_id      ON reviews (patient_id);
CREATE INDEX IF NOT EXISTS idx_reviews_appointment_id  ON reviews (appointment_id);
CREATE INDEX IF NOT EXISTS idx_reviews_provider_created ON reviews (provider_id, created_at DESC);

-- payments
CREATE INDEX IF NOT EXISTS idx_payments_appointment_id  ON payments (appointment_id);
CREATE INDEX IF NOT EXISTS idx_payments_patient_id      ON payments (patient_id);
CREATE INDEX IF NOT EXISTS idx_payments_status          ON payments (status);
CREATE INDEX IF NOT EXISTS idx_payments_created_at      ON payments (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_stripe_session  ON payments (stripe_session_id);

-- chat_conversations / chat_messages
CREATE INDEX IF NOT EXISTS idx_chat_conv_patient_id     ON chat_conversations (patient_id);
CREATE INDEX IF NOT EXISTS idx_chat_conv_provider_id    ON chat_conversations (provider_id);
CREATE INDEX IF NOT EXISTS idx_chat_conv_last_msg_at    ON chat_conversations (last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_msg_conversation_id ON chat_messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_msg_sender_id       ON chat_messages (sender_id);

-- conversations / messages (AI chat)
CREATE INDEX IF NOT EXISTS idx_conversations_user_id    ON conversations (user_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages (conversation_id, created_at);

-- refresh_tokens
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id    ON refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens (expires_at);

-- user_notifications
CREATE INDEX IF NOT EXISTS idx_user_notifications_user_id      ON user_notifications (user_id);
CREATE INDEX IF NOT EXISTS idx_user_notifications_user_unread  ON user_notifications (user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_user_notifications_created_at   ON user_notifications (created_at DESC);

-- audit_logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id     ON audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at  ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity      ON audit_logs (entity_type, entity_id);

-- support_tickets / ticket_messages
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id     ON support_tickets (user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned_to ON support_tickets (assigned_to);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status      ON support_tickets (status);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket_id   ON ticket_messages (ticket_id, created_at);

-- saved_providers
CREATE INDEX IF NOT EXISTS idx_saved_providers_patient_id  ON saved_providers (patient_id);
CREATE INDEX IF NOT EXISTS idx_saved_providers_provider_id ON saved_providers (provider_id);

-- prescriptions
CREATE INDEX IF NOT EXISTS idx_prescriptions_patient_id     ON prescriptions (patient_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_provider_id    ON prescriptions (provider_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_appointment_id ON prescriptions (appointment_id);

-- medical_history
CREATE INDEX IF NOT EXISTS idx_medical_history_patient_id  ON medical_history (patient_id);
CREATE INDEX IF NOT EXISTS idx_medical_history_provider_id ON medical_history (provider_id);

-- realtime_conversations / realtime_messages
CREATE INDEX IF NOT EXISTS idx_rt_conv_p1               ON realtime_conversations (participant1_id);
CREATE INDEX IF NOT EXISTS idx_rt_conv_p2               ON realtime_conversations (participant2_id);
CREATE INDEX IF NOT EXISTS idx_rt_conv_last_msg_at      ON realtime_conversations (last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_rt_msg_conversation      ON realtime_messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_rt_msg_sender_id         ON realtime_messages (sender_id);

-- notification_queue / notification_delivery_logs / push_subscriptions
CREATE INDEX IF NOT EXISTS idx_notification_queue_user_status ON notification_queue (user_id, status);
CREATE INDEX IF NOT EXISTS idx_notification_queue_status      ON notification_queue (status);
CREATE INDEX IF NOT EXISTS idx_ndl_user_id                    ON notification_delivery_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id     ON push_subscriptions (user_id);

-- announcements
CREATE INDEX IF NOT EXISTS idx_announcements_active_dates ON announcements (is_active, start_date);

-- provider_pricing_overrides
CREATE INDEX IF NOT EXISTS idx_pricing_overrides_provider ON provider_pricing_overrides (provider_id);

-- patient_consents
CREATE INDEX IF NOT EXISTS idx_patient_consents_user_id ON patient_consents (user_id);

-- video_sessions
CREATE INDEX IF NOT EXISTS idx_video_sessions_appointment_id ON video_sessions (appointment_id);

-- sub_services
CREATE INDEX IF NOT EXISTS idx_sub_services_category ON sub_services (category);

-- users (lookups by role)
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);

-- locations
CREATE INDEX IF NOT EXISTS idx_locations_city_country ON locations (city, country);

-- daily_metrics
CREATE INDEX IF NOT EXISTS idx_daily_metrics_date ON daily_metrics (date DESC);

-- blog_posts
CREATE INDEX IF NOT EXISTS idx_blog_posts_published ON blog_posts (is_published, published_at DESC);

-- faqs
CREATE INDEX IF NOT EXISTS idx_faqs_category_sort ON faqs (category, sort_order);

ANALYZE;
