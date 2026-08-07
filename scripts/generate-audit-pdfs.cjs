
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// ─── Colour palette ───────────────────────────────────────────────────────────
const C = {
  navy:    '#1B2B4B',
  blue:    '#2563EB',
  teal:    '#0EA5E9',
  green:   '#16A34A',
  yellow:  '#CA8A04',
  orange:  '#EA580C',
  red:     '#DC2626',
  gray:    '#6B7280',
  lgray:   '#F3F4F6',
  white:   '#FFFFFF',
  black:   '#111827',
};

// ─── Status colours ───────────────────────────────────────────────────────────
function statusColor(s) {
  const map = { working:'#16A34A', partial:'#CA8A04', broken:'#DC2626', missing:'#DC2626', critical:'#DC2626', high:'#EA580C', medium:'#CA8A04', low:'#16A34A' };
  return map[s] || C.gray;
}

// ─── Helper: draw a filled rounded rect ──────────────────────────────────────
function roundRect(doc, x, y, w, h, r, fill) {
  doc.save().roundedRect(x, y, w, h, r).fill(fill).restore();
}

// ─── Helper: badge ────────────────────────────────────────────────────────────
function badge(doc, x, y, text, color) {
  const pad = 4, fsize = 7;
  doc.font('Helvetica-Bold').fontSize(fsize);
  const tw = doc.widthOfString(text);
  roundRect(doc, x, y, tw + pad * 2, 11, 3, color);
  doc.fill(C.white).text(text, x + pad, y + 2, { lineBreak: false });
  doc.fill(C.black);
  return tw + pad * 2 + 4;
}

// ─── Helper: section header ───────────────────────────────────────────────────
function sectionHeader(doc, title, sub) {
  doc.moveDown(0.6);
  roundRect(doc, 40, doc.y, 515, 22, 3, C.navy);
  doc.font('Helvetica-Bold').fontSize(11).fill(C.white)
     .text(title, 48, doc.y + 5, { lineBreak: false });
  if (sub) {
    doc.font('Helvetica').fontSize(8).fill('#B0BEC5')
       .text('  ' + sub, { lineBreak: false });
  }
  doc.fill(C.black).moveDown(0.3);
}

// ─── Helper: mini header (inside section) ─────────────────────────────────────
function miniHeader(doc, title) {
  doc.moveDown(0.3);
  doc.font('Helvetica-Bold').fontSize(9).fill(C.navy).text(title);
  doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor(C.teal).lineWidth(0.5).stroke();
  doc.fill(C.black).moveDown(0.15);
}

// ─── Helper: key-value line ───────────────────────────────────────────────────
function kvLine(doc, key, val, color) {
  const y = doc.y;
  doc.font('Helvetica-Bold').fontSize(8).fill(C.navy).text(key + ':', 48, y, { continued: true, lineBreak: false });
  doc.font('Helvetica').fontSize(8).fill(color || C.black).text('  ' + val, { lineBreak: false });
  doc.fill(C.black).moveDown(0.25);
}

// ─── Helper: bullet item ─────────────────────────────────────────────────────
function bullet(doc, text, indent, color) {
  indent = indent || 48;
  doc.font('Helvetica').fontSize(8).fill(color || C.black)
     .text('• ' + text, indent, doc.y, { width: 500 - (indent - 48) });
  doc.moveDown(0.1);
}

// ─── Helper: issue card ───────────────────────────────────────────────────────
function issueCard(doc, id, severity, title, detail, fix) {
  checkPage(doc, 70);
  const col = statusColor(severity);
  const y0 = doc.y;
  roundRect(doc, 48, y0, 507, 3, 0, col);
  doc.moveDown(0.1);
  roundRect(doc, 48, doc.y, 507, 1, 0, C.lgray);
  doc.y = doc.y + 1;
  const yStart = doc.y;
  // ID + severity badge
  doc.font('Helvetica-Bold').fontSize(8).fill(col).text(id + '  ', 52, yStart + 1, { continued: true, lineBreak: false });
  doc.fill(C.black).text(title, { lineBreak: false });
  doc.moveDown(0.2);
  if (detail) {
    doc.font('Helvetica').fontSize(7.5).fill(C.gray).text(detail, 60, doc.y, { width: 490 });
    doc.moveDown(0.1);
  }
  if (fix) {
    doc.font('Helvetica-Bold').fontSize(7.5).fill(C.green).text('Fix: ', 60, doc.y, { continued: true, lineBreak: false });
    doc.font('Helvetica').fill(C.black).text(fix, { width: 470 });
  }
  doc.moveDown(0.5);
}

// ─── Helper: simple table ─────────────────────────────────────────────────────
function drawTable(doc, headers, rows, colWidths, startX) {
  startX = startX || 40;
  const rowH = 14, headH = 16;
  const totalW = colWidths.reduce((a, b) => a + b, 0);

  // Header row
  checkPage(doc, 30);
  roundRect(doc, startX, doc.y, totalW, headH, 2, C.navy);
  let cx = startX + 4;
  headers.forEach((h, i) => {
    doc.font('Helvetica-Bold').fontSize(7).fill(C.white)
       .text(h, cx, doc.y + 4, { width: colWidths[i] - 6, lineBreak: false });
    cx += colWidths[i];
  });
  doc.y += headH + 1;

  rows.forEach((row, ri) => {
    checkPage(doc, rowH + 4);
    // alternating rows
    if (ri % 2 === 0) roundRect(doc, startX, doc.y, totalW, rowH, 0, C.lgray);
    cx = startX + 4;
    row.forEach((cell, ci) => {
      const txt = String(cell || '');
      const isStatus = headers[ci] === 'Status' || headers[ci] === 'Risk' || headers[ci] === 'Severity';
      doc.font('Helvetica').fontSize(6.5).fill(isStatus ? statusColor(txt.toLowerCase()) : C.black)
         .text(txt, cx, doc.y + 3, { width: colWidths[ci] - 6, lineBreak: false, ellipsis: true });
      cx += colWidths[ci];
    });
    doc.y += rowH;
  });
  doc.moveDown(0.5);
}

// ─── Helper: check page remaining space ──────────────────────────────────────
function checkPage(doc, needed) {
  if (doc.y > 750 - (needed || 50)) {
    doc.addPage();
  }
}

// ─── Helper: page footer ─────────────────────────────────────────────────────
function pageFooter(doc, pageNum, totalLabel) {
  const bottom = 820;
  doc.font('Helvetica').fontSize(7).fill(C.gray);
  doc.text('GoldenLife (CareConnect) — Platform Audit Report 2026', 40, bottom, { lineBreak: false });
  doc.text('Page ' + pageNum, 0, bottom, { align: 'right', lineBreak: false });
}

// ─── Helper: cover page ──────────────────────────────────────────────────────
function coverPage(doc, isDetailed) {
  // Background
  roundRect(doc, 0, 0, 612, 280, 0, C.navy);
  roundRect(doc, 0, 280, 612, 572, 0, C.white);

  // Logo placeholder
  roundRect(doc, 40, 40, 6, 50, 0, C.teal);
  doc.font('Helvetica-Bold').fontSize(28).fill(C.white).text('GoldenLife', 54, 45, { lineBreak: false });
  doc.font('Helvetica').fontSize(12).fill('#90CAF9').text('  CareConnect', { lineBreak: false });

  // Report type label
  doc.moveDown(1.5);
  roundRect(doc, 40, doc.y, isDetailed ? 170 : 150, 22, 4, C.teal);
  doc.font('Helvetica-Bold').fontSize(10).fill(C.white)
     .text(isDetailed ? 'DETAILED PLATFORM AUDIT' : 'EXECUTIVE SUMMARY', 48, doc.y + 6, { lineBreak: false });
  doc.y += 30;

  doc.font('Helvetica-Bold').fontSize(32).fill(C.white)
     .text(isDetailed ? 'Full Platform Audit' : 'Platform Audit', 40, doc.y);
  doc.font('Helvetica').fontSize(14).fill('#B0BEC5').text('Comprehensive audit across 8 dimensions', 40);

  // Date + version
  doc.moveDown(0.3);
  doc.font('Helvetica').fontSize(9).fill('#B0BEC5')
     .text('Audit Date: June 2, 2026   |   Version 3.0   |   GoldenLife Platform', 40);

  // Score block
  const sy = 310;
  // Overall score
  roundRect(doc, 40, sy, 160, 90, 6, C.lgray);
  doc.font('Helvetica').fontSize(9).fill(C.gray).text('OVERALL READINESS SCORE', 52, sy + 10);
  doc.font('Helvetica-Bold').fontSize(36).fill(C.orange).text('68', 60, sy + 22, { lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(18).fill(C.orange).text('/100', { lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(10).fill(C.orange).text('PARTIAL', 60, sy + 65);

  // Critical / High / Medium / Low blocks
  const counts = [
    { label: 'Critical', count: 4, color: C.red },
    { label: 'High', count: 9, color: C.orange },
    { label: 'Medium', count: 14, color: C.yellow },
    { label: 'Low', count: 11, color: C.green },
  ];
  counts.forEach((c, i) => {
    const bx = 215 + i * 90;
    roundRect(doc, bx, sy, 82, 90, 6, C.lgray);
    roundRect(doc, bx, sy, 82, 4, 0, c.color);
    doc.font('Helvetica-Bold').fontSize(28).fill(c.color).text(String(c.count), bx + 12, sy + 18);
    doc.font('Helvetica').fontSize(8).fill(C.gray).text(c.label + ' Issues', bx + 8, sy + 62);
  });

  // Verdict
  const vy = sy + 105;
  roundRect(doc, 40, vy, 532, 32, 6, '#FFF3CD');
  doc.font('Helvetica-Bold').fontSize(9).fill(C.orange)
     .text('VERDICT: PARTIAL — Not ready for full production without resolving 4 critical and 9 high-priority security/stability issues.', 52, vy + 10, { width: 510 });

  // Scope summary
  doc.y = vy + 50;
  doc.font('Helvetica-Bold').fontSize(10).fill(C.navy).text('Audit Scope', 40);
  doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor(C.teal).lineWidth(1).stroke();
  doc.moveDown(0.3);
  const scopeItems = [
    ['8 Audit Phases', 'Feature Inventory, Navigation, Database, Security, Booking, Financial, Performance, UX'],
    ['352 API Routes', 'Full inventory across patient, provider, admin, and platform endpoints'],
    ['82 Database Tables', 'Schema analysis, index coverage, migration drift, country isolation'],
    ['64 Features', 'Status: 44 working | 16 partial | 4 broken/missing'],
    ['Stack', 'React 18 + TypeScript, Express, Drizzle ORM, PostgreSQL, i18next, Stripe, pdfkit'],
  ];
  scopeItems.forEach(([k, v]) => {
    doc.font('Helvetica-Bold').fontSize(8).fill(C.navy).text(k + ':  ', 48, doc.y, { continued: true, lineBreak: false });
    doc.font('Helvetica').fontSize(8).fill(C.black).text(v);
    doc.moveDown(0.15);
  });
}

// ─── Helper: table of contents ────────────────────────────────────────────────
function tableOfContents(doc, items) {
  sectionHeader(doc, 'Table of Contents');
  items.forEach(({ title, page }) => {
    const y = doc.y;
    doc.font('Helvetica').fontSize(9).fill(C.black).text(title, 48, y, { lineBreak: false });
    doc.font('Helvetica').fontSize(9).fill(C.gray).text(String(page), 0, y, { align: 'right', lineBreak: false });
    doc.moveTo(48, doc.y).lineTo(540, doc.y).strokeColor('#E5E7EB').lineWidth(0.5).stroke();
    doc.moveDown(0.3);
  });
}

// ══════════════════════════════════════════════════════════════════════════════
//  EXECUTIVE SUMMARY PDF
// ══════════════════════════════════════════════════════════════════════════════
function generateExecutiveSummary() {
  const doc = new PDFDocument({ size: 'LETTER', margins: { top: 40, bottom: 60, left: 40, right: 40 } });
  const out = fs.createWriteStream(path.join(__dirname, '../reports/executive_summary.pdf'));
  doc.pipe(out);

  // ── Page 1: Cover ──────────────────────────────────────────────────────────
  coverPage(doc, false);
  doc.addPage();

  // ── Page 2: Table of Contents ─────────────────────────────────────────────
  sectionHeader(doc, 'Table of Contents');
  const tocItems = [
    { title: '1.  Executive Overview', page: 3 },
    { title: '2.  Feature Inventory Summary', page: 4 },
    { title: '3.  Critical & High Security Issues', page: 5 },
    { title: '4.  Booking Engine Summary', page: 7 },
    { title: '5.  Financial System Summary', page: 8 },
    { title: '6.  Database Health Summary', page: 9 },
    { title: '7.  Performance Summary', page: 10 },
    { title: '8.  UX & Navigation Summary', page: 11 },
    { title: '9.  Recommended Action Plan', page: 12 },
    { title: '10. Production Readiness Verdict', page: 14 },
  ];
  tocItems.forEach(({ title, page }) => {
    const y = doc.y;
    doc.font('Helvetica').fontSize(9.5).fill(C.black).text(title, 48, y, { lineBreak: false });
    doc.font('Helvetica').fontSize(9.5).fill(C.gray).text(String(page), 0, y, { align: 'right', lineBreak: false });
    doc.moveTo(48, doc.y).lineTo(540, doc.y).strokeColor('#E5E7EB').lineWidth(0.5).stroke();
    doc.moveDown(0.4);
  });

  doc.addPage();

  // ── Page 3: Executive Overview ────────────────────────────────────────────
  sectionHeader(doc, '1.  Executive Overview');
  doc.font('Helvetica').fontSize(9).fill(C.black)
     .text('GoldenLife (CareConnect) is a healthcare booking platform connecting patients with verified physiotherapists, doctors, and home-care nurses. The platform supports multi-country operations (Hungary and Iran), multi-language (EN/HU/FA), and multiple payment modalities including Stripe and wallet credits.', 40, doc.y, { width: 530 });
  doc.moveDown(0.5);
  doc.font('Helvetica').fontSize(9).text(
    'This audit was conducted across 8 dimensions: Feature Inventory, Navigation, Database, Security, Booking Engine, Financial, Performance, and UX. 352 API routes, 82 database tables, and 64 features were examined. The platform demonstrates strong architectural foundations — robust booking conflict detection, solid RBAC, consistent loading states, and well-structured multi-tenancy — but contains critical security vulnerabilities that must be resolved before a safe public launch.',
    40, doc.y, { width: 530 });
  doc.moveDown(0.8);

  miniHeader(doc, 'Key Strengths');
  const strengths = [
    'Robust booking conflict engine with slot-hold mechanism, buffer times, and Haversine travel feasibility',
    'Wallet system uses row-locking (FOR UPDATE) preventing double-spend race conditions',
    'Well-structured RBAC with 7 system roles and permission-level checks for sensitive admin operations',
    'Consistent loading states (Skeleton components) and empty states across all major pages',
    'Multi-country tenancy (HU/IR) enforced via country_code on 16+ tables with middleware checks',
    'Server-side pagination on provider listings with TTL caching (30s list, 2min search)',
    'Automated appointment reminders via 5-minute cron, with 1h/15m/post-visit trigger windows',
    'Optional Stripe/Resend integration — platform starts gracefully without payment/email keys',
  ];
  strengths.forEach(s => bullet(doc, s));
  doc.moveDown(0.5);

  miniHeader(doc, 'Key Risks — Immediate Action Required');
  const risks = [
    ['CRITICAL', 'GET /api/providers/:id/credentials returns private document URLs to unauthenticated users'],
    ['CRITICAL', 'Provider/patient documents uploaded without Cloudinary private type — URLs permanently public'],
    ['HIGH', 'GET /api/admin/users and /api/admin/categories missing requireAdmin — any logged-in user can access'],
    ['HIGH', 'In-memory idempotency cache for appointment creation fails under multi-instance deployment'],
    ['MEDIUM', 'Admin wallet and support-ticket listing endpoints missing country filter (cross-country data leak)'],
    ['MEDIUM', 'No global React Error Boundary in App.tsx — unhandled errors produce white screens'],
  ];
  risks.forEach(([sev, text]) => {
    const y = doc.y;
    badge(doc, 48, y, sev, statusColor(sev.toLowerCase()));
    doc.font('Helvetica').fontSize(8).fill(C.black).text(text, 105, y, { width: 440 });
    doc.moveDown(0.35);
  });

  doc.addPage();

  // ── Page 4: Feature Inventory Summary ────────────────────────────────────
  sectionHeader(doc, '2.  Feature Inventory Summary');
  doc.font('Helvetica').fontSize(8.5).text('64 features audited across patient, provider, admin, and platform categories.', 40, doc.y, { width: 530 });
  doc.moveDown(0.4);

  // Summary counts table
  drawTable(doc,
    ['Category', 'Working', 'Partial', 'Broken/Missing', 'Total'],
    [
      ['Patient', '11', '6', '0', '17'],
      ['Provider', '9', '5', '0', '14'],
      ['Admin', '13', '8', '0', '21'],
      ['Platform', '8', '3', '0', '11'],
      ['TOTAL', '41', '22', '0', '63'],
    ],
    [150, 80, 80, 115, 90]);

  doc.moveDown(0.3);
  miniHeader(doc, 'Partial / Broken Features — Summary');
  const partialFeatures = [
    ['Medical History', 'Patient', 'partial', 'API and DB exist but no primary UI — overshadowed by patient_documents'],
    ['Messages/Chat', 'Patient', 'partial', 'Dual implementation: active realtime tables + 3 legacy table sets not cleaned up'],
    ['Gift Cards', 'Patient', 'partial', 'Purchase/redeem API works but gift cards not integrated into book-wizard checkout'],
    ['Consent Management', 'Patient', 'partial', '/consent page is orphaned — no navigation entry point'],
    ['Provider Gallery', 'Provider', 'partial', 'Stored as text[] on providers row — separate provider_gallery table also exists'],
    ['Credentials / Verification', 'Provider', 'partial', 'Unauthenticated GET endpoint exposes private credential URLs — CRITICAL'],
    ['Provider Documents', 'Provider', 'partial', 'Public Cloudinary URLs — no signed URL protection — HIGH risk'],
    ['User Management', 'Admin', 'partial', 'GET /api/admin/users missing requireAdmin middleware — HIGH risk'],
    ['Category Management', 'Admin', 'partial', 'GET /api/admin/categories missing requireAdmin — MEDIUM risk'],
    ['Wallet Adjustments', 'Admin', 'partial', 'Admin wallet listing missing country filter — cross-country data exposure'],
    ['Announcements', 'Admin', 'partial', 'No country isolation — all countries see all announcements'],
    ['Support Tickets Admin', 'Admin', 'partial', 'Listing endpoint missing country filter'],
    ['WebSocket Chat', 'Platform', 'partial', 'Dual chat system with legacy tables adds overhead and sync risks'],
  ];
  drawTable(doc,
    ['Feature', 'Category', 'Status', 'Issue'],
    partialFeatures,
    [130, 70, 55, 260]);

  doc.addPage();

  // ── Page 5–6: Security Issues ─────────────────────────────────────────────
  sectionHeader(doc, '3.  Critical & High Security Issues');

  issueCard(doc, 'SEC-001', 'critical',
    'Unauthenticated provider credentials exposure',
    'GET /api/providers/:id/credentials returns credential document URLs (Cloudinary public links) to completely unauthenticated users. An attacker who discovers this endpoint can retrieve private professional credentials for any provider.',
    'Add authenticateToken middleware to this route. Return only display metadata (e.g. credential type, expiry date) to public callers; return full URLs only to the owning provider or admins with a time-limited signed URL.');

  issueCard(doc, 'SEC-002', 'critical',
    'Private documents served as permanently public Cloudinary URLs',
    'Documents uploaded via uploadDocumentFile and uploadCredentialFile use the default "upload" type in Cloudinary, which generates permanently public secure_url links. Anyone who obtains a URL (via SEC-001 or any accidental exposure) can access the file indefinitely.',
    'Change Cloudinary upload type to "private" or "authenticated". Serve documents through a server-side proxy endpoint that validates the requester\'s identity and generates a short-lived signed URL on demand.');

  issueCard(doc, 'SEC-003', 'high',
    'Admin endpoints missing requireAdmin middleware',
    'GET /api/admin/users and GET /api/admin/categories have authenticateToken applied (so callers must be logged in) but are missing the requireAdmin check. Any registered patient or provider account can enumerate all users and categories by calling these endpoints directly.',
    'Add requireAdmin middleware immediately after authenticateToken on both routes. Audit all /api/admin/* routes for the same pattern.');

  issueCard(doc, 'SEC-004', 'high',
    'In-memory idempotency cache for appointment creation',
    'The apptIdempotencyCache is a plain JavaScript Map stored in process memory. Under multi-instance or load-balanced deployment (any horizontal scaling), duplicate Idempotency-Key values across two different server instances will not be detected, enabling double bookings.',
    'Replace the in-memory cache with a Redis SET with TTL or a database-backed idempotency_keys table. This is a pre-requisite for any horizontal scaling.');

  issueCard(doc, 'SEC-005', 'medium',
    'Missing country filter on admin wallet and support ticket listings',
    'GET /api/admin/wallets and GET /api/admin/support-tickets do not apply listingCountryFilter. A country_admin for HU can see wallet balances and support tickets belonging to IR users.',
    'Apply listingCountryFilter(req, query, wallets, \"user_id\") pattern, joining through the users table to filter by the admin\'s country code.');

  issueCard(doc, 'SEC-006', 'medium',
    'Announcements and FAQs have no country isolation',
    'Admin announcements and FAQs are stored and served without a country_code column. All admins see all entries regardless of their country scope.',
    'Add country_code column to both tables. Apply filtering in GET endpoints; populate on POST. Or explicitly document as global platform content that all country admins can manage.');

  doc.addPage();

  // ── Page 7: Booking Engine ────────────────────────────────────────────────
  sectionHeader(doc, '4.  Booking Engine Summary');
  doc.font('Helvetica').fontSize(8.5).text(
    'The booking engine is one of the strongest parts of the platform. Slot generation, conflict prevention, waitlist management, and group session handling are all well-implemented.',
    40, doc.y, { width: 530 });
  doc.moveDown(0.4);

  miniHeader(doc, 'Architecture');
  kvLine(doc, 'Slot Generation', 'Hybrid — uses published time_slots rows when available, synthesises from weekly_schedule otherwise');
  kvLine(doc, 'Conflict Prevention', '3-tier: existing blocking-status appointments + manual provider blocks + 10-min slot holds (checkout locks)');
  kvLine(doc, 'Double Booking', 'Patient-side check (same provider + time) + provider-side checkConflict engine in conflictEngine.ts');
  kvLine(doc, 'Buffer Times', 'Per visit type (clinic/home/online); effective window = max(providerBuffer, serviceBuffer)');
  kvLine(doc, 'Travel Feasibility', 'Haversine distance check for consecutive home visits vs provider travelRadiusKm');
  kvLine(doc, 'Waitlist', 'FIFO; up to 3 notifications per freed slot; filters on preferredDate + time window');
  kvLine(doc, 'Group Sessions', 'Flat price; wallet-only; background tick for status transitions (scheduled→live→completed)');
  kvLine(doc, 'Audit Trail', 'appointment_events table logs every status transition; missing table causes 500 on status PATCH');
  doc.moveDown(0.4);

  miniHeader(doc, 'Risks & Gaps');
  issueCard(doc, 'BOOK-001', 'high',
    'In-memory idempotency cache (also SEC-004)',
    'The duplicate-submission guard is in process memory only. Multi-instance deployment breaks this.',
    'Redis or DB-backed idempotency store.');
  doc.font('Helvetica').fontSize(8.5).fill(C.green)
     .text('✓ No double-booking risk found in single-instance deployment — conflict engine covers all blocking states.', 48, doc.y, { width: 510 });
  doc.fill(C.black).moveDown(0.3);
  doc.font('Helvetica').fontSize(8.5).text('✓ Slot hold mechanism (10-min TTL) prevents concurrent booking conflicts at checkout.', 48, doc.y, { width: 510 });

  doc.addPage();

  // ── Page 8: Financial ─────────────────────────────────────────────────────
  sectionHeader(doc, '5.  Financial System Summary');
  drawTable(doc,
    ['Component', 'Status', 'Notes'],
    [
      ['Wallet (credits, top-up)', 'working', 'Integer cents; row-locking (FOR UPDATE); idempotency key on transactions'],
      ['Stripe Checkout', 'working', 'Optional at startup; graceful null return if key missing'],
      ['Refunds', 'working', 'Full/partial/late rules per country via refund_rules table; quoteRefund() logic'],
      ['Provider Earnings', 'working', 'Per-appointment with platform fee and tax tracking'],
      ['Payout Requests', 'working', 'Admin approval flow; linked to provider_earnings'],
      ['Invoice PDF', 'working', 'pdfkit generation; automatic on appointment completion'],
      ['Promo Codes', 'working', 'Validated and applied in computeFinalPrice()'],
      ['Gift Cards', 'partial', 'Purchase/redeem works; NOT integrated in book-wizard checkout flow'],
      ['Packages/Memberships', 'working', 'Discount applied via membershipDiscount input in computeFinalPrice()'],
    ],
    [150, 70, 300]);

  doc.moveDown(0.3);
  miniHeader(doc, 'Financial Risks');
  bullet(doc, 'Currency inconsistency: HUF used internally but USD hardcoded as default in providers.currency, gift_cards.currency, and referrals.reward_currency schema fields. This can produce incorrect currency labels on invoices and reports.', 48, C.orange);
  doc.moveDown(0.2);
  bullet(doc, 'HUF is a zero-decimal currency in practice; storing as decimal(14,2) produces confusing ".00" suffixes in displayed amounts for Hungarian users.', 48, C.yellow);
  doc.moveDown(0.2);
  bullet(doc, 'computeFinalPrice() uses floating-point intermediate calculations before rounding to 2 decimals at the end. For most cases this is fine, but HUF amounts with large surge multipliers could produce 1-forint rounding differences.', 48, C.yellow);

  doc.addPage();

  // ── Page 9: Database ──────────────────────────────────────────────────────
  sectionHeader(doc, '6.  Database Health Summary');
  kvLine(doc, 'Total Tables', '82');
  kvLine(doc, 'Tables with country_code isolation', '16');
  kvLine(doc, 'Legacy/duplicate table sets', '3 (chat, services hierarchy complexity, practitioners)');
  kvLine(doc, 'Migration drift issues', '4');
  doc.moveDown(0.4);

  miniHeader(doc, 'Duplicate / Legacy Table Systems');
  drawTable(doc,
    ['Domain', 'Active Tables', 'Legacy Tables', 'Risk'],
    [
      ['Chat/Messaging', 'realtime_conversations, realtime_messages', 'chat_conversations, chat_messages, conversations, messages', 'medium'],
      ['Services', 'catalog_services, sub_services, services', '5-level hierarchy — intentional but complex', 'low'],
      ['Practitioners', 'practitioners, practitioner_schedules', 'medical_practitioners (display-only?)', 'medium'],
    ],
    [90, 170, 190, 55]);

  miniHeader(doc, 'Migration Drift');
  bullet(doc, 'appointment_status enum expanded in server/db.ts startup migration but not in shared/schema.ts — drizzle-kit push would revert enum to old values', 48, C.red);
  bullet(doc, 'group_sessions and group_session_participants defined in BOTH shared/schema.ts (Drizzle) AND server/db.ts raw SQL — structural drift if either is updated alone', 48, C.orange);
  bullet(doc, 'refund_rules.country_code uses text with default \'all\' instead of the country_code enum used everywhere else', 48, C.yellow);
  bullet(doc, 'tax_settings uses text country column instead of the country_code enum', 48, C.yellow);

  doc.moveDown(0.3);
  miniHeader(doc, 'Missing Indexes (Performance Impact)');
  drawTable(doc,
    ['Table', 'Missing Index', 'Impact'],
    [
      ['wallet_transactions', 'wallet_id', 'High — every balance history fetch scans full table'],
      ['realtime_messages', 'conversation_id', 'High — every message load for a chat scans full table'],
      ['user_notifications', '(user_id, is_read)', 'Medium — dashboard unread count queries are slow'],
      ['appointments', 'appointment_number', 'Low — only in startup migration, not in schema definition'],
    ],
    [160, 160, 195]);

  doc.addPage();

  // ── Page 10: Performance ──────────────────────────────────────────────────
  sectionHeader(doc, '7.  Performance Summary');
  miniHeader(doc, 'Recent Improvements Applied');
  bullet(doc, 'Provider list: server-side pagination (PAGE_SIZE=12) — previously returned all providers in one response');
  bullet(doc, 'providerListCache (30s TTL) for unfiltered listings; providerSearchCache (2min TTL) for search queries');
  bullet(doc, '7 new DB indexes: trigram GIN on bio/professional_title; B-tree composites on country+type+verified, country+rating, appointments by provider+status and patient+status');
  bullet(doc, 'Removed 2 debug console.log statements (App.tsx, home.tsx) from production bundle');
  doc.moveDown(0.4);

  miniHeader(doc, 'Remaining Performance Concerns');
  drawTable(doc,
    ['Issue', 'Severity', 'Recommendation'],
    [
      ['wallet_transactions missing wallet_id index', 'high', 'Add to runStartupMigrations()'],
      ['realtime_messages missing conversation_id index', 'high', 'Add to runStartupMigrations()'],
      ['user_notifications missing composite index', 'medium', 'Add (user_id, is_read) composite'],
      ['routes.ts is 7,000+ lines', 'medium', 'Split into router modules (auth, booking, admin, provider, patient)'],
      ['No pagination on admin user/provider listings', 'medium', 'Add page/limit params to admin listing endpoints'],
      ['TanStack Query staleTime:Infinity globally', 'medium', 'Override for time-sensitive queries (slots, notifications)'],
      ['Dual chat system overhead', 'low', 'Migrate remaining data to realtime_* tables; drop legacy tables'],
    ],
    [200, 65, 250]);

  doc.addPage();

  // ── Page 11: UX & Navigation ──────────────────────────────────────────────
  sectionHeader(doc, '8.  UX & Navigation Summary');
  drawTable(doc,
    ['UX Dimension', 'Score', 'Notes'],
    [
      ['Loading States', 'Excellent', 'Consistent Skeleton + Loader2 across all major pages'],
      ['Empty States', 'Good', 'Most list pages have "No X found" copy'],
      ['Error Boundaries', 'Weak', 'One local boundary in provider dashboard; no global React ErrorBoundary'],
      ['Error Handling', 'Good', 'Centralized ErrorModal + toast; apiRequest throws on non-2xx'],
      ['Breadcrumbs', 'Excellent', 'PageBreadcrumbs component used consistently'],
      ['Document Titles', 'Missing', 'No dynamic <title> tag management — all pages share static index.html title'],
      ['Responsive Design', 'Good', 'Tailwind responsive classes; header collapses on mobile'],
      ['Navigation Coverage', 'Good', 'All major pages reachable via header/footer/dashboard dropdowns'],
      ['Orphaned Pages', 'Issue', '/consent page has no navigation entry point'],
      ['Dark Mode', 'Working', 'ThemeProvider implemented with localStorage sync'],
      ['i18n Coverage', 'Good', 'EN/HU/FA via i18next; pagination keys recently added'],
    ],
    [170, 75, 280]);

  doc.moveDown(0.3);
  miniHeader(doc, 'Navigation Gaps');
  bullet(doc, '/consent page (/consent) — registered in App.tsx but no link in header, footer, or any dashboard. Likely intended for onboarding but unreachable in normal user flow.');
  bullet(doc, 'Document titles: every page shows "GoldenLife" — no page-specific titles for SEO or browser tab identification. Recommend react-helmet-async or equivalent.');
  bullet(doc, 'No global React ErrorBoundary in App.tsx — an uncaught error in any lazy-loaded page will produce a blank white screen with no user feedback.');

  doc.addPage();

  // ── Page 12–13: Action Plan ───────────────────────────────────────────────
  sectionHeader(doc, '9.  Recommended Action Plan');
  doc.font('Helvetica').fontSize(8.5).text('Issues are prioritised by severity and estimated implementation effort. P1/P2 must be resolved before public launch.', 40, doc.y, { width: 530 });
  doc.moveDown(0.4);

  miniHeader(doc, 'P1 — Resolve Before Any Production Traffic (Security Critical)');
  issueCard(doc, 'P1-A', 'critical', 'Protect credential endpoint + use signed Cloudinary URLs',
    'Add authenticateToken to GET /api/providers/:id/credentials. Change Cloudinary uploads to private type. Add server-side proxy for document download with identity check and short-lived signed URL.',
    'Est. 2–3 days. Blocks all public-facing provider verification flows until fixed.');

  issueCard(doc, 'P1-B', 'high', 'Add requireAdmin to missing admin endpoints',
    'GET /api/admin/users and GET /api/admin/categories are missing requireAdmin middleware. A one-line fix each.',
    'Est. 30 minutes. No breaking changes.');

  miniHeader(doc, 'P2 — Resolve Before Horizontal Scaling');
  issueCard(doc, 'P2-A', 'high', 'Replace in-memory idempotency cache with DB-backed store',
    'apptIdempotencyCache in routes.ts is a plain Map. Replace with a PostgreSQL idempotency_keys table (key TEXT PRIMARY KEY, created_at TIMESTAMP, expires_at TIMESTAMP) with a cleanup cron.',
    'Est. 1 day. Required before load balancing.');

  doc.addPage();

  miniHeader(doc, 'P3 — Fix Within First Sprint Post-Launch');
  const p3Items = [
    ['P3-A', 'medium', 'Add country filter to /api/admin/wallets and /api/admin/support-tickets', 'Apply listingCountryFilter; join through users table. Est. 2 hours.'],
    ['P3-B', 'medium', 'Add 3 missing database indexes', 'wallet_transactions(wallet_id), realtime_messages(conversation_id), user_notifications(user_id, is_read) — add to runStartupMigrations(). Est. 1 hour.'],
    ['P3-C', 'medium', 'Add global React ErrorBoundary in App.tsx', 'Wrap the root router in a simple class-based ErrorBoundary with a friendly fallback UI. Est. 2 hours.'],
    ['P3-D', 'medium', 'Add dynamic document.title management', 'Add react-helmet-async; set unique titles per page. Est. half day.'],
    ['P3-E', 'medium', 'Integrate gift cards into book-wizard checkout', 'Add gift card redemption step alongside promo code in computeFinalPrice flow. Est. 1–2 days.'],
    ['P3-F', 'medium', 'Fix currency defaults in schema', 'Change providers.currency, gift_cards.currency, referrals.reward_currency defaults from USD to a country-driven value or remove the hardcoded default. Est. 1 hour + migration.'],
  ];
  p3Items.forEach(([id, sev, title, fix]) => issueCard(doc, id, sev, title, null, fix));

  miniHeader(doc, 'P4 — Tech Debt (Backlog)');
  const p4Items = [
    'Clean up legacy chat tables (chat_conversations, chat_messages, conversations, messages) after migrating any remaining data to realtime_* tables',
    'Split server/routes.ts (7,000+ lines) into router modules: auth.ts, booking.ts, provider.ts, patient.ts, admin.ts, platform.ts',
    'Fix migration drift: align appointment_status enum and group_sessions definition between schema.ts and db.ts',
    'Align refund_rules and tax_settings to use the country_code enum instead of free-text country fields',
    'Add navigation link to /consent page within provider onboarding or user settings flow',
    'Consider adding country_code isolation to announcements and FAQs tables',
  ];
  p4Items.forEach(t => bullet(doc, t));

  doc.addPage();

  // ── Page 14: Verdict ──────────────────────────────────────────────────────
  sectionHeader(doc, '10.  Production Readiness Verdict');

  roundRect(doc, 40, doc.y, 532, 60, 8, '#FFF3CD');
  doc.font('Helvetica-Bold').fontSize(22).fill(C.orange)
     .text('PARTIAL', 52, doc.y + 8);
  doc.font('Helvetica-Bold').fontSize(10).fill(C.black)
     .text('Not recommended for full public production without resolving critical security issues.', 52, doc.y + 4, { width: 480 });
  doc.y += 70;

  doc.font('Helvetica').fontSize(9).fill(C.black).text(
    'GoldenLife has a strong architectural foundation and covers the vast majority of healthcare booking scenarios correctly. The booking engine, wallet system, and multi-country tenancy are production-quality. However, two critical security vulnerabilities — unauthenticated document URL exposure and permanently public Cloudinary storage — represent unacceptable risks for a healthcare platform handling personal medical credentials.',
    40, doc.y, { width: 530 });
  doc.moveDown(0.5);
  doc.font('Helvetica').fontSize(9).text(
    'With the P1 and P2 items resolved (estimated 3–5 developer-days), the platform can safely serve production traffic. The P3 items should be addressed within the first sprint to complete feature parity and eliminate the remaining security gaps.',
    40, doc.y, { width: 530 });
  doc.moveDown(0.8);

  miniHeader(doc, 'Summary Scorecard');
  drawTable(doc,
    ['Dimension', 'Score', 'Verdict'],
    [
      ['Feature Completeness', '87/100', 'Good — 41 working, 22 partial, 0 broken'],
      ['Security', '52/100', 'FAIL — 2 critical vulnerabilities must be fixed before launch'],
      ['Booking Engine', '88/100', 'Good — robust conflict detection; idempotency risk only'],
      ['Financial System', '80/100', 'Good — wallet is solid; currency defaults need cleanup'],
      ['Database Health', '72/100', 'Adequate — migration drift and missing indexes need attention'],
      ['Performance', '74/100', 'Good after recent improvements; 3 indexes still missing'],
      ['UX & Navigation', '82/100', 'Good — strong loading/empty states; missing error boundary'],
      ['Overall', '68/100', 'PARTIAL — launch-ready after P1 security fixes'],
    ],
    [200, 80, 255]);

  doc.end();
  return new Promise(resolve => out.on('finish', resolve));
}

// ══════════════════════════════════════════════════════════════════════════════
//  DETAILED AUDIT PDF
// ══════════════════════════════════════════════════════════════════════════════
function generateDetailedAudit() {
  const doc = new PDFDocument({ size: 'LETTER', margins: { top: 40, bottom: 60, left: 40, right: 40 } });
  const out = fs.createWriteStream(path.join(__dirname, '../reports/detailed_audit.pdf'));
  doc.pipe(out);

  // Cover
  coverPage(doc, true);
  doc.addPage();

  // TOC
  sectionHeader(doc, 'Table of Contents');
  const toc = [
    { title: '1.  Audit Methodology & Scope', page: 3 },
    { title: '2.  Phase 1 — Feature Inventory', page: 4 },
    { title: '   2a. Patient Features', page: 4 },
    { title: '   2b. Provider Features', page: 6 },
    { title: '   2c. Admin Features', page: 8 },
    { title: '   2d. Platform Features', page: 10 },
    { title: '3.  Phase 2 — Navigation & Routes', page: 11 },
    { title: '4.  Phase 3 — Database Audit', page: 13 },
    { title: '   4a. Table Inventory (selected)', page: 14 },
    { title: '   4b. Migration Drift', page: 17 },
    { title: '   4c. Missing Indexes', page: 18 },
    { title: '5.  Phase 4 — Security Audit', page: 19 },
    { title: '   5a. Authentication Coverage', page: 19 },
    { title: '   5b. RBAC & Admin Endpoints', page: 21 },
    { title: '   5c. Multi-Country Tenancy', page: 22 },
    { title: '   5d. Document Privacy', page: 23 },
    { title: '6.  Phase 5 — Booking Engine Audit', page: 24 },
    { title: '   6a. Slot Generation', page: 24 },
    { title: '   6b. Conflict & Race Conditions', page: 25 },
    { title: '   6c. Waitlist & Group Sessions', page: 26 },
    { title: '7.  Phase 6 — Financial Audit', page: 27 },
    { title: '8.  Phase 7 — Performance Audit', page: 30 },
    { title: '9.  Phase 8 — UX Audit', page: 32 },
    { title: '10. Route Inventory Summary', page: 34 },
    { title: '11. Full Issue Register', page: 37 },
    { title: '12. Recommended Remediation Plan', page: 40 },
  ];
  toc.forEach(({ title, page }) => {
    const y = doc.y;
    const indent = title.startsWith('   ') ? 58 : 48;
    doc.font(title.startsWith('   ') ? 'Helvetica' : 'Helvetica-Bold').fontSize(8.5).fill(C.black)
       .text(title.trim(), indent, y, { lineBreak: false });
    doc.font('Helvetica').fontSize(8.5).fill(C.gray).text(String(page), 0, y, { align: 'right', lineBreak: false });
    doc.moveTo(48, doc.y).lineTo(540, doc.y).strokeColor('#E5E7EB').lineWidth(0.5).stroke();
    doc.moveDown(0.3);
  });
  doc.addPage();

  // ── Section 1: Methodology ────────────────────────────────────────────────
  sectionHeader(doc, '1.  Audit Methodology & Scope');
  doc.font('Helvetica').fontSize(8.5).fill(C.black).text(
    'This audit was conducted by systematically inspecting the actual implementation across all application layers: React frontend pages, Express API routes, Drizzle ORM schema, PostgreSQL tables, middleware chains, and integration configurations. No assumptions were made about feature correctness — every feature\'s connectivity (UI → API → DB → permissions) was individually verified.',
    40, doc.y, { width: 530 });
  doc.moveDown(0.4);

  miniHeader(doc, 'Audit Dimensions');
  const dims = [
    ['Phase 1', 'Feature Inventory', '64 features across 4 categories — verified UI, API, DB, permissions, and country scoping'],
    ['Phase 2', 'Navigation & Routes', 'App.tsx route map, header/footer links, orphan pages, breadcrumbs, titles'],
    ['Phase 3', 'Database Audit', '82 tables — foreign keys, indexes, migration drift, country isolation, duplicates'],
    ['Phase 4', 'Security Audit', 'Auth middleware coverage, RBAC, cross-country tenancy, document privacy'],
    ['Phase 5', 'Booking Engine', 'Slot generation, conflict detection, race conditions, waitlist, group sessions'],
    ['Phase 6', 'Financial Audit', 'Wallet, Stripe, refunds, earnings, invoices, promo codes, gift cards, packages'],
    ['Phase 7', 'Performance Audit', 'Indexes, pagination, caching, component size, duplicate queries'],
    ['Phase 8', 'UX Audit', 'Loading states, empty states, error handling, responsive design, navigation'],
  ];
  drawTable(doc, ['Phase', 'Dimension', 'Scope'], dims, [55, 120, 340]);

  miniHeader(doc, 'Codebase Metrics');
  kvLine(doc, 'Total API Routes', '352 (across GET, POST, PATCH, PUT, DELETE)');
  kvLine(doc, 'Database Tables', '82 (defined in shared/schema.ts + server/db.ts startup migrations)');
  kvLine(doc, 'Frontend Pages', '30+ (client/src/pages/)');
  kvLine(doc, 'Server Lines of Code', '~15,000 (server/routes.ts: 7,000+; server/storage.ts: 5,000+)');
  kvLine(doc, 'Countries Supported', '2 (HU — Hungary, IR — Iran)');
  kvLine(doc, 'Languages Supported', '3 (English, Hungarian, Persian/Farsi)');
  kvLine(doc, 'Audit Date', 'June 2, 2026');

  doc.addPage();

  // ── Section 2a: Patient Features ─────────────────────────────────────────
  sectionHeader(doc, '2.  Phase 1 — Feature Inventory');
  miniHeader(doc, '2a. Patient Features');
  drawTable(doc,
    ['Feature', 'Status', 'UI', 'API', 'DB', 'Perms', 'Country', 'Risk'],
    [
      ['Dashboard', 'working', 'Yes', 'Yes', 'Yes', 'Yes', 'Yes', 'low'],
      ['Appointments', 'working', 'Yes', 'Yes', 'Yes', 'Yes', 'Yes', 'low'],
      ['Booking (1:1)', 'working', 'Yes', 'Yes', 'Yes', 'Yes', 'Yes', 'medium'],
      ['Wallet', 'working', 'Yes', 'Yes', 'Yes', 'Yes', 'Yes', 'low'],
      ['Patient Documents', 'working', 'Yes', 'Yes', 'Yes', 'Yes', 'Yes', 'low'],
      ['Medical History', 'partial', 'No', 'Yes', 'Yes', 'Yes', 'No', 'medium'],
      ['Referrals', 'working', 'Yes', 'Yes', 'Yes', 'Yes', 'Yes', 'low'],
      ['Waitlist', 'working', 'Yes', 'Yes', 'Yes', 'Yes', 'No', 'low'],
      ['Messages/Chat', 'partial', 'Yes', 'Yes', 'Yes', 'Yes', 'No', 'medium'],
      ['Notifications', 'working', 'Yes', 'Yes', 'Yes', 'Yes', 'No', 'low'],
      ['Reviews', 'working', 'Yes', 'Yes', 'Yes', 'Yes', 'No', 'low'],
      ['Gift Cards', 'partial', 'Yes', 'Yes', 'Yes', 'Yes', 'No', 'medium'],
      ['Support Tickets', 'working', 'Yes', 'Yes', 'Yes', 'Yes', 'No', 'low'],
      ['Family Members', 'working', 'No', 'Yes', 'Yes', 'Yes', 'No', 'low'],
      ['Health Metrics', 'working', 'No', 'Yes', 'Yes', 'Yes', 'No', 'low'],
      ['Medications', 'working', 'No', 'Yes', 'Yes', 'Yes', 'No', 'low'],
      ['Consent Management', 'partial', 'Yes', 'Yes', 'Yes', 'No', 'No', 'medium'],
    ],
    [120, 50, 30, 30, 30, 35, 45, 40]);
  doc.moveDown(0.3);

  miniHeader(doc, 'Patient Feature Detail Notes');
  kvLine(doc, 'Medical History', 'API (/api/medical-history/patient/:id) and DB table exist but the primary patient UI focuses on patient_documents instead. medical_history table appears underutilised.');
  kvLine(doc, 'Messages/Chat', 'Frontend uses realtime_conversations/realtime_messages (active WebSocket system). Three legacy table sets (chat_conversations/chat_messages, conversations/messages) still exist in schema and are not cleaned up. No sync issue if code only writes to realtime_* but adds schema noise.');
  kvLine(doc, 'Gift Cards', 'POST /api/gift-cards/purchase and POST /api/gift-cards/redeem are implemented and functional. The /gift-cards page exists. However, gift card redemption is NOT offered as a payment option in the book-wizard checkout flow (only wallet and Stripe are shown).');
  kvLine(doc, 'Consent Management', 'patient_consents table and POST /api/consents route exist. The /consent frontend page exists but has no incoming navigation link — it cannot be reached from any menu, dashboard, or button in the normal user flow. Must be typed directly as a URL.');

  doc.addPage();

  // ── Section 2b: Provider Features ────────────────────────────────────────
  miniHeader(doc, '2b. Provider Features');
  drawTable(doc,
    ['Feature', 'Status', 'UI', 'API', 'DB', 'Perms', 'Country', 'Risk'],
    [
      ['Dashboard', 'working', 'Yes', 'Yes', 'Yes', 'Yes', 'Yes', 'low'],
      ['Profile Setup', 'working', 'Yes', 'Yes', 'Yes', 'Yes', 'Yes', 'low'],
      ['Earnings & Reports', 'working', 'Yes', 'Yes', 'Yes', 'Yes', 'Yes', 'low'],
      ['Availability / Schedule', 'working', 'Yes', 'Yes', 'Yes', 'Yes', 'No', 'low'],
      ['Services', 'working', 'Yes', 'Yes', 'Yes', 'Yes', 'Yes', 'low'],
      ['Gallery', 'partial', 'Yes', 'Yes', 'No', 'Yes', 'No', 'low'],
      ['Documents', 'working', 'Yes', 'Yes', 'Yes', 'No', 'No', 'high'],
      ['Credentials / Verification', 'partial', 'Yes', 'Yes', 'Yes', 'No', 'No', 'critical'],
      ['Group Sessions', 'working', 'Yes', 'Yes', 'Yes', 'Yes', 'Yes', 'low'],
      ['Packages / Memberships', 'working', 'Yes', 'Yes', 'Yes', 'Yes', 'No', 'low'],
      ['Payout Requests', 'working', 'Yes', 'Yes', 'Yes', 'Yes', 'Yes', 'low'],
      ['Practitioners / Staff', 'working', 'Yes', 'Yes', 'Yes', 'Yes', 'No', 'low'],
      ['Time Off / Blocks', 'working', 'Yes', 'Yes', 'Yes', 'Yes', 'No', 'low'],
      ['Patient Notes', 'working', 'Yes', 'Yes', 'Yes', 'Yes', 'No', 'low'],
    ],
    [130, 50, 30, 30, 30, 35, 45, 40]);
  doc.moveDown(0.3);

  miniHeader(doc, 'Provider Feature Detail Notes');
  kvLine(doc, 'Gallery', 'Provider images are stored in two ways: as a text[] array on the providers table AND a separate provider_gallery table. The active implementation uses the text[] column on providers. The provider_gallery table is likely legacy. Gallery lacks caption/title metadata.');
  kvLine(doc, 'Documents (HIGH)', 'Provider documents are uploaded via POST /api/provider/documents/upload which calls uploadDocumentFile in server/services/cloudinary.ts. This generates a permanently public secure_url. Any admin or user who obtains the URL can access the document without authentication.');
  kvLine(doc, 'Credentials (CRITICAL)', 'GET /api/providers/:id/credentials has no authenticateToken middleware. This endpoint returns credential document URLs (Cloudinary public links) to anyone making an HTTP request. Combined with the public URL issue above, this means any provider\'s medical license, degree, or certification can be harvested by unauthenticated scrapers.');

  doc.addPage();

  // ── Section 2c: Admin Features ────────────────────────────────────────────
  miniHeader(doc, '2c. Admin Features');
  drawTable(doc,
    ['Feature', 'Status', 'Perms', 'Country', 'Risk'],
    [
      ['Admin Dashboard', 'working', 'Yes', 'Yes', 'low'],
      ['User Management', 'partial', 'No', 'Yes', 'high'],
      ['Provider Management', 'working', 'Yes', 'Yes', 'low'],
      ['Provider Verification', 'working', 'Yes', 'Yes', 'low'],
      ['Category Management', 'partial', 'No', 'No', 'medium'],
      ['Service Requests', 'working', 'Yes', 'Yes', 'low'],
      ['Financial Overview', 'working', 'Yes', 'Yes', 'low'],
      ['Payout Approval', 'working', 'Yes', 'Yes', 'low'],
      ['Refund Management', 'working', 'Yes', 'Yes', 'low'],
      ['Disputes', 'working', 'Yes', 'Yes', 'low'],
      ['Wallet Adjustments', 'partial', 'Yes', 'No', 'medium'],
      ['Analytics / Reports', 'working', 'Yes', 'Yes', 'low'],
      ['RBAC / Permissions', 'working', 'Yes', 'No', 'low'],
      ['Announcements', 'partial', 'Yes', 'No', 'medium'],
      ['Broadcasts', 'working', 'Yes', 'No', 'low'],
      ['Support Tickets Admin', 'partial', 'Yes', 'No', 'medium'],
      ['Audit Logs', 'working', 'Yes', 'No', 'low'],
      ['Monitoring Events', 'working', 'Yes', 'No', 'low'],
      ['Invoice Management', 'working', 'Yes', 'Yes', 'low'],
      ['Stale Bookings', 'working', 'Yes', 'Yes', 'low'],
      ['Country Migration', 'working', 'Yes', 'No', 'low'],
      ['Storage Orphan Scan', 'working', 'Yes', 'No', 'low'],
    ],
    [180, 60, 60, 70, 70]);

  doc.addPage();

  // ── Section 2d: Platform Features ────────────────────────────────────────
  miniHeader(doc, '2d. Platform Features');
  drawTable(doc,
    ['Feature', 'Status', 'Notes'],
    [
      ['Multi-country Tenancy (HU/IR)', 'working', 'country_code on 16+ tables; middleware enforcement'],
      ['JWT Auth + Refresh Tokens', 'working', 'SESSION_SECRET env var; refresh_tokens table with rotation'],
      ['Email Notifications (Resend)', 'working', 'Optional — null if RESEND_API_KEY missing'],
      ['Stripe Payments', 'working', 'Optional — getStripe() returns null if key missing; routes fail gracefully'],
      ['AI Chat Integration', 'working', 'server/replit_integrations/chat — separate from main WebSocket chat'],
      ['WebSocket Real-time Chat', 'partial', 'Dual system; legacy tables not cleaned up'],
      ['Push Notifications', 'working', 'push_subscriptions table; POST /api/push/subscribe'],
      ['i18n (EN/HU/FA)', 'working', 'i18next; pagination keys recently added to all 3 locales'],
      ['Invoice PDF Generation', 'working', 'pdfkit in server/utils/invoice-gen.ts; auto-generated on completion'],
      ['Automated Reminders', 'working', 'reminderCron — 5-min tick; triggers at 1h/15m before and post-visit'],
      ['Exchange Rate Cache', 'working', 'In-memory _fxCache; refreshed on demand; GET /api/exchange-rates'],
    ],
    [185, 65, 265]);

  doc.addPage();

  // ── Section 3: Navigation ─────────────────────────────────────────────────
  sectionHeader(doc, '3.  Phase 2 — Navigation & Routes');
  miniHeader(doc, 'Registered Frontend Routes (App.tsx)');
  drawTable(doc,
    ['Path', 'Component', 'Nav Accessible', 'Notes'],
    [
      ['/', 'Home', 'Yes (logo/link)', ''],
      ['/providers', 'Providers', 'Yes (nav)', 'Paginated listing with filters'],
      ['/providers/:id', 'ProviderProfile', 'Yes (from listing)', ''],
      ['/services', 'Services', 'Yes (nav)', ''],
      ['/group-sessions', 'GroupSessions', 'Yes (nav)', ''],
      ['/about', 'About', 'Yes (footer)', ''],
      ['/become-provider', 'BecomeProvider', 'Yes (nav)', ''],
      ['/login', 'Login', 'Yes (header)', ''],
      ['/register', 'Register', 'Yes (header)', ''],
      ['/forgot-password', 'ForgotPassword', 'Yes (from login)', ''],
      ['/verify-email', 'VerifyEmail', 'Yes (redirect)', ''],
      ['/consent', 'Consent', 'No', 'ORPHANED — no nav link anywhere'],
      ['/dashboard', 'PatientDashboard', 'Yes (user menu)', ''],
      ['/appointments', 'Appointments', 'Yes (user menu)', ''],
      ['/book', 'Book', 'Yes (provider page)', ''],
      ['/book-wizard', 'BookWizard', 'Yes (services page)', ''],
      ['/booking/confirmation/:id', 'BookingConfirmation', 'Yes (end of booking flow)', ''],
      ['/wallet', 'Wallet', 'Yes (user menu)', ''],
      ['/notifications', 'Notifications', 'Yes (user menu)', ''],
      ['/messages', 'Messages', 'Yes (user menu)', ''],
      ['/profile', 'PatientProfile', 'Yes (user menu)', ''],
      ['/my-documents', 'PatientDocuments', 'Yes (user menu)', ''],
      ['/referrals', 'Referrals', 'Yes (user menu)', ''],
      ['/waitlist', 'Waitlist', 'Yes (user menu)', ''],
      ['/gift-cards', 'GiftCards', 'Yes (user menu)', ''],
      ['/support/tickets', 'SupportTickets', 'Yes (user menu)', ''],
      ['/packages', 'Packages', 'Yes (user menu)', ''],
      ['/review/:id', 'Review', 'Yes (from notifications/appointments)', ''],
      ['/provider/dashboard', 'ProviderDashboard', 'Yes (user menu if provider)', ''],
      ['/provider/setup', 'ProviderSetup', 'Yes (redirect for new providers)', ''],
      ['/provider/earnings', 'ProviderEarnings', 'Yes (user menu)', ''],
      ['/group-sessions/create', 'CreateGroupSession', 'Yes (from provider dashboard)', ''],
      ['/admin', 'AdminDashboard', 'Yes (user menu if admin)', ''],
      ['/not-found', 'NotFound', 'Yes (wildcard *)', '404 catch-all'],
    ],
    [140, 130, 80, 165]);

  doc.addPage();

  miniHeader(doc, 'Navigation Coverage Analysis');
  kvLine(doc, 'Total registered routes', '34');
  kvLine(doc, 'Accessible from header/footer/dashboard', '33');
  kvLine(doc, 'Orphaned pages (no nav link)', '1 (/consent)');
  kvLine(doc, 'Dead routes (404s)', '0');
  kvLine(doc, 'Duplicate routes', '0');
  doc.moveDown(0.4);

  miniHeader(doc, 'UX Navigation Issues');
  bullet(doc, 'ORPHAN: /consent — registered in App.tsx, page exists (client/src/pages/consent.tsx), but no link in Header, Footer, or any dashboard component. Users cannot reach it without typing the URL directly.', 48, C.orange);
  bullet(doc, 'MISSING TITLES: No dynamic document.title management. Every page shows the static "GoldenLife" title from index.html. This hurts SEO and makes browser tab identification difficult for users with multiple tabs open.');
  bullet(doc, 'MISSING GLOBAL ERROR BOUNDARY: App.tsx wraps routes in Suspense with PageFallback but has no React ErrorBoundary. An unhandled JavaScript error in any lazy-loaded route component will produce a white screen with no feedback to the user.');
  bullet(doc, 'BACK NAVIGATION: The PageBreadcrumbs component is used consistently across all functional pages providing good back-navigation UX.');

  doc.addPage();

  // ── Section 4: Database ───────────────────────────────────────────────────
  sectionHeader(doc, '4.  Phase 3 — Database Audit');
  kvLine(doc, 'Total Tables', '82 (defined across shared/schema.ts and server/db.ts startup migrations)');
  kvLine(doc, 'Primary Key Strategy', 'UUID (gen_random_uuid()) for all modern tables; serial for 2 legacy tables (conversations, messages)');
  kvLine(doc, 'Country Isolation', 'country_code enum (HU/IR) on 16 tables; enforced via middleware in routes');
  kvLine(doc, 'Deletion Policy', 'Inconsistent CASCADE use — package_benefits cascades; user_packages does not');
  doc.moveDown(0.3);

  miniHeader(doc, '4a. Key Table Inventory');
  doc.font('Helvetica-Bold').fontSize(8).fill(C.navy).text('Core Domain Tables', 48, doc.y);
  doc.moveDown(0.2);
  drawTable(doc,
    ['Table', 'PK', 'country_code', 'Key FKs', 'Notes'],
    [
      ['users', 'uuid', 'Yes', 'none (root)', 'Root entity; email unique; referral_code unique'],
      ['providers', 'uuid', 'Yes', 'users(id)', 'gallery as text[]; is_verified; rating decimal'],
      ['appointments', 'uuid', 'Yes', 'providers+users', 'Core booking table; status enum; location_mode'],
      ['appointment_events', 'uuid', 'No', 'appointments(id)', 'Audit log — REQUIRED for status PATCH; 500 if missing'],
      ['wallets', 'uuid', 'No', 'users(id)', 'balance decimal; isFrozen; user_id unique'],
      ['wallet_transactions', 'uuid', 'No', 'wallets(id)', 'MISSING wallet_id index — high-frequency query'],
      ['invoices', 'uuid', 'Yes', 'appointments(id)', 'Auto-generated; pdfkit for download'],
      ['provider_earnings', 'uuid', 'No', 'appointments(id)', 'platform_fee; tax_amount; net_amount'],
      ['reviews', 'uuid', 'No', 'providers+users', 'rating decimal; provider reply supported'],
      ['payments', 'uuid', 'No', 'appointments(id)', 'stripe_session_id; status'],
    ],
    [130, 40, 65, 130, 155]);

  doc.addPage();

  doc.font('Helvetica-Bold').fontSize(8).fill(C.navy).text('Booking Engine Tables', 48, doc.y);
  doc.moveDown(0.2);
  drawTable(doc,
    ['Table', 'Purpose', 'Notes'],
    [
      ['time_slots', 'Published available slots', 'provider_id; appointment_date; isBooked'],
      ['provider_time_off', 'Vacation / time-off blocks', 'start_date; end_date; blocks all booking'],
      ['provider_blocks', 'Manual break/leave blocks', 'block_type; start_time; end_time'],
      ['appointment_slot_holds', '10-min checkout locks', 'hold_expires_at; prevents concurrent booking'],
      ['practitioner_schedules', 'Staff weekly availability', 'Intersected with provider_office_hours for slot generation'],
      ['provider_office_hours', 'Provider weekly schedule', 'weekly_schedule jsonb; Master availability window'],
      ['provider_buffer_settings', 'Visit-type buffer times', 'Per clinic/home/online visit type'],
      ['waitlist_entries', 'Patient waitlist', 'provider_id; preferredDate; FIFO notification order'],
    ],
    [155, 140, 225]);

  doc.addPage();

  doc.font('Helvetica-Bold').fontSize(8).fill(C.navy).text('Financial Tables', 48, doc.y);
  doc.moveDown(0.2);
  drawTable(doc,
    ['Table', 'Purpose', 'Notes'],
    [
      ['wallets', 'Per-user credit balance', 'Integer cents internally; FOR UPDATE row-locking'],
      ['wallet_transactions', 'Ledger of all wallet movements', 'MISSING wallet_id index'],
      ['payments', 'Stripe payment records', 'stripe_session_id; status; amount'],
      ['refund_rules', 'Country-specific refund policy', 'Drift: uses text country_code not enum'],
      ['payout_requests', 'Provider withdrawal requests', 'status; amount; admin approval flow'],
      ['promo_codes', 'Discount codes', 'code unique; max_uses; expires_at; country_code'],
      ['gift_cards', 'Purchasable gift vouchers', 'code unique; currency defaults USD — should be HUF/IRR'],
      ['packages', 'Membership packages', 'benefit key-value pairs; discount applied via computeFinalPrice'],
      ['user_packages', 'Patient package subscriptions', 'No cascade on delete — orphan risk if package deleted'],
    ],
    [155, 155, 210]);

  doc.addPage();

  doc.font('Helvetica-Bold').fontSize(8).fill(C.navy).text('RBAC & Admin Tables', 48, doc.y);
  doc.moveDown(0.2);
  drawTable(doc,
    ['Table', 'Purpose', 'Notes'],
    [
      ['admin_roles', '7 system roles', 'super_admin, global_admin, country_admin, verification_admin, support_admin, finance_admin, content_admin'],
      ['rbac_permissions', 'Fine-grained permission keys', 'module:action format; e.g. users:view, providers:manage'],
      ['role_permissions', 'Role-permission mapping', 'uq_role_permission constraint prevents duplicates'],
      ['admin_assignments', 'User-to-role assignment', 'user_id; role_id; country_code; effective_from/until'],
      ['audit_logs', 'Admin action audit trail', 'user_id; action; entity_type; entity_id; ip_address'],
      ['system_events', 'Platform monitoring events', 'severity; is_resolved; resolver_id'],
    ],
    [155, 100, 265]);

  doc.addPage();

  miniHeader(doc, '4b. Migration Drift');
  doc.font('Helvetica').fontSize(8.5).fill(C.black).text(
    'Migration drift exists where the same schema element is defined in two places: shared/schema.ts (Drizzle ORM) and server/db.ts (raw SQL in runStartupMigrations()). Running drizzle-kit push without the startup migrations produces an inconsistent database state.',
    40, doc.y, { width: 530 });
  doc.moveDown(0.4);

  const driftItems = [
    { severity: 'high', title: 'appointment_status enum', detail: 'Enum is expanded with additional values (e.g. "rescheduled", "no_show") in the startup migration SQL loop in server/db.ts. shared/schema.ts defines a narrower set. If drizzle-kit push is run, the enum reverts and any appointments with the extended statuses will fail type validation.' },
    { severity: 'high', title: 'group_sessions and group_session_participants', detail: 'Both tables are defined in shared/schema.ts as Drizzle pgTable() AND again as CREATE TABLE IF NOT EXISTS in server/db.ts raw SQL. If the Drizzle definition is updated (new columns, renamed fields) without updating the raw SQL counterpart, a fresh database will have the old schema from the SQL and the Drizzle types will be wrong.' },
    { severity: 'medium', title: 'refund_rules.country_code', detail: 'This column uses a plain TEXT type with default \'all\'. Every other table uses the country_code enum (\'HU\' | \'IR\'). This inconsistency means type-safe enum queries cannot filter refund_rules by country using the standard pattern, and an invalid value can be inserted.' },
    { severity: 'medium', title: 'tax_settings.country', detail: 'Uses a text "country" column instead of the country_code enum. Same issue as refund_rules — inconsistency with the standard country isolation pattern.' },
  ];
  driftItems.forEach(({ severity, title, detail }) => {
    checkPage(doc, 60);
    const y0 = doc.y;
    roundRect(doc, 48, y0, 3, 50, 0, statusColor(severity));
    doc.font('Helvetica-Bold').fontSize(8.5).fill(statusColor(severity)).text(title, 58, y0);
    doc.font('Helvetica').fontSize(8).fill(C.black).text(detail, 58, doc.y, { width: 490 });
    doc.moveDown(0.5);
  });

  doc.addPage();

  miniHeader(doc, '4c. Missing Indexes');
  doc.font('Helvetica').fontSize(8.5).fill(C.black).text(
    'The following indexes are absent from the current schema. Each represents a frequently-executed query pattern that will become progressively slower as data volume grows.',
    40, doc.y, { width: 530 });
  doc.moveDown(0.3);
  drawTable(doc,
    ['Table', 'Column(s)', 'Index Type', 'Query Pattern', 'Priority'],
    [
      ['wallet_transactions', 'wallet_id', 'B-tree', 'GET /api/wallet/transactions — every transaction history fetch', 'high'],
      ['realtime_messages', 'conversation_id', 'B-tree', 'Load chat history for any conversation', 'high'],
      ['user_notifications', '(user_id, is_read)', 'B-tree composite', 'Dashboard unread count; notification list for user', 'medium'],
      ['appointments', 'appointment_number', 'Unique B-tree', 'Exists in startup migration only — not in schema.ts definition', 'low'],
    ],
    [130, 110, 80, 175, 55]);

  doc.font('Helvetica-Bold').fontSize(8).fill(C.navy).text('All 3 high/medium indexes should be added to runStartupMigrations() in server/db.ts:', 48, doc.y);
  doc.moveDown(0.2);
  doc.font('Courier').fontSize(7).fill(C.black)
     .text('await pool.query(`CREATE INDEX IF NOT EXISTS idx_wallet_tx_wallet_id ON wallet_transactions(wallet_id)`);', 52)
     .text('await pool.query(`CREATE INDEX IF NOT EXISTS idx_realtime_msg_conv_id ON realtime_messages(conversation_id)`);', 52)
     .text('await pool.query(`CREATE INDEX IF NOT EXISTS idx_user_notif_user_read ON user_notifications(user_id, is_read)`);', 52);
  doc.moveDown(0.5);

  doc.addPage();

  // ── Section 5: Security ───────────────────────────────────────────────────
  sectionHeader(doc, '5.  Phase 4 — Security Audit');
  miniHeader(doc, '5a. Authentication Coverage');
  doc.font('Helvetica').fontSize(8.5).fill(C.black).text(
    'The platform uses JWT bearer tokens verified by authenticateToken middleware. The following endpoints have missing or misapplied auth.',
    40, doc.y, { width: 530 });
  doc.moveDown(0.4);

  miniHeader(doc, 'Intentionally Public (by design — acceptable)');
  drawTable(doc,
    ['Endpoint', 'Rationale'],
    [
      ['GET /api/providers/:id/reviews', 'Provider reviews are public-facing marketing content'],
      ['GET /api/providers/:id/response-time', 'Public metric for provider discovery'],
      ['GET /api/providers/:id/gallery', 'Provider gallery is public marketing content'],
      ['GET /api/providers/:id/availability-exceptions', 'Shows provider unavailability dates for booking UI'],
      ['GET /api/categories', 'Category listing needed for anonymous browse'],
      ['GET /api/exchange-rates', 'Currency display for anonymous users'],
      ['POST /api/support/contact', 'Contact form accessible without login'],
    ],
    [230, 285]);

  miniHeader(doc, 'Problematic Missing Auth');
  drawTable(doc,
    ['Endpoint', 'Severity', 'Issue'],
    [
      ['GET /api/providers/:id/credentials', 'critical', 'Returns private document URLs to unauthenticated callers — medical licenses, degrees, certs'],
      ['GET /api/admin/users', 'high', 'authenticateToken present but requireAdmin missing — any user can enumerate all users'],
      ['GET /api/admin/categories', 'medium', 'authenticateToken present but requireAdmin missing'],
    ],
    [200, 60, 255]);

  doc.addPage();

  miniHeader(doc, '5b. RBAC & Admin Permission Coverage');
  doc.font('Helvetica').fontSize(8.5).fill(C.black).text(
    'The RBAC system has 3 tiers: authenticateToken → requireAdmin/requireGlobalAdmin → requirePermission(key). The system correctly uses requireGlobalAdmin for the most sensitive operations and requirePermission for audit/monitoring routes. The main gaps are the missing requireAdmin calls noted above.',
    40, doc.y, { width: 530 });
  doc.moveDown(0.4);

  drawTable(doc,
    ['Middleware', 'Applied To', 'Allows'],
    [
      ['authenticateToken', 'All auth-required routes', 'Any logged-in user (patient, provider, admin)'],
      ['requireAdmin', 'Most /api/admin/* routes', 'Users with any admin role (country_admin or higher)'],
      ['requireGlobalAdmin', '/api/admin/admin-users, /api/admin/session-revoke', 'global_admin role only'],
      ['requirePermission(key)', 'Audit logs, monitoring stats, analytics', 'Role must have specific permission key assigned'],
    ],
    [130, 200, 185]);

  doc.moveDown(0.3);
  miniHeader(doc, 'RBAC Roles (7 system roles)');
  drawTable(doc,
    ['Role', 'Scope', 'Super-Admin Bypass'],
    [
      ['super_admin', 'Full platform access', 'Yes — bypasses all permission checks'],
      ['global_admin', 'Cross-country admin', 'Yes — same as super_admin'],
      ['country_admin', 'Single country', 'No — subject to permission checks'],
      ['verification_admin', 'Provider verification only', 'No'],
      ['support_admin', 'Support tickets only', 'No'],
      ['finance_admin', 'Financial operations only', 'No'],
      ['content_admin', 'Content management only', 'No'],
    ],
    [130, 160, 225]);

  doc.addPage();

  miniHeader(doc, '5c. Multi-Country Tenancy');
  doc.font('Helvetica').fontSize(8.5).fill(C.black).text(
    'Country isolation is enforced at the middleware level via listingCountryFilter() and canAccessCountry() helper functions in routes.ts. The country_code field on the users table is used as the source of truth for a user\'s country.',
    40, doc.y, { width: 530 });
  doc.moveDown(0.4);

  miniHeader(doc, 'Country Filter Coverage');
  drawTable(doc,
    ['Domain', 'Filter Applied', 'Risk'],
    [
      ['Providers listing', 'Yes — via optionalAuth + listingCountryFilter', 'low'],
      ['Appointments', 'Yes — patient/provider country on every query', 'low'],
      ['Invoices', 'Yes — country_code on table + filter in query', 'low'],
      ['Analytics/Reports', 'Yes — country_admin sees own country only', 'low'],
      ['Payout Requests', 'Yes — via provider.country_code join', 'low'],
      ['Admin Wallets', 'No — GET /api/admin/wallets missing filter', 'medium'],
      ['Support Tickets', 'No — GET /api/admin/support-tickets missing filter', 'medium'],
      ['Announcements', 'No — no country_code column on table', 'medium'],
      ['FAQs', 'No — no country_code column on table', 'medium'],
    ],
    [200, 220, 95]);

  doc.addPage();

  miniHeader(doc, '5d. Document Privacy');
  doc.font('Helvetica').fontSize(8.5).fill(C.black).text(
    'All document uploads (provider documents, credentials, patient documents) use Cloudinary for storage. The current upload configuration generates permanently public URLs.',
    40, doc.y, { width: 530 });
  doc.moveDown(0.4);

  drawTable(doc,
    ['Document Type', 'Upload Route', 'Cloudinary Type', 'URL Access', 'Risk'],
    [
      ['Provider credentials', 'POST /api/provider/credentials/upload', 'default (public)', 'Anyone with URL — returned unauthenticated via GET endpoint', 'critical'],
      ['Provider documents', 'POST /api/provider/documents/upload', 'default (public)', 'Anyone with URL', 'high'],
      ['Patient documents', 'POST /api/patient/documents/upload', 'default (public)', 'Anyone with URL (URL not exposed without auth)', 'medium'],
    ],
    [120, 165, 80, 110, 55]);

  doc.moveDown(0.3);
  miniHeader(doc, 'Recommended Fix');
  bullet(doc, 'Change Cloudinary upload_type to "private" for all document/credential uploads in server/services/cloudinary.ts');
  bullet(doc, 'Remove direct URL returns from all document endpoints');
  bullet(doc, 'Add a server-side download proxy: GET /api/documents/:id/download — validates requester identity, calls Cloudinary API to generate a 5-minute signed URL, redirects to it');
  bullet(doc, 'For the credential endpoint specifically, only return display metadata (credential type, issue date, expiry, verified status) to public callers; never expose the file URL');

  doc.addPage();

  // ── Section 6: Booking Engine ─────────────────────────────────────────────
  sectionHeader(doc, '6.  Phase 5 — Booking Engine Audit');
  miniHeader(doc, '6a. Slot Generation Architecture');
  doc.font('Helvetica').fontSize(8.5).fill(C.black).text(
    'The slot generation system uses a hybrid approach to maximise flexibility. Providers can either publish explicit time_slots rows (for precise control) or rely on automatic slot synthesis from their weekly schedule.',
    40, doc.y, { width: 530 });
  doc.moveDown(0.4);

  kvLine(doc, 'Endpoint', 'GET /api/providers/:id/available-slots');
  kvLine(doc, 'Published Mode', 'If time_slots rows exist for the provider + date: uses those rows, filters out isBooked=true');
  kvLine(doc, 'Synthetic Mode', 'If no rows: generates slots from provider_office_hours.weekly_schedule; step = SLOT_MIN + bufferBefore + bufferAfter');
  kvLine(doc, 'Practitioner Intersection', 'If service has assigned practitioners, available times = intersection of provider hours AND practitioner hours');
  kvLine(doc, 'Visit Type Filtering', 'service.availabilityHours filters slots per visit type (clinic vs home visit vs online)');
  kvLine(doc, 'Time-off Check', 'isProviderOnTimeOff() checks provider_time_off table; blocks entire date range if match found');
  kvLine(doc, 'Slot Hold Exclusion', 'Active slot holds (within 10-min TTL) are excluded from available slots response');
  doc.moveDown(0.5);

  miniHeader(doc, '6b. Conflict Detection Engine (conflictEngine.ts)');
  doc.font('Helvetica').fontSize(8.5).fill(C.black).text('Three-tier conflict check on every booking attempt:', 40, doc.y, { width: 530 });
  doc.moveDown(0.3);
  drawTable(doc,
    ['Tier', 'Check', 'Source Table', 'Notes'],
    [
      ['1', 'Existing appointments in blocking statuses', 'appointments', 'pending, approved, confirmed, in_progress'],
      ['2', 'Manual provider blocks', 'provider_blocks', 'Leave, personal blocks set by provider'],
      ['3', 'Active slot holds', 'appointment_slot_holds', '10-min checkout locks; TTL-based'],
    ],
    [30, 200, 140, 150]);

  doc.moveDown(0.3);
  miniHeader(doc, 'Race Condition Analysis');
  drawTable(doc,
    ['Risk', 'Severity', 'Current Protection', 'Gap'],
    [
      ['Double-tap submission', 'medium', 'In-memory idempotency cache (apptIdempotencyCache)', 'Cache is process-local — fails under multi-instance'],
      ['Concurrent booking same slot', 'medium', 'Slot hold mechanism + conflict check before insert', 'Short TOCTOU window between conflict check and insert (no DB transaction wrapping both)'],
      ['Concurrent group session booking', 'low', 'participantCount check against maxCapacity', 'No SELECT FOR UPDATE — possible capacity overrun under extreme concurrency'],
    ],
    [160, 55, 160, 145]);

  doc.addPage();

  miniHeader(doc, '6c. Waitlist & Group Sessions');

  miniHeader(doc, 'Waitlist');
  kvLine(doc, 'Join Route', 'POST /api/waitlist — requires provider_id, preferred_date, preferred_time_window');
  kvLine(doc, 'Trigger', 'notifyWaitlistForFreedSlot() called when appointment is cancelled or slot becomes available');
  kvLine(doc, 'Algorithm', 'FIFO by waitlist entry created_at; notifies up to WAITLIST_NOTIFY_FANOUT (default 3) patients');
  kvLine(doc, 'Filtering', 'Only notifies patients whose preferredDate and preferredStartTime/EndTime window matches freed slot');
  kvLine(doc, 'Notification Channel', 'Push notification + email (if Resend configured)');
  doc.moveDown(0.3);

  miniHeader(doc, 'Group Sessions');
  kvLine(doc, 'Capacity', 'maxCapacity on group_sessions; participantCount tracked');
  kvLine(doc, 'Payment', 'Wallet-only currently — no Stripe option for group session booking');
  kvLine(doc, 'Status Lifecycle', 'Background tick (tickGroupSessionStatuses): scheduled → live → completed based on session time');
  kvLine(doc, 'Cancellation', 'Provider cancel triggers bulk wallet refund to all participants via cancelGroupSessionAndRefund()');
  kvLine(doc, 'Difference from 1:1', 'No complex computeFinalPrice() — flat price; no practitioner assignment; no location modes');

  doc.addPage();

  // ── Section 7: Financial ──────────────────────────────────────────────────
  sectionHeader(doc, '7.  Phase 6 — Financial Audit');

  miniHeader(doc, 'Wallet System');
  doc.font('Helvetica').fontSize(8.5).fill(C.black).text(
    'The wallet system is the most robust financial component. It uses integer arithmetic (multiplying by 100 for cents) and PostgreSQL row-locking to prevent race conditions.',
    40, doc.y, { width: 530 });
  doc.moveDown(0.3);
  kvLine(doc, 'Balance Storage', 'decimal(14,2) on wallets table; internally operated as integer cents (× 100)');
  kvLine(doc, 'Race Condition Prevention', 'SELECT ... FOR UPDATE on wallet row before any balance modification via applyWalletDelta()');
  kvLine(doc, 'Transaction Types', 'topup, debit, refund, adjustment, reversal');
  kvLine(doc, 'Idempotency', 'idempotencyKey column on wallet_transactions prevents duplicate credits');
  kvLine(doc, 'Frozen Wallets', 'isFrozen flag; frozen wallets reject new transactions');
  doc.moveDown(0.4);

  miniHeader(doc, 'Stripe Integration');
  kvLine(doc, 'Startup Behaviour', 'getStripe() returns null if STRIPE_SECRET_KEY missing; routes fail gracefully with 503');
  kvLine(doc, 'Payment Flow', 'POST /api/wallet/topup creates Checkout Session; webhook in server/stripeWebhook.ts credits wallet on success');
  kvLine(doc, 'Idempotency', 'Stripe checkout session ID stored as referenceId on wallet_transaction to prevent double-crediting');
  doc.moveDown(0.4);

  miniHeader(doc, 'Pricing Engine (computeFinalPrice)');
  doc.font('Helvetica').fontSize(8.5).fill(C.black).text(
    'computeFinalPrice() in server/lib/pricing.ts handles the full pricing calculation pipeline:',
    40, doc.y, { width: 530 });
  doc.moveDown(0.3);
  drawTable(doc,
    ['Input', 'Applied As', 'Notes'],
    [
      ['service.price', 'Base price', 'From sub_services.base_price + service markup'],
      ['location_mode', 'Visit fee addition', 'clinic_fee, home_visit_fee, or telemedicine_fee per provider'],
      ['surgeMultiplier', 'Multiplier on base', 'Time-of-day/demand surge'],
      ['emergencyFee', 'Addition', 'Emergency/same-day booking surcharge'],
      ['promoCode', 'Deduction', 'Percentage or fixed amount'],
      ['membershipDiscount', 'Deduction', 'From active user_package benefit'],
      ['walletCredits', 'Deduction', 'Applied after promo/membership'],
      ['tax', 'Addition', 'From tax_settings table; per country'],
    ],
    [130, 100, 285]);

  doc.addPage();

  miniHeader(doc, 'Currency Risk Analysis');
  doc.font('Helvetica').fontSize(8.5).fill(C.black).text(
    'The platform has a currency inconsistency issue that could produce incorrect labels on invoices and financial reports:',
    40, doc.y, { width: 530 });
  doc.moveDown(0.3);
  drawTable(doc,
    ['Location', 'Current Default', 'Should Be', 'Risk'],
    [
      ['providers.currency (schema)', 'USD (hardcoded)', 'HUF for HU providers, IRR for IR', 'Invoices show wrong currency symbol'],
      ['gift_cards.currency (schema)', 'USD (hardcoded)', 'HUF/IRR based on purchaser country', 'Gift cards show wrong value'],
      ['referrals.reward_currency', 'USD (hardcoded)', 'Country-driven', 'Referral credits show wrong currency'],
      ['wallets.currency', 'HUF (default)', 'Country-driven', 'Only correct for HU; IR users get HUF default'],
      ['wallet_transactions.currency', 'HUF (default)', 'Country-driven', 'Inconsistent with some referral logic using USD'],
    ],
    [155, 110, 120, 135]);

  doc.moveDown(0.3);
  miniHeader(doc, 'Invoice Generation');
  kvLine(doc, 'Library', 'pdfkit (server/utils/invoice-gen.ts)');
  kvLine(doc, 'Trigger', 'Automatic on appointment completion; also manual via POST /api/invoices/generate/:appointmentId');
  kvLine(doc, 'Admin Template', 'Customisable via admin invoice template editor; preview endpoint available');
  kvLine(doc, 'Delivery', 'GET /api/invoices/:id/download — served as application/pdf');
  kvLine(doc, 'Email', 'POST /api/admin/invoices/:id/send-reminder — sends via Resend if configured');
  doc.moveDown(0.3);

  miniHeader(doc, 'Promo Codes, Gift Cards & Packages');
  drawTable(doc,
    ['Component', 'Status', 'Integration', 'Issue'],
    [
      ['Promo Codes', 'working', 'Validated via POST /api/promo-codes/validate; applied in computeFinalPrice', 'None'],
      ['Gift Cards', 'partial', 'Purchase and redeem routes work; credited to wallet on redemption', 'NOT shown in book-wizard checkout UI'],
      ['Packages/Memberships', 'working', 'membershipDiscount applied in computeFinalPrice via user_packages lookup', 'None'],
    ],
    [100, 65, 210, 145]);

  doc.addPage();

  // ── Section 8: Performance ────────────────────────────────────────────────
  sectionHeader(doc, '8.  Phase 7 — Performance Audit');

  miniHeader(doc, 'Recently Improved (Applied This Session)');
  drawTable(doc,
    ['Improvement', 'Before', 'After'],
    [
      ['Provider listing', 'All providers in one DB query + response', 'Paginated (12/page); server-side count'],
      ['Provider list caching', 'No caching; DB query on every request', 'providerListCache (30s TTL); providerSearchCache (2min TTL)'],
      ['DB indexes (7 new)', 'No trigram/composite indexes', 'GIN trigram on bio+title; B-tree composites on country+type+verified, country+rating, appt status'],
      ['Debug console.logs', 'App.tsx: "App rendering"; home.tsx: "Home rendering"', 'Removed from production bundle'],
    ],
    [150, 170, 200]);

  doc.moveDown(0.3);
  miniHeader(doc, 'Remaining Performance Issues');
  drawTable(doc,
    ['Issue', 'Severity', 'Impact', 'Fix'],
    [
      ['wallet_transactions missing index', 'high', 'Full table scan for every /api/wallet/transactions call', 'Add idx_wallet_tx_wallet_id'],
      ['realtime_messages missing index', 'high', 'Full table scan for every chat load', 'Add idx_realtime_msg_conv_id'],
      ['user_notifications missing index', 'medium', 'Slow dashboard unread count', 'Add composite (user_id, is_read) index'],
      ['routes.ts 7,000+ lines', 'medium', 'Dev experience; single file compile overhead', 'Split into router modules'],
      ['No admin listing pagination', 'medium', 'Admin user/provider lists can grow unbounded', 'Add page/limit to admin listing endpoints'],
      ['staleTime:Infinity globally', 'medium', 'Time-sensitive data (slots, notifications) never refreshes', 'Override for specific query keys'],
      ['Dual chat system', 'low', 'Extra DB tables; memory overhead for two chat implementations', 'Migrate data; drop legacy tables'],
    ],
    [145, 55, 165, 155]);

  doc.addPage();

  miniHeader(doc, 'Cache Architecture');
  doc.font('Helvetica').fontSize(8.5).fill(C.black).text(
    'The platform uses in-process TTL caches (server/lib/cache.ts). These are efficient for single-instance deployments but will require replacement with a shared store (Redis, Memcached) for multi-instance operation.',
    40, doc.y, { width: 530 });
  doc.moveDown(0.3);
  drawTable(doc,
    ['Cache Name', 'TTL', 'Key Pattern', 'Invalidated By', 'Type'],
    [
      ['categoriesCache', '5 min', 'categories:{countryCode}', 'Admin category create/update/delete', 'In-process Map'],
      ['publicServicesCache', '5 min', 'services:{countryCode}', 'Provider service create/update/delete', 'In-process Map'],
      ['providerListCache', '30 sec', 'list:{country}:{page}:{size}', 'Admin provider write/delete; provider setup', 'In-process Map'],
      ['providerSearchCache', '2 min', 'search:{country}:{q}:{type}:{city}:{verified}:{page}:{size}', 'Admin provider write/delete; provider setup', 'In-process Map'],
    ],
    [135, 45, 175, 135, 65]);

  doc.addPage();

  // ── Section 9: UX Audit ───────────────────────────────────────────────────
  sectionHeader(doc, '9.  Phase 8 — UX Audit');

  miniHeader(doc, 'Loading States');
  doc.font('Helvetica').fontSize(8.5).fill(C.green).text('✓ Excellent coverage.', 48, doc.y, { lineBreak: false });
  doc.fill(C.black).text(' Skeleton components from @/components/ui/skeleton used throughout. Loader2 spinner for action buttons. PageFallback (full-page spinner) for lazy-loaded routes.', { width: 460 });
  doc.moveDown(0.3);

  miniHeader(doc, 'Empty States');
  doc.font('Helvetica').fontSize(8.5).fill(C.green).text('✓ Good coverage.', 48, doc.y, { lineBreak: false });
  doc.fill(C.black).text(' Most list-based pages have "No X found" copy with appropriate icons. Provider listing shows empty state with search suggestions.', { width: 460 });
  doc.moveDown(0.3);

  miniHeader(doc, 'Error Handling');
  drawTable(doc,
    ['Pattern', 'Coverage', 'Notes'],
    [
      ['Global ErrorModal', 'Good', 'Centralized showErrorModal() from ErrorModalProvider; called in catch blocks across login, register, booking flows'],
      ['Toast notifications', 'Good', 'useToast hook used for success/error feedback on mutations'],
      ['API error propagation', 'Good', 'apiRequest in lib/queryClient.ts throws on non-2xx with message from response body'],
      ['React ErrorBoundary', 'Weak', 'Only one local boundary in provider-dashboard.tsx; NO global boundary in App.tsx'],
      ['Form validation errors', 'Good', 'zodResolver with react-hook-form; form.formState.errors displayed inline'],
    ],
    [140, 65, 310]);

  doc.moveDown(0.3);
  miniHeader(doc, 'Forms');
  kvLine(doc, 'Library', 'react-hook-form with zodResolver — consistent across all forms');
  kvLine(doc, 'Validation', 'Zod schemas from shared/schema.ts used as source of truth');
  kvLine(doc, 'Default Values', 'All forms use defaultValues in useForm() — no uncontrolled component issues');
  kvLine(doc, 'Submit State', 'isPending from useMutation used to disable submit buttons during async operations');
  doc.moveDown(0.4);

  miniHeader(doc, 'SEO & Meta');
  drawTable(doc,
    ['Element', 'Status', 'Issue'],
    [
      ['<title> tag', 'Static only', 'All pages show "GoldenLife" — no dynamic titles. Bad for SEO and multi-tab UX'],
      ['Meta descriptions', 'Missing', 'No per-page meta description tags'],
      ['Open Graph tags', 'Missing', 'No og:title, og:description, og:image for social sharing'],
      ['Sitemap', 'Not found', 'No /sitemap.xml endpoint found'],
      ['Structured data', 'Not found', 'No JSON-LD for healthcare providers, reviews, or services'],
    ],
    [130, 80, 305]);

  doc.addPage();

  miniHeader(doc, 'Responsive Design');
  kvLine(doc, 'Framework', 'Tailwind CSS with responsive prefixes (sm:, md:, lg:)');
  kvLine(doc, 'Header', 'Collapses to hamburger menu on mobile; navigation items hidden');
  kvLine(doc, 'Provider Listing', 'Grid layout with responsive columns (1/2/3 on mobile/tablet/desktop)');
  kvLine(doc, 'Dark Mode', 'ThemeProvider implemented; toggles "dark" class on document.documentElement; localStorage persistence');
  kvLine(doc, 'Tested Breakpoints', 'Standard Tailwind breakpoints (640px, 768px, 1024px, 1280px)');
  doc.moveDown(0.4);

  miniHeader(doc, 'i18n Coverage');
  drawTable(doc,
    ['Key Category', 'EN', 'HU', 'FA', 'Notes'],
    [
      ['Navigation', '✓', '✓', '✓', 'Complete across all 3 locales'],
      ['Booking Flow', '✓', '✓', '✓', 'All booking step labels translated'],
      ['Provider Types', '✓', '✓', '✓', ''],
      ['Pagination (new)', '✓', '✓', '✓', 'previous, next, page_of added this session'],
      ['Error Messages', '✓', '✓', '✓', ''],
      ['Dynamic Content', 'partial', 'partial', 'partial', 'Some server-generated content (emails, notifications) is EN-only'],
    ],
    [130, 40, 40, 40, 265]);

  doc.addPage();

  // ── Section 10: Route Inventory Summary ───────────────────────────────────
  sectionHeader(doc, '10.  Route Inventory Summary');
  kvLine(doc, 'Total Routes', '352');
  kvLine(doc, 'GET', '~140 (40%)');
  kvLine(doc, 'POST', '~120 (34%)');
  kvLine(doc, 'PATCH', '~50 (14%)');
  kvLine(doc, 'DELETE', '~35 (10%)');
  kvLine(doc, 'PUT', '~7 (2%)');
  doc.moveDown(0.4);

  miniHeader(doc, 'Routes by Category');
  drawTable(doc,
    ['Category', 'Route Prefix', 'Route Count', 'Auth Level'],
    [
      ['Authentication', '/api/auth/*', '10', 'Public (login/register) + token (logout/refresh)'],
      ['Providers (public)', '/api/providers/*', '12', 'Optional auth for country detection'],
      ['Provider Self-Service', '/api/provider/*', '32', 'authenticateToken (provider only)'],
      ['Patient Features', '/api/wallet, /api/appointments, /api/patient/*', '45', 'authenticateToken (patient)'],
      ['Booking Engine', '/api/slots, /api/slot-holds, /api/book*', '8', 'authenticateToken'],
      ['Admin', '/api/admin/*', '95', 'authenticateToken + requireAdmin'],
      ['Platform', '/api/categories, /api/services, /api/exchange-rates', '30', 'Mostly public'],
      ['Healthcare', '/api/practitioners, /api/group-sessions, /api/packages', '25', 'Mixed'],
      ['Content/Notifications', '/api/notifications, /api/chat, /api/push', '18', 'authenticateToken'],
      ['Support', '/api/support/*', '6', 'Mixed (contact is public)'],
    ],
    [155, 175, 70, 140]);

  doc.addPage();

  miniHeader(doc, 'Security Risk Routes');
  drawTable(doc,
    ['Endpoint', 'Method', 'Severity', 'Issue'],
    [
      ['/api/providers/:id/credentials', 'GET', 'critical', 'No auth — exposes private document URLs'],
      ['/api/admin/users', 'GET', 'high', 'Missing requireAdmin — any user can enumerate users'],
      ['/api/admin/categories', 'GET', 'medium', 'Missing requireAdmin'],
      ['/api/admin/wallets', 'GET', 'medium', 'Missing country filter'],
      ['/api/admin/support-tickets', 'GET', 'medium', 'Missing country filter'],
      ['/api/admin/announcements', 'GET', 'medium', 'No country isolation on table/query'],
      ['/api/admin/faqs', 'GET', 'medium', 'No country isolation on table/query'],
    ],
    [215, 50, 65, 190]);

  doc.addPage();

  // ── Section 11: Full Issue Register ───────────────────────────────────────
  sectionHeader(doc, '11.  Full Issue Register');
  doc.font('Helvetica').fontSize(8.5).fill(C.black)
     .text('All 38 issues identified during the audit, ordered by severity.', 40, doc.y, { width: 530 });
  doc.moveDown(0.4);

  miniHeader(doc, 'Critical Issues (4)');
  const criticals = [
    ['SEC-001', 'Unauthenticated credential endpoint', 'GET /api/providers/:id/credentials returns private document URLs without authentication'],
    ['SEC-002', 'Permanently public Cloudinary document URLs', 'Documents uploaded as default (public) type — URLs are permanently accessible'],
    ['BOOK-001+SEC-004', 'In-memory idempotency cache', 'Fails under multi-instance deployment — enables double bookings under horizontal scale'],
    ['DB-001', 'appointment_status enum drift', 'Enum expanded in db.ts but not schema.ts — drizzle-kit push would revert statuses'],
  ];
  drawTable(doc, ['ID', 'Title', 'Detail'], criticals, [90, 155, 275]);

  miniHeader(doc, 'High Issues (9)');
  const highs = [
    ['SEC-003', 'Missing requireAdmin on /api/admin/users', 'Any logged-in user can enumerate all users'],
    ['DB-002', 'group_sessions defined in two places', 'schema.ts and db.ts raw SQL — structural drift risk'],
    ['PERF-001', 'wallet_transactions missing index', 'Full table scan for every balance history query'],
    ['PERF-002', 'realtime_messages missing index', 'Full table scan for every chat message load'],
    ['FIN-001', 'Currency defaults hardcoded as USD', 'providers.currency, gift_cards.currency, referrals.reward_currency default to USD'],
    ['FIN-002', 'Gift cards not in checkout flow', 'Gift cards cannot be used during appointment booking'],
    ['UX-001', 'No global React ErrorBoundary', 'Unhandled errors produce white screen with no user feedback'],
    ['NAV-001', '/consent page orphaned', 'No navigation link to the consent page in any menu or flow'],
    ['SEC-003b', 'Missing requireAdmin on /api/admin/categories', 'Any logged-in user can see category admin data'],
  ];
  drawTable(doc, ['ID', 'Title', 'Detail'], highs, [90, 160, 270]);

  doc.addPage();

  miniHeader(doc, 'Medium Issues (14)');
  const mediums = [
    ['SEC-004', 'Missing country filter: /api/admin/wallets', 'Country admins can see wallets from other countries'],
    ['SEC-005', 'Missing country filter: /api/admin/support-tickets', 'Cross-country ticket visibility'],
    ['SEC-006', 'Announcements: no country isolation', 'No country_code column on table'],
    ['SEC-007', 'FAQs: no country isolation', 'No country_code column on table'],
    ['DB-003', 'refund_rules uses text country_code', 'Inconsistent with country_code enum used elsewhere'],
    ['DB-004', 'tax_settings uses text country', 'Same inconsistency'],
    ['PERF-003', 'user_notifications missing composite index', 'Slow dashboard unread count queries'],
    ['PERF-004', 'No pagination on admin listings', 'Admin user/provider lists could grow unbounded'],
    ['PERF-005', 'staleTime:Infinity globally', 'Time-sensitive data never refreshes in background'],
    ['FEAT-001', 'Medical history UI missing', 'API/DB exist but no primary patient UI surface'],
    ['FEAT-002', 'Dual chat system', 'Legacy tables not cleaned up; realtime_* is active but legacy coexists'],
    ['SEO-001', 'No dynamic document.title', 'All pages share static "GoldenLife" title'],
    ['SEO-002', 'No meta descriptions', 'Missing per-page meta content'],
    ['SEO-003', 'No Open Graph tags', 'Social sharing produces no preview'],
  ];
  drawTable(doc, ['ID', 'Title', 'Detail'], mediums, [80, 165, 275]);

  doc.addPage();

  miniHeader(doc, 'Low Issues (11)');
  const lows = [
    ['DB-005', 'provider_gallery table vs text[] on providers', 'Two representations of gallery — unclear which is canonical'],
    ['DB-006', 'medical_practitioners vs practitioners', 'medical_practitioners appears legacy/display-only'],
    ['DB-007', 'user_packages: no cascade on delete', 'Packages deleted before user_packages creates orphan subscriptions'],
    ['DB-008', 'appointments.appointment_number index in db.ts only', 'Not in schema.ts definition — consistency issue'],
    ['PERF-006', 'routes.ts 7,000+ lines', 'Single file; slow to navigate; hard to maintain'],
    ['PERF-007', 'Debug console.logs removed', 'Were present in App.tsx and home.tsx; already fixed this session'],
    ['FEAT-003', 'Family Members has no dedicated page', 'API/DB exist; used in booking but no management UI'],
    ['FEAT-004', 'Health Metrics has no dedicated page', 'API/DB exist but no patient-facing UI'],
    ['UX-002', 'Consent page no link', 'patient_consents table and route exist; /consent page exists; not reachable from UI'],
    ['NAV-002', 'No sitemap.xml', 'Missing for SEO'],
    ['NAV-003', 'No structured data (JSON-LD)', 'No schema.org markup for providers, services, or reviews'],
  ];
  drawTable(doc, ['ID', 'Title', 'Detail'], lows, [80, 165, 275]);

  doc.addPage();

  // ── Section 12: Remediation Plan ─────────────────────────────────────────
  sectionHeader(doc, '12.  Recommended Remediation Plan');

  miniHeader(doc, 'P1 — Before Any Production Traffic');
  issueCard(doc, 'P1-A', 'critical',
    'Protect credential endpoint + signed Cloudinary URLs',
    'Issues SEC-001 + SEC-002. Add authenticateToken to GET /api/providers/:id/credentials. Change Cloudinary upload type to "private" for all document uploads. Add server-side download proxy with identity verification and short-lived signed URL generation.',
    'Est. 2–3 days. Requires: Cloudinary account plan supporting private assets + signed URLs.');

  issueCard(doc, 'P1-B', 'high',
    'Add requireAdmin to missing admin endpoints',
    'Issue SEC-003/SEC-003b. Add requireAdmin middleware to GET /api/admin/users and GET /api/admin/categories.',
    'Est. 30 minutes. Zero breaking changes.');

  miniHeader(doc, 'P2 — Before Horizontal Scaling');
  issueCard(doc, 'P2-A', 'high',
    'Replace in-memory idempotency cache with DB-backed store',
    'Issue BOOK-001/SEC-004. Create idempotency_keys table (key TEXT PK, created_at, expires_at). Replace Map operations in routes.ts. Add cleanup cron to expire old keys.',
    'Est. 1 day.');

  miniHeader(doc, 'P3 — First Sprint Post-Launch (1–2 weeks)');
  issueCard(doc, 'P3-A', 'medium', 'Country filter for wallet + support ticket admin endpoints',
    'Issues SEC-004/SEC-005.', 'Apply listingCountryFilter pattern. Est. 2 hours.');
  issueCard(doc, 'P3-B', 'high', 'Add 3 missing DB indexes',
    'Issues PERF-001/PERF-002/PERF-003.', 'Add wallet_transactions(wallet_id), realtime_messages(conversation_id), user_notifications(user_id, is_read) to runStartupMigrations(). Est. 30 minutes.');
  issueCard(doc, 'P3-C', 'high', 'Global React ErrorBoundary',
    'Issue UX-001.', 'Add class-based ErrorBoundary wrapping root router in App.tsx. Est. 2 hours.');
  issueCard(doc, 'P3-D', 'high', 'Integrate gift cards in checkout',
    'Issue FIN-002.', 'Add gift card redemption option in book-wizard.tsx payment step alongside promo code. Est. 1–2 days.');
  issueCard(doc, 'P3-E', 'medium', 'Fix currency defaults',
    'Issue FIN-001.', 'Change schema defaults for providers.currency, gift_cards.currency, referrals.reward_currency to be country-driven. Est. 1 hour + migration.');
  issueCard(doc, 'P3-F', 'medium', 'Dynamic document.title management',
    'Issue SEO-001.', 'Install react-helmet-async; add unique title to each page component. Est. half day.');

  miniHeader(doc, 'P4 — Tech Debt Backlog');
  const p4 = [
    'Clean up legacy chat tables: migrate data to realtime_* then DROP chat_conversations, chat_messages, conversations, messages',
    'Split routes.ts into router modules: auth.ts, booking.ts, provider.ts, patient.ts, admin.ts, platform.ts',
    'Fix migration drift: align appointment_status enum between schema.ts and db.ts; unify group_sessions definition',
    'Standardise country isolation: align refund_rules and tax_settings to use country_code enum',
    'Clarify provider gallery: retire either provider_gallery table or the text[] column on providers',
    'Add navigation link to /consent page within provider onboarding or patient settings',
    'Add country_code to announcements and FAQs tables',
    'Investigate medical_practitioners table — document if active or drop if legacy',
  ];
  p4.forEach(t => bullet(doc, t));

  doc.end();
  return new Promise(resolve => out.on('finish', resolve));
}

// ── Run both generators ───────────────────────────────────────────────────────
(async () => {
  console.log('Generating executive_summary.pdf ...');
  await generateExecutiveSummary();
  console.log('✓ executive_summary.pdf done');

  console.log('Generating detailed_audit.pdf ...');
  await generateDetailedAudit();
  console.log('✓ detailed_audit.pdf done');

  console.log('All PDFs generated in reports/');
})();
