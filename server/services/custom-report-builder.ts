import { pool } from "../db";

export type ReportFieldType = "text" | "number" | "boolean" | "date" | "datetime";
export type ReportOperator =
  | "eq" | "neq" | "contains" | "starts_with" | "in"
  | "gt" | "gte" | "lt" | "lte" | "between"
  | "is_null" | "is_not_null";
export type AggregateFunction = "COUNT" | "SUM" | "AVG" | "MIN" | "MAX";

export interface ReportField {
  key: string;
  label: string;
  type: ReportFieldType;
  sql: string;
  operators: ReportOperator[];
  aggregatable?: boolean;
}

interface ReportSource {
  key: string;
  label: string;
  description: string;
  countrySql: string;
  fromSql: string;
  baseWhere?: string;
  fields: ReportField[];
  defaultFields: string[];
}

export interface ReportFilterInput {
  field: string;
  operator: ReportOperator;
  value?: unknown;
  valueTo?: unknown;
}

export interface ReportAggregationInput {
  field: string;
  function: AggregateFunction;
}

export interface ReportDefinition {
  source: string;
  fields: string[];
  filters: ReportFilterInput[];
  groupBy: string[];
  sort?: { field: string; direction?: "asc" | "desc" };
  aggregations: ReportAggregationInput[];
}

interface ValidatedDefinition {
  source: ReportSource;
  fields: ReportField[];
  filters: ReportFilterInput[];
  groupBy: ReportField[];
  sort?: { field: ReportField | null; aggregateIndex: number | null; direction: "ASC" | "DESC" };
  aggregations: ReportAggregationInput[];
}

const TEXT_OPERATORS: ReportOperator[] = ["eq", "neq", "contains", "starts_with", "in", "is_null", "is_not_null"];
const NUMBER_OPERATORS: ReportOperator[] = ["eq", "neq", "gt", "gte", "lt", "lte", "between", "is_null", "is_not_null"];
const DATE_OPERATORS: ReportOperator[] = ["eq", "gt", "gte", "lt", "lte", "between", "is_null", "is_not_null"];
const BOOLEAN_OPERATORS: ReportOperator[] = ["eq", "neq", "is_null", "is_not_null"];

function field(
  key: string,
  label: string,
  type: ReportFieldType,
  sql: string,
  aggregatable = false,
): ReportField {
  return {
    key,
    label,
    type,
    sql,
    aggregatable,
    operators: type === "number" ? NUMBER_OPERATORS
      : type === "boolean" ? BOOLEAN_OPERATORS
      : type === "date" || type === "datetime" ? DATE_OPERATORS
      : TEXT_OPERATORS,
  };
}

const BOOKING_FIELDS: ReportField[] = [
  field("booking_id", "Booking ID", "text", "a.id"),
  field("booking_ref", "Booking Reference", "text", "a.appointment_number"),
  field("booking_status", "Booking Status", "text", "a.status::text"),
  field("payment_status", "Payment Status", "text", "COALESCE(pay.status, a.payment_status)::text"),
  field("payment_method", "Payment Method", "text", "COALESCE(pay.payment_method, a.payment_method)::text"),
  field("visit_type", "Visit Type", "text", "a.visit_type::text"),
  field("country", "Country", "text", "a.country_code::text"),
  field("booking_currency", "Booking Currency", "text", "COALESCE(a.booking_currency, a.display_currency, 'USD')"),
  field("created_at", "Created At", "datetime", "a.created_at"),
  field("appointment_at", "Appointment At", "datetime", "a.start_at"),
  field("patient_name", "Patient Name", "text", "CONCAT_WS(' ', pu.first_name, pu.last_name)"),
  field("patient_email", "Patient Email", "text", "pu.email"),
  field("provider_name", "Provider Name", "text", "CONCAT_WS(' ', pru.first_name, pru.last_name)"),
  field("provider_category", "Provider Category", "text", "prov.provider_type::text"),
  field("service_name", "Service Name", "text", "svc.name"),
  field("booking_amount", "Booking Amount", "number", "a.total_amount", true),
  field("normalized_usd", "Normalized Amount (USD)", "number", "COALESCE(a.final_total_usd, a.total_amount)", true),
  field("provider_commission", "Provider Commission", "number", "a.commission_amount", true),
  field("provider_earnings_usd", "Provider Earnings (USD)", "number", "pe.provider_net_earnings_amount_usd", true),
  field("platform_fee", "Platform Fee", "number", "a.platform_fee_amount", true),
  field("service_tax", "Service Tax", "number", "a.service_tax_amount", true),
  field("platform_tax", "Platform Tax", "number", "a.platform_tax_amount", true),
  field("total_tax", "Total Tax", "number", "a.tax_amount", true),
  field("promo_discount", "Promo Discount", "number", "a.promo_discount", true),
  field("refund_amount", "Refund Amount", "number", "a.refund_amount", true),
  field("earning_status", "Earning Status", "text", "pe.status::text"),
];

const SOURCES: Record<string, ReportSource> = {
  bookings: {
    key: "bookings",
    label: "Bookings",
    description: "Appointments with patient, provider, payment, service, pricing, tax, and earnings context.",
    countrySql: "a.country_code::text",
    fromSql: `
      FROM appointments a
      JOIN users pu ON pu.id = a.patient_id
      JOIN providers prov ON prov.id = a.provider_id
      JOIN users pru ON pru.id = prov.user_id
      LEFT JOIN services svc ON svc.id = a.service_id
      LEFT JOIN LATERAL (
        SELECT p.status, p.payment_method
        FROM payments p
        WHERE p.appointment_id = a.id
        ORDER BY p.created_at DESC NULLS LAST, p.id DESC
        LIMIT 1
      ) pay ON true
      LEFT JOIN LATERAL (
        SELECT pe.provider_net_earnings_amount_usd, pe.status
        FROM provider_earnings pe
        WHERE pe.appointment_id = a.id
        ORDER BY pe.created_at DESC NULLS LAST, pe.id DESC
        LIMIT 1
      ) pe ON true
    `,
    fields: BOOKING_FIELDS,
    defaultFields: ["booking_ref", "booking_status", "payment_status", "patient_name", "provider_name", "service_name", "booking_amount", "normalized_usd"],
  },
  customers: {
    key: "customers",
    label: "Customers",
    description: "Patient accounts with account status and wallet context.",
    countrySql: "u.country_code::text",
    fromSql: `
      FROM users u
      LEFT JOIN wallets w ON w.user_id = u.id
    `,
    baseWhere: "u.role::text = 'patient' AND COALESCE(u.is_deleted, false) = false",
    fields: [
      field("customer_id", "Customer ID", "text", "u.id"),
      field("name", "Name", "text", "CONCAT_WS(' ', u.first_name, u.last_name)"),
      field("email", "Email", "text", "u.email"),
      field("country", "Country", "text", "u.country_code::text"),
      field("city", "City", "text", "u.city"),
      field("is_email_verified", "Email Verified", "boolean", "u.is_email_verified"),
      field("is_suspended", "Suspended", "boolean", "u.is_suspended"),
      field("created_at", "Created At", "datetime", "u.created_at"),
      field("wallet_balance_usd", "Wallet Balance (USD)", "number", "w.balance", true),
      field("wallet_currency", "Wallet Currency", "text", "w.currency"),
    ],
    defaultFields: ["name", "email", "country", "is_email_verified", "is_suspended", "created_at", "wallet_balance_usd"],
  },
  providers: {
    key: "providers",
    label: "Providers",
    description: "Provider profiles with verification, availability, and canonical wallet balances.",
    countrySql: "prov.country_code::text",
    fromSql: `
      FROM providers prov
      JOIN users pu ON pu.id = prov.user_id
      LEFT JOIN provider_wallets pw ON pw.provider_id = prov.id
    `,
    fields: [
      field("provider_id", "Provider ID", "text", "prov.id"),
      field("name", "Name", "text", "CONCAT_WS(' ', pu.first_name, pu.last_name)"),
      field("email", "Email", "text", "pu.email"),
      field("category", "Provider Category", "text", "prov.provider_type::text"),
      field("status", "Status", "text", "prov.status"),
      field("country", "Country", "text", "prov.country_code::text"),
      field("city", "City", "text", "prov.city"),
      field("is_verified", "Verified", "boolean", "prov.is_verified"),
      field("is_active", "Active", "boolean", "prov.is_active"),
      field("bookings_enabled", "Bookings Enabled", "boolean", "prov.bookings_enabled"),
      field("years_experience", "Years Experience", "number", "prov.years_experience", true),
      field("created_at", "Created At", "datetime", "prov.created_at"),
      field("available_balance_usd", "Available Balance (USD)", "number", "pw.available_balance", true),
      field("pending_balance_usd", "Pending Balance (USD)", "number", "pw.pending_balance", true),
      field("lifetime_earnings_usd", "Lifetime Earnings (USD)", "number", "pw.lifetime_earnings", true),
      field("wallet_currency", "Wallet Currency", "text", "pw.currency"),
    ],
    defaultFields: ["name", "email", "category", "status", "country", "is_verified", "bookings_enabled", "available_balance_usd"],
  },
  payments: {
    key: "payments",
    label: "Payments",
    description: "Payment records with booking, customer, provider, refund, and canonical USD amounts.",
    countrySql: "pay.country_code::text",
    fromSql: `
      FROM payments pay
      LEFT JOIN appointments a ON a.id = pay.appointment_id
      LEFT JOIN users pu ON pu.id = pay.patient_id
      LEFT JOIN providers prov ON prov.id = a.provider_id
      LEFT JOIN users pru ON pru.id = prov.user_id
    `,
    fields: [
      field("payment_id", "Payment ID", "text", "pay.id"),
      field("appointment_id", "Appointment ID", "text", "pay.appointment_id"),
      field("booking_ref", "Booking Reference", "text", "a.appointment_number"),
      field("status", "Status", "text", "pay.status::text"),
      field("payment_method", "Payment Method", "text", "pay.payment_method"),
      field("amount", "Amount", "number", "pay.amount", true),
      field("paid_amount_usd", "Paid Amount (USD)", "number", "pay.paid_amount_usd", true),
      field("remaining_amount_usd", "Remaining Amount (USD)", "number", "pay.remaining_amount_usd", true),
      field("refunded_amount", "Refunded Amount", "number", "pay.refunded_amount", true),
      field("currency", "Currency", "text", "pay.currency"),
      field("country", "Country", "text", "pay.country_code::text"),
      field("patient_name", "Customer Name", "text", "CONCAT_WS(' ', pu.first_name, pu.last_name)"),
      field("provider_name", "Provider Name", "text", "CONCAT_WS(' ', pru.first_name, pru.last_name)"),
      field("created_at", "Created At", "datetime", "pay.created_at"),
    ],
    defaultFields: ["booking_ref", "status", "payment_method", "paid_amount_usd", "refunded_amount", "currency", "provider_name", "created_at"],
  },
  earnings: {
    key: "earnings",
    label: "Provider Earnings",
    description: "Provider earnings and payout records. Monetary values are canonical USD unless marked local/display.",
    countrySql: "prov.country_code::text",
    fromSql: `
      FROM provider_earnings pe
      JOIN providers prov ON prov.id = pe.provider_id
      JOIN users pu ON pu.id = prov.user_id
      LEFT JOIN appointments a ON a.id = pe.appointment_id
    `,
    fields: [
      field("earning_id", "Earning ID", "text", "pe.id"),
      field("appointment_id", "Appointment ID", "text", "pe.appointment_id"),
      field("provider_name", "Provider Name", "text", "CONCAT_WS(' ', pu.first_name, pu.last_name)"),
      field("status", "Earning Status", "text", "pe.status::text"),
      field("total_amount_usd", "Total Amount (USD)", "number", "pe.total_amount", true),
      field("platform_fee_usd", "Platform Fee (USD)", "number", "pe.platform_fee", true),
      field("provider_earning_usd", "Provider Earning (USD)", "number", "pe.provider_earning", true),
      field("provider_net_earnings_usd", "Provider Net Earnings (USD)", "number", "pe.provider_net_earnings_amount_usd", true),
      field("display_currency", "Display Currency", "text", "pe.display_currency"),
      field("display_amount", "Display Amount", "number", "pe.display_amount", true),
      field("payout_reference", "Payout Reference", "text", "pe.payout_reference"),
      field("paid_at", "Paid At", "datetime", "pe.paid_at"),
      field("created_at", "Created At", "datetime", "pe.created_at"),
      field("country", "Country", "text", "prov.country_code::text"),
    ],
    defaultFields: ["provider_name", "status", "total_amount_usd", "provider_net_earnings_usd", "display_currency", "payout_reference", "paid_at"],
  },
  wallets: {
    key: "wallets",
    label: "Provider Wallets",
    description: "Provider wallet snapshots and balances in their canonical wallet currency.",
    countrySql: "pw.country_code::text",
    fromSql: `
      FROM provider_wallets pw
      JOIN providers prov ON prov.id = pw.provider_id
      JOIN users pu ON pu.id = prov.user_id
    `,
    fields: [
      field("wallet_id", "Wallet ID", "text", "pw.id"),
      field("provider_id", "Provider ID", "text", "pw.provider_id"),
      field("provider_name", "Provider Name", "text", "CONCAT_WS(' ', pu.first_name, pu.last_name)"),
      field("available_balance", "Available Balance", "number", "pw.available_balance", true),
      field("pending_balance", "Pending Balance", "number", "pw.pending_balance", true),
      field("held_balance", "Held Balance", "number", "pw.held_balance", true),
      field("lifetime_earnings", "Lifetime Earnings", "number", "pw.lifetime_earnings", true),
      field("currency", "Currency", "text", "pw.currency"),
      field("is_frozen", "Frozen", "boolean", "pw.is_frozen"),
      field("country", "Country", "text", "pw.country_code::text"),
      field("last_payout_date", "Last Payout Date", "datetime", "pw.last_payout_date"),
      field("updated_at", "Updated At", "datetime", "pw.updated_at"),
    ],
    defaultFields: ["provider_name", "available_balance", "pending_balance", "lifetime_earnings", "currency", "is_frozen", "last_payout_date"],
  },
  ledger: {
    key: "ledger",
    label: "Provider Ledger",
    description: "Append-only provider settlement movements and reconciliation references.",
    countrySql: "pl.country_code::text",
    fromSql: `
      FROM provider_ledger pl
      JOIN providers prov ON prov.id = pl.provider_id
      JOIN users pu ON pu.id = prov.user_id
    `,
    fields: [
      field("ledger_id", "Ledger ID", "text", "pl.id"),
      field("provider_name", "Provider Name", "text", "CONCAT_WS(' ', pu.first_name, pu.last_name)"),
      field("entry_type", "Entry Type", "text", "pl.entry_type"),
      field("amount_usd", "Amount (USD)", "number", "COALESCE(pl.amount_usd, pl.amount)", true),
      field("currency", "Currency", "text", "pl.currency"),
      field("reference_id", "Reference ID", "text", "pl.reference_id"),
      field("description", "Description", "text", "pl.description"),
      field("balance_after_usd", "Balance After (USD)", "number", "pl.balance_after", true),
      field("country", "Country", "text", "pl.country_code::text"),
      field("created_at", "Created At", "datetime", "pl.created_at"),
    ],
    defaultFields: ["provider_name", "entry_type", "amount_usd", "currency", "reference_id", "balance_after_usd", "created_at"],
  },
  services: {
    key: "services",
    label: "Services",
    description: "Provider service catalogue, prices, currencies, and visit configuration.",
    countrySql: "svc.country_code::text",
    fromSql: `
      FROM services svc
      JOIN providers prov ON prov.id = svc.provider_id
      JOIN users pu ON pu.id = prov.user_id
      LEFT JOIN sub_services ss ON ss.id = svc.sub_service_id
    `,
    fields: [
      field("service_id", "Service ID", "text", "svc.id"),
      field("service_name", "Service Name", "text", "svc.name"),
      field("provider_name", "Provider Name", "text", "CONCAT_WS(' ', pu.first_name, pu.last_name)"),
      field("provider_category", "Provider Category", "text", "prov.provider_type::text"),
      field("sub_service", "Sub-service", "text", "ss.name"),
      field("price", "Price", "number", "svc.price", true),
      field("currency", "Currency", "text", "svc.currency"),
      field("duration_minutes", "Duration (minutes)", "number", "svc.duration", true),
      field("location_mode", "Location Mode", "text", "svc.location_mode"),
      field("is_active", "Active", "boolean", "svc.is_active"),
      field("country", "Country", "text", "svc.country_code::text"),
      field("created_at", "Created At", "datetime", "svc.created_at"),
    ],
    defaultFields: ["service_name", "provider_name", "provider_category", "price", "currency", "duration_minutes", "location_mode", "is_active"],
  },
};

const sourceList = Object.values(SOURCES).map(source => ({
  key: source.key,
  label: source.label,
  description: source.description,
  defaultFields: source.defaultFields,
  fields: source.fields.map(({ sql: _sql, ...metadata }) => metadata),
}));

function uniqueStrings(values: unknown, label: string, max: number): string[] {
  if (!Array.isArray(values)) throw new Error(`${label} must be an array`);
  if (values.length > max) throw new Error(`${label} cannot contain more than ${max} items`);
  const result = [...new Set(values.map(value => String(value)))];
  if (result.some(value => !value || value.length > 80)) throw new Error(`Invalid ${label} value`);
  return result;
}

function normalizeValue(fieldDef: ReportField, value: unknown, label: string): string | boolean | number | string[] {
  if (Array.isArray(value)) {
    if (value.length === 0 || value.length > 50) throw new Error(`${label} list is invalid`);
    return value.map(item => String(item).slice(0, 500));
  }
  if (value === undefined || value === null || String(value).length === 0) {
    throw new Error(`${label} is required`);
  }
  if (fieldDef.type === "number") {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw new Error(`${label} must be numeric`);
    return parsed;
  }
  if (fieldDef.type === "boolean") {
    if (value === true || value === "true") return true;
    if (value === false || value === "false") return false;
    throw new Error(`${label} must be true or false`);
  }
  if (fieldDef.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    throw new Error(`${label} must be a date`);
  }
  if (fieldDef.type === "datetime" && Number.isNaN(Date.parse(String(value)))) {
    throw new Error(`${label} must be a valid date/time`);
  }
  return String(value).slice(0, 500);
}

function validateDefinition(input: unknown): ValidatedDefinition {
  if (!input || typeof input !== "object") throw new Error("Report definition is required");
  const raw = input as Partial<ReportDefinition>;
  const source = SOURCES[String(raw.source ?? "")];
  if (!source) throw new Error("Select a valid report data source");
  const fieldMap = new Map(source.fields.map(item => [item.key, item]));
  const selectedKeys = uniqueStrings(raw.fields ?? source.defaultFields, "Selected fields", 50);
  const fields = selectedKeys.map(key => {
    const item = fieldMap.get(key);
    if (!item) throw new Error(`Field is not available for this source: ${key}`);
    return item;
  });
  const groupKeys = uniqueStrings(raw.groupBy ?? [], "Group by fields", 20);
  const groupBy = groupKeys.map(key => {
    const item = fieldMap.get(key);
    if (!item) throw new Error(`Group field is not available for this source: ${key}`);
    if (!selectedKeys.includes(key)) throw new Error(`Group field must be selected: ${key}`);
    return item;
  });
  if (groupBy.length && fields.some(item => !groupKeys.includes(item.key))) {
    throw new Error("Every selected field must also be in Group By");
  }
  const rawAggregations = Array.isArray(raw.aggregations) ? raw.aggregations : [];
  if (rawAggregations.length > 12) throw new Error("Too many aggregations");
  const aggregations = rawAggregations.map((item: any) => {
    const fn = String(item?.function ?? "").toUpperCase() as AggregateFunction;
    if (!["COUNT", "SUM", "AVG", "MIN", "MAX"].includes(fn)) throw new Error("Invalid aggregation");
    const key = String(item?.field ?? "");
    if (fn !== "COUNT" && key === "__all__") throw new Error(`${fn} requires a numeric field`);
    if (key !== "__all__") {
      const itemField = fieldMap.get(key);
      if (!itemField) throw new Error(`Aggregation field is not available: ${key}`);
      if (fn !== "COUNT" && !itemField.aggregatable) throw new Error(`${fn} cannot be used on ${key}`);
    }
    return { field: key, function: fn };
  });
  if (aggregations.length && fields.some(item => !groupKeys.includes(item.key))) {
    throw new Error("When using aggregations, every selected field must also be in Group By");
  }
  if (!fields.length && !aggregations.length) {
    throw new Error("Select at least one field or aggregation");
  }
  const rawFilters = Array.isArray(raw.filters) ? raw.filters : [];
  if (rawFilters.length > 20) throw new Error("Too many filters");
  const filters = rawFilters.map((item: any) => {
    const filterField = fieldMap.get(String(item?.field ?? ""));
    const operator = String(item?.operator ?? "") as ReportOperator;
    if (!filterField || !filterField.operators.includes(operator)) throw new Error("Invalid filter field or operator");
    const normalized: ReportFilterInput = { field: filterField.key, operator };
    if (!["is_null", "is_not_null"].includes(operator)) {
      normalized.value = normalizeValue(filterField, item.value, "Filter value");
      if (operator === "between") normalized.valueTo = normalizeValue(filterField, item.valueTo, "Second filter value");
      if (operator === "in" && !Array.isArray(normalized.value)) {
        normalized.value = [normalized.value];
      }
    }
    return normalized;
  });
  let sort: ValidatedDefinition["sort"];
  if (raw.sort?.field) {
    const direction = raw.sort.direction === "asc" ? "ASC" : "DESC";
    const sortField = fieldMap.get(String(raw.sort.field));
    const aggregateIndex = /^agg_(\d+)$/.test(String(raw.sort.field))
      ? Number(String(raw.sort.field).slice(4))
      : null;
    if (!sortField && (aggregateIndex === null || !aggregations[aggregateIndex])) {
      throw new Error("Invalid sort field");
    }
    if (sortField && !selectedKeys.includes(sortField.key)) throw new Error("Sort field must be selected");
    sort = { field: sortField ?? null, aggregateIndex, direction };
  }
  return { source, fields, filters, groupBy, sort, aggregations };
}

function pushParam(params: unknown[], value: unknown): string {
  params.push(value);
  return `$${params.length}`;
}

function typedParam(fieldDef: ReportField, params: unknown[], value: unknown): string {
  const placeholder = pushParam(params, value);
  if (fieldDef.type === "number") return `${placeholder}::numeric`;
  if (fieldDef.type === "boolean") return `${placeholder}::boolean`;
  if (fieldDef.type === "date") return `${placeholder}::date`;
  if (fieldDef.type === "datetime") return `${placeholder}::timestamptz`;
  return placeholder;
}

function buildFilterSql(filter: ReportFilterInput, fieldDef: ReportField, params: unknown[]): string {
  const expression = fieldDef.sql;
  if (filter.operator === "is_null") return `${expression} IS NULL`;
  if (filter.operator === "is_not_null") return `${expression} IS NOT NULL`;
  if (filter.operator === "contains") return `${expression} ILIKE ${pushParam(params, `%${String(filter.value)}%`)}`;
  if (filter.operator === "starts_with") return `${expression} ILIKE ${pushParam(params, `${String(filter.value)}%`)}`;
  if (filter.operator === "in") {
    const list = Array.isArray(filter.value) ? filter.value : [filter.value];
    const placeholder = pushParam(params, list);
    const cast = fieldDef.type === "number" ? "numeric[]" : fieldDef.type === "boolean" ? "boolean[]" : "text[]";
    return `${expression} = ANY(${placeholder}::${cast})`;
  }
  if (filter.operator === "between") {
    return `${expression} BETWEEN ${typedParam(fieldDef, params, filter.value)} AND ${typedParam(fieldDef, params, filter.valueTo)}`;
  }
  const comparison: Record<string, string> = { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=" };
  return `${expression} ${comparison[filter.operator] ?? "="} ${typedParam(fieldDef, params, filter.value)}`;
}

function alias(key: string): string {
  return `"${key.replace(/"/g, "")}"`;
}

function buildQuery(definition: ValidatedDefinition, countryFilter: string | null, page: number, limit: number) {
  const params: unknown[] = [];
  const where: string[] = [];
  if (definition.source.baseWhere) where.push(definition.source.baseWhere);
  if (countryFilter) where.push(`${definition.source.countrySql} = ${pushParam(params, countryFilter)}`);
  const fieldMap = new Map(definition.source.fields.map(item => [item.key, item]));
  for (const filter of definition.filters) {
    const filterField = fieldMap.get(filter.field)!;
    where.push(buildFilterSql(filter, filterField, params));
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const selectedSql = definition.fields.map(item => `${item.sql} AS ${alias(item.key)}`);
  const aggregateSql = definition.aggregations.map((item, index) => {
    const expression = item.field === "__all__" ? "*" : fieldMap.get(item.field)!.sql;
    return `${item.function}(${expression}) AS ${alias(`agg_${index}`)}`;
  });
  const groupSql = definition.groupBy.length
    ? `GROUP BY ${definition.groupBy.map(item => item.sql).join(", ")}`
    : "";
  let orderSql = definition.groupBy.length ? "1 ASC" : "1 ASC";
  if (definition.sort) {
    orderSql = definition.sort.aggregateIndex !== null
      ? `${alias(`agg_${definition.sort.aggregateIndex}`)} ${definition.sort.direction}`
      : `${definition.sort.field!.sql} ${definition.sort.direction}`;
  }
  const fromSql = `${definition.source.fromSql}\n${whereSql}`;
  const offset = (page - 1) * limit;
  const limitPlaceholder = pushParam(params, limit);
  const offsetPlaceholder = pushParam(params, offset);
  const dataSql = `
    SELECT ${[...selectedSql, ...aggregateSql].join(", ")}
    ${fromSql}
    ${groupSql}
    ORDER BY ${orderSql}
    LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}
  `;
  const countSql = definition.groupBy.length
    ? `SELECT COUNT(*)::int AS total FROM (SELECT 1 ${fromSql} ${groupSql}) grouped`
    : `SELECT COUNT(*)::int AS total ${fromSql}`;
  return { dataSql, countSql, params, columns: [
    ...definition.fields.map(item => ({ key: item.key, label: item.label, type: item.type })),
    ...definition.aggregations.map((item, index) => ({
      key: `agg_${index}`,
      label: `${item.function}(${item.field === "__all__" ? "All Rows" : fieldMap.get(item.field)!.label})`,
      type: "number" as const,
    })),
  ] };
}

export function getCustomReportMetadata() {
  return { sources: sourceList, operators: {
    eq: "Equals", neq: "Does not equal", contains: "Contains", starts_with: "Starts with",
    in: "Is one of", gt: "Greater than", gte: "At least", lt: "Less than", lte: "At most",
    between: "Between", is_null: "Is empty", is_not_null: "Is not empty",
  } };
}

export async function executeCustomReport(
  input: unknown,
  countryFilter: string | null,
  page = 1,
  limit = 50,
  maxLimit = 100,
) {
  const definition = validateDefinition(input);
  const safePage = Math.max(1, Math.min(10000, Number(page) || 1));
  const safeLimit = Math.max(1, Math.min(maxLimit, Number(limit) || 50));
  const query = buildQuery(definition, countryFilter, safePage, safeLimit);
  const [rowsResult, countResult] = await Promise.all([
    pool.query(query.dataSql, query.params),
    pool.query(query.countSql, query.params.slice(0, -2)),
  ]);
  const total = Number(countResult.rows[0]?.total ?? 0);
  return {
    rows: rowsResult.rows,
    columns: query.columns,
    total,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.max(1, Math.ceil(total / safeLimit)),
  };
}

export function validateCustomReportDefinition(input: unknown): ReportDefinition {
  const definition = validateDefinition(input);
  return {
    source: definition.source.key,
    fields: definition.fields.map(item => item.key),
    filters: definition.filters,
    groupBy: definition.groupBy.map(item => item.key),
    sort: definition.sort
      ? { field: definition.sort.aggregateIndex !== null ? `agg_${definition.sort.aggregateIndex}` : definition.sort.field!.key, direction: definition.sort.direction.toLowerCase() as "asc" | "desc" }
      : undefined,
    aggregations: definition.aggregations,
  };
}