import { pool } from "../db";

/**
 * Patient/provider direct chat is available only while they have an
 * appointment that is still upcoming or currently in progress. Support and
 * other non patient-provider conversations are not restricted by this rule.
 */
export async function canUseDirectPatientProviderChat(userAId: string, userBId: string): Promise<boolean> {
  const { rows } = await pool.query<{
    direct_pair: boolean;
    active_booking: boolean;
  }>(
    `SELECT
       (
         (u1.role::text = 'patient' AND u2.role::text = 'provider')
         OR
         (u1.role::text = 'provider' AND u2.role::text = 'patient')
       ) AS direct_pair,
       EXISTS (
         SELECT 1
         FROM appointments a
         JOIN providers p ON p.id = a.provider_id
         WHERE (
           (a.patient_id = $1 AND p.user_id = $2)
           OR
           (a.patient_id = $2 AND p.user_id = $1)
         )
         AND a.status::text IN (
           'pending', 'approved', 'confirmed', 'in_progress',
           'rescheduled', 'reschedule_requested', 'reschedule_proposed'
         )
         AND (
           a.status::text = 'in_progress'
           OR COALESCE(
             a.start_at,
             (a.date || ' ' || a.start_time)::timestamptz
           ) >= CURRENT_TIMESTAMP
         )
       ) AS active_booking
     FROM users u1
     CROSS JOIN users u2
     WHERE u1.id = $1 AND u2.id = $2`,
    [userAId, userBId],
  );

  const row = rows[0];
  if (!row || !row.direct_pair) return true;
  return row.active_booking;
}