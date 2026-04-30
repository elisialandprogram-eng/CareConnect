import { Pool } from "pg";

const databaseUrl = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL not set");
const pool = new Pool({ connectionString: databaseUrl, max: 4 });

const BASE = process.env.AUDIT_BASE_URL || "http://localhost:5000";

type ApiResp = { status: number; body: any; raw?: string };
async function api(path: string, opts: RequestInit = {}, token?: string): Promise<ApiResp> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((opts.headers as any) || {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(BASE + path, { ...opts, headers });
  const text = await res.text();
  let body: any;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body, raw: text };
}

async function sql(text: string, params: any[] = []) {
  const r = await pool.query(text, params);
  return r.rows;
}

const findings: any[] = [];
function record(test: string, ok: boolean, details: string, severity: "info" | "warn" | "high" | "critical" = "info") {
  findings.push({ test, ok, severity, details });
  const tag = ok ? "✔" : (severity === "critical" ? "❌" : severity === "high" ? "⚠" : "•");
  console.log(`${tag} [${test}] ${details}`);
}

async function makeUser(role: "patient" | "provider", country: "HU" | "IR", label: string) {
  const email = `audit-${label}-${Date.now()}-${Math.floor(Math.random() * 9999)}@example.com`;
  const reg = await api("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email,
      password: "Password123!",
      firstName: label.toUpperCase(),
      lastName: "Test",
      role,
      countryCode: country,
    }),
  });
  if (reg.status !== 201) throw new Error(`register failed for ${label}: ${reg.status} ${JSON.stringify(reg.body)}`);
  const userId = reg.body.user.id;
  // Mark verified directly
  await sql(`UPDATE users SET is_email_verified = true WHERE id = $1`, [userId]);
  // For providers we need to flip status to active so login passes
  if (role === "provider") {
    // Provider record may not auto-create on register — create one
    const existing = await sql(`SELECT id FROM providers WHERE user_id = $1`, [userId]);
    let providerId: string;
    if (existing.length === 0) {
      const ins = await sql(
        `INSERT INTO providers (user_id, provider_type, country_code, status, is_verified, consultation_fee, home_visit_fee)
         VALUES ($1, 'doctor', $2, 'active', true, 50, 80) RETURNING id`,
        [userId, country],
      );
      providerId = ins[0].id;
    } else {
      providerId = existing[0].id;
      await sql(`UPDATE providers SET status='active', country_code=$2, is_verified=true WHERE id=$1`, [providerId, country]);
    }
    return { email, userId, providerId };
  }
  return { email, userId };
}

async function login(email: string) {
  const r = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password: "Password123!" }),
  });
  if (r.status !== 200) throw new Error(`login failed for ${email}: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.accessToken as string;
}

async function main() {
  console.log(`\n=== AUDIT START — base ${BASE} ===\n`);

  // Cleanup any prior audit data. Ordered top-down through the FK graph so
  // child rows are removed before their parents. Each statement is wrapped in
  // catch() so a missing table (e.g. across schema versions) is non-fatal.
  const cte = `WITH au AS (SELECT id FROM users WHERE email LIKE 'audit-%@example.com'), ap AS (SELECT id FROM providers WHERE user_id IN (SELECT id FROM au))`;
  const ordered: Array<[string, string]> = [
    // Deepest leaves first.
    ["payments", `${cte} DELETE FROM payments WHERE patient_id IN (SELECT id FROM au) OR appointment_id IN (SELECT id FROM appointments WHERE patient_id IN (SELECT id FROM au) OR provider_id IN (SELECT id FROM ap))`],
    ["invoice_items", `${cte} DELETE FROM invoice_items WHERE invoice_id IN (SELECT id FROM invoices WHERE patient_id IN (SELECT id FROM au) OR provider_id IN (SELECT id FROM ap))`],
    ["invoices", `${cte} DELETE FROM invoices WHERE patient_id IN (SELECT id FROM au) OR provider_id IN (SELECT id FROM ap)`],
    ["appointment_events", `${cte} DELETE FROM appointment_events WHERE actor_user_id IN (SELECT id FROM au) OR appointment_id IN (SELECT id FROM appointments WHERE patient_id IN (SELECT id FROM au) OR provider_id IN (SELECT id FROM ap))`],
    ["appointments", `${cte} DELETE FROM appointments WHERE patient_id IN (SELECT id FROM au) OR provider_id IN (SELECT id FROM ap)`],
    ["service_requests", `${cte} DELETE FROM service_requests WHERE provider_id IN (SELECT id FROM ap)`],
    ["services", `${cte} DELETE FROM services WHERE provider_id IN (SELECT id FROM ap)`],
    ["time_slots", `${cte} DELETE FROM time_slots WHERE provider_id IN (SELECT id FROM ap)`],
    ["provider_pricing_overrides", `${cte} DELETE FROM provider_pricing_overrides WHERE provider_id IN (SELECT id FROM ap)`],
    ["provider_time_off", `${cte} DELETE FROM provider_time_off WHERE provider_id IN (SELECT id FROM ap)`],
    ["provider_earnings", `${cte} DELETE FROM provider_earnings WHERE provider_id IN (SELECT id FROM ap)`],
    ["reviews", `${cte} DELETE FROM reviews WHERE provider_id IN (SELECT id FROM ap) OR patient_id IN (SELECT id FROM au)`],
    ["saved_providers", `${cte} DELETE FROM saved_providers WHERE provider_id IN (SELECT id FROM ap) OR patient_id IN (SELECT id FROM au)`],
    ["service_packages", `${cte} DELETE FROM service_packages WHERE provider_id IN (SELECT id FROM ap)`],
    ["waitlist_entries", `${cte} DELETE FROM waitlist_entries WHERE provider_id IN (SELECT id FROM ap)`],
    ["medical_history", `${cte} DELETE FROM medical_history WHERE provider_id IN (SELECT id FROM ap) OR patient_id IN (SELECT id FROM au)`],
    ["prescriptions", `${cte} DELETE FROM prescriptions WHERE provider_id IN (SELECT id FROM ap)`],
    ["medical_practitioners", `${cte} DELETE FROM medical_practitioners WHERE provider_id IN (SELECT id FROM ap)`],
    ["practitioners", `${cte} DELETE FROM practitioners WHERE provider_id IN (SELECT id FROM ap)`],
    ["providers", `DELETE FROM providers WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'audit-%@example.com')`],
    // Now user-only references.
    ["audit_logs", `DELETE FROM audit_logs WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'audit-%@example.com') OR entity_id IN (SELECT id FROM users WHERE email LIKE 'audit-%@example.com')`],
    ["refresh_tokens", `DELETE FROM refresh_tokens WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'audit-%@example.com')`],
    ["notification_queue", `DELETE FROM notification_queue WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'audit-%@example.com')`],
    ["notifications", `DELETE FROM notifications WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'audit-%@example.com')`],
    ["user_notifications", `DELETE FROM user_notifications WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'audit-%@example.com')`],
    ["notification_preferences", `DELETE FROM notification_preferences WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'audit-%@example.com')`],
    ["notification_delivery_logs", `DELETE FROM notification_delivery_logs WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'audit-%@example.com')`],
    ["push_subscriptions", `DELETE FROM push_subscriptions WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'audit-%@example.com')`],
    ["patient_consents", `DELETE FROM patient_consents WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'audit-%@example.com')`],
    ["conversations", `DELETE FROM conversations WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'audit-%@example.com')`],
    ["users", `DELETE FROM users WHERE email LIKE 'audit-%@example.com'`],
  ];
  for (const [name, q] of ordered) {
    await sql(q).catch((e) => console.warn(`[cleanup ${name}] ${e.message}`));
  }

  // 1. Test data setup
  const huPatient = await makeUser("patient", "HU", "hu-pat");
  const irPatient = await makeUser("patient", "IR", "ir-pat");
  const huProv = await makeUser("provider", "HU", "hu-prov");
  const irProv = await makeUser("provider", "IR", "ir-prov");
  record("1.setup", true, `created HU/IR patients & providers (HUprov=${huProv.providerId}, IRprov=${irProv.providerId})`);

  // Add one service per provider
  const huSubServices = await sql(`SELECT id FROM sub_services LIMIT 1`);
  const irSubServices = huSubServices; // share — sub_services are global templates
  let huServiceId: string | null = null;
  let irServiceId: string | null = null;
  if (huSubServices.length > 0) {
    const ssId = huSubServices[0].id;
    const a = await sql(
      `INSERT INTO services (provider_id, sub_service_id, name, description, price, duration, is_active, country_code)
       VALUES ($1,$2,'HU Test Service','desc',50,30,true,'HU') RETURNING id`,
      [huProv.providerId, ssId],
    );
    huServiceId = a[0].id;
    const b = await sql(
      `INSERT INTO services (provider_id, sub_service_id, name, description, price, duration, is_active, country_code)
       VALUES ($1,$2,'IR Test Service','desc',50,30,true,'IR') RETURNING id`,
      [irProv.providerId, ssId],
    );
    irServiceId = b[0].id;
  }

  const huPatientToken = await login(huPatient.email);
  const irPatientToken = await login(irPatient.email);
  const huProvToken = await login(huProv.email);
  const irProvToken = await login(irProv.email);

  // 2. Visibility test
  const huPatProvList = await api("/api/providers", {}, huPatientToken);
  const irPatProvList = await api("/api/providers", {}, irPatientToken);
  const huHasIr = (huPatProvList.body as any[]).some(p => p.countryCode === "IR");
  const irHasHu = (irPatProvList.body as any[]).some(p => p.countryCode === "HU");
  record("2.visibility.providers.hu", !huHasIr, `HU patient sees ${huPatProvList.body.length} providers; IR leak=${huHasIr}`,
    huHasIr ? "high" : "info");
  record("2.visibility.providers.ir", !irHasHu, `IR patient sees ${irPatProvList.body.length} providers; HU leak=${irHasHu}`,
    irHasHu ? "high" : "info");

  // 3. Booking validation — HU patient tries to book IR provider
  const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
  const crossBook = await api("/api/appointments", {
    method: "POST",
    body: JSON.stringify({
      providerId: irProv.providerId,
      serviceId: irServiceId,
      date: tomorrow,
      startTime: "10:00",
      endTime: "10:30",
      visitType: "online",
      paymentMethod: "cash",
    }),
  }, huPatientToken);
  const blockedCross = crossBook.status === 404 || crossBook.status === 403;
  record("3.booking.cross-country", blockedCross,
    `HU→IR booking returned ${crossBook.status}: ${JSON.stringify(crossBook.body).slice(0, 120)}`,
    blockedCross ? "info" : "critical");

  // Same-country booking should succeed
  const sameBook = await api("/api/appointments", {
    method: "POST",
    body: JSON.stringify({
      providerId: huProv.providerId,
      serviceId: huServiceId,
      date: tomorrow,
      startTime: "11:00",
      endTime: "11:30",
      visitType: "online",
      paymentMethod: "cash",
    }),
  }, huPatientToken);
  record("3.booking.same-country", sameBook.status === 200 || sameBook.status === 201,
    `HU→HU booking returned ${sameBook.status}: ${JSON.stringify(sameBook.body).slice(0, 200)}`);
  let huAppointmentId: string | null = (sameBook.body as any)?.appointment?.id || (sameBook.body as any)?.id || null;

  // Same-country + cross-service-country: HU patient/HU provider but IR service
  // Must be rejected if validation enforces service.country_code === patient.country_code
  if (irServiceId) {
    const mismatched = await api("/api/appointments", {
      method: "POST",
      body: JSON.stringify({
        providerId: huProv.providerId, // HU
        serviceId: irServiceId,        // IR — mismatched
        date: tomorrow,
        startTime: "12:00",
        endTime: "12:30",
        visitType: "online",
        paymentMethod: "cash",
      }),
    }, huPatientToken);
    const blockedSvc = mismatched.status >= 400;
    record("3.booking.svc-mismatch", blockedSvc,
      `HU patient + HU provider + IR service → ${mismatched.status}: ${JSON.stringify(mismatched.body).slice(0, 160)}`,
      blockedSvc ? "info" : "critical");
  }

  // 4. API security — cross-country fetch by ID
  // HU patient tries to GET the IR provider
  const apiCross = await api(`/api/providers/${irProv.providerId}`, {}, huPatientToken);
  const apiBlocked = apiCross.status === 404;
  record("4.api.cross-country-get", apiBlocked,
    `HU patient → GET IR provider returned ${apiCross.status} (should be 404)`,
    apiBlocked ? "info" : "high");

  // 5. Admin isolation — create country admins
  // Make a country_admin for HU and IR by direct DB update
  const huAdmin = await makeUser("patient", "HU", "hu-admin"); // create as patient then promote
  const irAdmin = await makeUser("patient", "IR", "ir-admin");
  await sql(`UPDATE users SET role='country_admin' WHERE id=$1`, [huAdmin.userId]);
  await sql(`UPDATE users SET role='country_admin' WHERE id=$1`, [irAdmin.userId]);
  const huAdminToken = await login(huAdmin.email);
  const irAdminToken = await login(irAdmin.email);

  const huAdminUsers = await api(`/api/admin/users`, {}, huAdminToken);
  const irAdminUsers = await api(`/api/admin/users`, {}, irAdminToken);
  if (Array.isArray(huAdminUsers.body)) {
    const irLeak = huAdminUsers.body.filter((u: any) => u.countryCode === "IR").length;
    record("5.admin.users.hu-scope", irLeak === 0, `HU country_admin /admin/users sees ${huAdminUsers.body.length} (IR leak=${irLeak})`,
      irLeak > 0 ? "high" : "info");
  } else {
    record("5.admin.users.hu-scope", false, `HU country_admin /admin/users → ${huAdminUsers.status}: ${JSON.stringify(huAdminUsers.body).slice(0, 120)}`, "high");
  }
  if (Array.isArray(irAdminUsers.body)) {
    const huLeak = irAdminUsers.body.filter((u: any) => u.countryCode === "HU").length;
    record("5.admin.users.ir-scope", huLeak === 0, `IR country_admin /admin/users sees ${irAdminUsers.body.length} (HU leak=${huLeak})`,
      huLeak > 0 ? "high" : "info");
  } else {
    record("5.admin.users.ir-scope", false, `IR country_admin /admin/users → ${irAdminUsers.status}`, "high");
  }

  const huAdminBookings = await api(`/api/admin/bookings`, {}, huAdminToken);
  if (Array.isArray(huAdminBookings.body)) {
    const irLeak = huAdminBookings.body.filter((b: any) => b.countryCode === "IR").length;
    record("5.admin.bookings.hu-scope", irLeak === 0,
      `HU country_admin /admin/bookings sees ${huAdminBookings.body.length} (IR leak=${irLeak})`,
      irLeak > 0 ? "high" : "info");
  }

  // 6. Service request — HU provider submits a request
  const reqRes = await api(`/api/provider/service-requests`, {
    method: "POST",
    body: JSON.stringify({
      category: "Test",
      serviceName: "Test Service Audit",
      subServiceName: "Audit Sub",
      suggestedPrice: 25,
      description: "audit",
      locationMode: "both",
    }),
  }, huProvToken);
  // The audit endpoint may live elsewhere; if 404, try alternative
  let serviceRequestId: string | null = null;
  if (reqRes.status === 200 || reqRes.status === 201) {
    serviceRequestId = (reqRes.body as any).id || (reqRes.body as any).request?.id;
  }
  record("6.service-request.create", reqRes.status < 400,
    `HU provider service-request POST → ${reqRes.status}`);

  // Verify service_requests carry country
  const srRows = await sql(`SELECT id, country_code FROM service_requests WHERE provider_id = $1`, [huProv.providerId]);
  const allHu = srRows.length > 0 && srRows.every(r => r.country_code === "HU");
  record("6.service-request.country-code", allHu,
    `service_requests for HU provider all carry HU? ${allHu} (${srRows.length} rows)`);

  // 7. Data consistency — verify appointments/payments carry country
  const apptRows = await sql(`SELECT id, country_code FROM appointments WHERE patient_id = $1`, [huPatient.userId]);
  const apptOk = apptRows.length === 0 || apptRows.every(a => a.country_code === "HU");
  record("7.consistency.appointments", apptOk,
    `HU patient appointments all carry HU? ${apptOk} (${apptRows.length} rows)`,
    apptOk ? "info" : "high");
  const payRows = await sql(`SELECT id, country_code FROM payments WHERE patient_id = $1`, [huPatient.userId]);
  const payOk = payRows.length === 0 || payRows.every(p => p.country_code === "HU");
  record("7.consistency.payments", payOk,
    `HU patient payments all carry HU? ${payOk} (${payRows.length} rows)`,
    payOk ? "info" : "high");

  // Backfill / NULL check at table level
  for (const t of ["users", "providers", "services", "appointments", "invoices", "payments", "service_requests"]) {
    const nullRows = await sql(`SELECT COUNT(*)::int AS n FROM ${t} WHERE country_code IS NULL`);
    record(`9.constraint.${t}.not_null`, nullRows[0].n === 0,
      `${t}.country_code NULL count = ${nullRows[0].n}`,
      nullRows[0].n > 0 ? "high" : "info");
  }

  // 8. Edge case — try to change country after a booking exists
  const changeAttempt = await api(`/api/auth/profile`, {
    method: "PATCH",
    body: JSON.stringify({ countryCode: "IR" }),
  }, huPatientToken);
  record("8.edge.country-change-with-bookings", changeAttempt.status >= 400,
    `HU patient with appointments tries to switch to IR → ${changeAttempt.status}: ${JSON.stringify(changeAttempt.body).slice(0,160)}`,
    changeAttempt.status < 400 ? "high" : "info");

  // 8b. Cross-country appointment access — IR patient tries to GET HU appointment
  if (huAppointmentId) {
    const crossAppt = await api(`/api/appointments/${huAppointmentId}`, {}, irPatientToken);
    record("8.edge.foreign-appt-access", crossAppt.status === 404 || crossAppt.status === 403,
      `IR patient → GET HU appointment ${huAppointmentId} returned ${crossAppt.status}`,
      crossAppt.status >= 400 ? "info" : "critical");
  }

  // 8c. Global-admin country migration tool — make a global admin, exercise
  //     the new migration endpoint and re-verify tenancy on the moved rows.
  const gAdmin = await makeUser("patient", "HU", "g-admin");
  await sql(`UPDATE users SET role='global_admin' WHERE id=$1`, [gAdmin.userId]);
  const gAdminToken = await login(gAdmin.email);

  // 1) Country admins must NOT be able to call the migration endpoint.
  const countryAdminAttempt = await api(`/api/admin/users/${huPatient.userId}/migrate-country`, {
    method: "POST",
    body: JSON.stringify({ targetCountryCode: "IR", reason: "should be denied" }),
  }, huAdminToken);
  record("8c.migrate.country-admin-denied", countryAdminAttempt.status === 403,
    `country_admin → migrate endpoint returned ${countryAdminAttempt.status} (want 403)`,
    countryAdminAttempt.status === 403 ? "info" : "critical");

  // 2) Bad payloads — missing reason, invalid country.
  const noReason = await api(`/api/admin/users/${huPatient.userId}/migrate-country`, {
    method: "POST",
    body: JSON.stringify({ targetCountryCode: "IR" }),
  }, gAdminToken);
  record("8c.migrate.requires-reason", noReason.status === 400,
    `missing reason → ${noReason.status} (want 400)`,
    noReason.status === 400 ? "info" : "high");

  const badCountry = await api(`/api/admin/users/${huPatient.userId}/migrate-country`, {
    method: "POST",
    body: JSON.stringify({ targetCountryCode: "ZZ", reason: "invalid country test" }),
  }, gAdminToken);
  record("8c.migrate.invalid-country", badCountry.status === 400,
    `invalid country → ${badCountry.status} (want 400)`,
    badCountry.status === 400 ? "info" : "high");

  // 3) Refuse to migrate admin accounts.
  const adminTarget = await api(`/api/admin/users/${huAdmin.userId}/migrate-country`, {
    method: "POST",
    body: JSON.stringify({ targetCountryCode: "IR", reason: "should refuse for admins" }),
  }, gAdminToken);
  record("8c.migrate.admin-refused", adminTarget.status === 400,
    `migrating an admin account → ${adminTarget.status} (want 400)`,
    adminTarget.status === 400 ? "info" : "high");

  // 4) Happy path — migrate the HU patient (with their existing appointment) to IR.
  const beforeAppt = await sql(`SELECT country_code FROM appointments WHERE patient_id=$1`, [huPatient.userId]);
  const beforePay = await sql(`SELECT country_code FROM payments WHERE patient_id=$1`, [huPatient.userId]);
  const beforeUser = (await sql(`SELECT country_code FROM users WHERE id=$1`, [huPatient.userId]))[0];
  const migrate = await api(`/api/admin/users/${huPatient.userId}/migrate-country`, {
    method: "POST",
    body: JSON.stringify({ targetCountryCode: "IR", reason: "auditor verifying tenancy migration tool" }),
  }, gAdminToken);
  const afterUser = (await sql(`SELECT country_code FROM users WHERE id=$1`, [huPatient.userId]))[0];
  const afterAppt = await sql(`SELECT country_code FROM appointments WHERE patient_id=$1`, [huPatient.userId]);
  const afterPay = await sql(`SELECT country_code FROM payments WHERE patient_id=$1`, [huPatient.userId]);
  const userMoved = beforeUser.country_code === "HU" && afterUser.country_code === "IR";
  const apptMoved = afterAppt.length === 0 || afterAppt.every((r: any) => r.country_code === "IR");
  const payMoved = afterPay.length === 0 || afterPay.every((r: any) => r.country_code === "IR");
  record("8c.migrate.happy-path",
    migrate.status === 200 && userMoved && apptMoved && payMoved,
    `migrate HU→IR: status=${migrate.status} user=${beforeUser.country_code}→${afterUser.country_code} appts=${beforeAppt.length}→IR(${apptMoved}) payments=${beforePay.length}→IR(${payMoved})`,
    migrate.status === 200 && userMoved && apptMoved && payMoved ? "info" : "critical");

  // 5) Idempotency — calling again with same target returns 409.
  const dupe = await api(`/api/admin/users/${huPatient.userId}/migrate-country`, {
    method: "POST",
    body: JSON.stringify({ targetCountryCode: "IR", reason: "second call should 409" }),
  }, gAdminToken);
  record("8c.migrate.no-op-409", dupe.status === 409,
    `re-migrating to same country → ${dupe.status} (want 409)`,
    dupe.status === 409 ? "info" : "warn");

  // 6) Audit log entry was written.
  const auditRow = await sql(
    `SELECT id, action, entity_type, details FROM audit_logs WHERE entity_type='user_country_migration' AND entity_id=$1 ORDER BY created_at DESC LIMIT 1`,
    [huPatient.userId],
  );
  const auditOk = auditRow.length === 1 && auditRow[0].details && (auditRow[0].details as string).includes("auditor verifying");
  record("8c.migrate.audit-logged", auditOk,
    `audit_logs row for migration present? ${auditOk}`,
    auditOk ? "info" : "high");

  // 9. DB hardening — check indexes
  const idxRows = await sql(`
    SELECT t.relname AS table_name, i.relname AS index_name
    FROM pg_class t JOIN pg_index ix ON ix.indrelid = t.oid
    JOIN pg_class i ON i.oid = ix.indexrelid
    WHERE t.relkind='r' AND i.relname LIKE 'idx_%country_code%'
    ORDER BY 1,2`);
  const have = new Set(idxRows.map((r: any) => `${r.table_name}.${r.index_name}`));
  const expectIndexed = ["users", "providers", "services", "appointments", "invoices", "payments", "service_requests"];
  for (const t of expectIndexed) {
    const present = idxRows.some((r: any) => r.table_name === t);
    record(`9.index.${t}`, present,
      `index on ${t}.country_code present? ${present}`,
      present ? "info" : "warn");
  }

  // 10. Final summary
  console.log(`\n=== AUDIT FINISHED — ${findings.filter(f=>!f.ok).length} failing checks of ${findings.length} ===\n`);
  console.log(JSON.stringify({ findings }, null, 2));
  await pool.end();
}

main().catch(async e => {
  console.error("AUDIT ERROR:", e);
  await pool.end();
  process.exit(1);
});
