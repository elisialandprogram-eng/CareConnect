import { t, type Lang } from "../i18n";

const baseStyles = `font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #0f172a;`;
const cardStyles = `background:#f8fafc;padding:16px;border-radius:8px;margin:16px 0;border:1px solid #e2e8f0;`;
const footerStyles = `color:#64748b;font-size:12px;margin-top:24px;line-height:1.5;`;

export interface DetailRow { label: string; value: string }

export function renderEvent(opts: {
  lang: Lang;
  headingKey: string;
  introKey?: string;
  intro?: string;
  details?: DetailRow[];
  cta?: { label: string; url: string };
  rtl?: boolean;
}): string {
  const isRtl = opts.rtl ?? opts.lang === "fa";
  const dir = isRtl ? "rtl" : "ltr";
  const heading = t(opts.headingKey, opts.lang);
  const intro = opts.intro ?? (opts.introKey ? t(opts.introKey, opts.lang) : "");
  const details = (opts.details || [])
    .map(d => `<p style="margin:6px 0;"><strong>${escapeHtml(d.label)}:</strong> ${escapeHtml(d.value)}</p>`)
    .join("");
  const cta = opts.cta
    ? `<p style="margin:20px 0;"><a href="${escapeHtml(opts.cta.url)}" style="display:inline-block;background:#0f766e;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;">${escapeHtml(opts.cta.label)}</a></p>`
    : "";
  return `<!doctype html><html dir="${dir}"><body style="${baseStyles}">
    <h2 style="margin-top:0;">${escapeHtml(heading)}</h2>
    ${intro ? `<p>${escapeHtml(intro)}</p>` : ""}
    ${details ? `<div style="${cardStyles}">${details}</div>` : ""}
    ${cta}
    <div style="${footerStyles}">
      ${escapeHtml(t("footer.signature", opts.lang))}<br>
      <em>${escapeHtml(t("footer.automated", opts.lang))}</em>
    </div>
  </body></html>`;
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
