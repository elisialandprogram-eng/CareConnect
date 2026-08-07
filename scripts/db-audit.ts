import { pool } from "../server/db";

const q = async (sql: string, label: string) => {
  try {
    const r = await pool.query(sql);
    return r.rows;
  } catch(e: any) {
    console.error(`ERROR [${label}]:`, e.message);
    return [];
  }
};

async function main() {
  // Reconcile findings
  const findings = await q(`
    SELECT check_type, severity, COUNT(*) cnt, MAX(message) sample
    FROM reconciliation_results
    WHERE run_at >= NOW() - INTERVAL '3 hours' AND severity != 'ok'
    GROUP BY check_type, severity ORDER BY cnt DESC
  `, "findings");
  console.log("=RECONCILE_FINDINGS=");
  findings.forEach((r: any) => console.log(JSON.stringify(r)));

  // All tables
  const tables = await q(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`, "tables");
  console.log("\n=TABLES=", tables.map((r:any)=>r.table_name).join(', '));

  // Missing tables check
  const missing = await q(`
    SELECT t FROM (VALUES
      ('reconciliation_results'),('marketplace_ledger'),('provider_wallets'),('provider_ledger'),
      ('platform_events'),('monitoring_daily_summary'),('financial_alerts'),
      ('login_attempts'),('password_history'),('clinic_rooms'),('room_reservations'),
      ('appointment_consents'),('patient_notes'),('intake_responses'),
      ('privacy_requests'),('idempotency_keys'),('refresh_tokens'),
      ('saved_addresses'),('rate_limit_hits'),('reconciliation_results'),
      ('provider_schedule_overrides'),('provider_schedule_templates')
    ) AS x(t)
    WHERE NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=x.t)
  `, "missing_tables");
  console.log("\n=MISSING_TABLES=", missing.map((r:any)=>r.t).join(', ') || 'none');

  // Appointments columns
  const apptCols = await q(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='appointments' ORDER BY ordinal_position`, "appt_cols");
  console.log("\n=APPT_COLS=", apptCols.map((r:any)=>r.column_name).join(', '));

  // Sub_services columns
  const ssCols = await q(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='sub_services' ORDER BY ordinal_position`, "ss_cols");
  console.log("\n=SS_COLS=", ssCols.map((r:any)=>r.column_name).join(', '));

  // Service_requests columns
  const srCols = await q(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='service_requests' ORDER BY ordinal_position`, "sr_cols");
  console.log("\n=SR_COLS=", srCols.map((r:any)=>r.column_name).join(', '));

  // Providers columns
  const provCols = await q(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='providers' ORDER BY ordinal_position`, "prov_cols");
  console.log("\n=PROV_COLS=", provCols.map((r:any)=>r.column_name).join(', '));

  // Payments columns
  const payCols = await q(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='payments' ORDER BY ordinal_position`, "pay_cols");
  console.log("\n=PAY_COLS=", payCols.map((r:any)=>r.column_name).join(', '));

  // Marketplace ledger columns
  const mlCols = await q(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='marketplace_ledger' ORDER BY ordinal_position`, "ml_cols");
  console.log("\n=ML_COLS=", mlCols.map((r:any)=>r.column_name).join(', '));

  // Count reconcile data
  const counts = await q(`
    SELECT
      (SELECT COUNT(*) FROM appointments WHERE status='completed' AND total_amount::numeric>0) as completed_with_amount,
      (SELECT COUNT(*) FROM marketplace_ledger) as ledger_rows,
      (SELECT COUNT(*) FROM payments WHERE status='completed') as completed_payments,
      (SELECT COUNT(*) FROM appointments WHERE status='completed' AND total_amount::numeric>0
        AND NOT EXISTS (SELECT 1 FROM marketplace_ledger ml WHERE ml.appointment_id = appointments.id)) as missing_ledger,
      (SELECT COUNT(*) FROM payments WHERE status='completed' AND appointment_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM marketplace_ledger ml WHERE ml.appointment_id = payments.appointment_id)) as orphaned_pay
  `, "counts");
  console.log("\n=COUNTS=", JSON.stringify(counts[0]));

  // Check catalog.routes scheduled_at — does appointments.scheduled_at exist?
  const schedCol = await q(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='appointments' AND column_name='scheduled_at'
  `, "scheduled_at_check");
  console.log("\n=APPT_SCHEDULED_AT_EXISTS=", schedCol.length > 0 ? "YES" : "NO");

  // Check all provider columns needed
  const provCheck = await q(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='providers'
    AND column_name IN ('latitude','longitude','city','country_code','home_visit_enabled','max_travel_distance_km','clinic_address_line1')
  `, "prov_geo_cols");
  console.log("\n=PROV_GEO_COLS=", provCheck.map((r:any)=>r.column_name).join(', '));

  process.exit(0);
}
main().catch(e => { console.error("FATAL:", e); process.exit(1); });
