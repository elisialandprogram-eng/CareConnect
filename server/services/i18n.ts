/**
 * Server-side i18n for emails / SMS / push / WhatsApp.
 * Supports English (en), Hungarian (hu), Persian/Farsi (fa).
 * Falls back to en if the requested language is missing a key.
 */

export type Lang = "en" | "hu" | "fa";

type Dict = Record<string, string>;
type Bundle = Record<Lang, Dict>;

const STRINGS: Bundle = {
  en: {
    "footer.signature": "Thank you for choosing GoldenLife.",
    "footer.automated": "This is an automated message, please do not reply.",
    // appointment events
    "appt.confirm.subject": "Booking confirmed — GoldenLife",
    "appt.confirm.heading": "Booking confirmed!",
    "appt.confirm.intro": "Your appointment is on the books. Details below.",
    "appt.reschedule.subject": "Appointment rescheduled — GoldenLife",
    "appt.reschedule.heading": "Your appointment has been rescheduled",
    "appt.reschedule.intro": "Please review the new time below.",
    "appt.cancel.subject": "Appointment cancelled — GoldenLife",
    "appt.cancel.heading": "Your appointment was cancelled",
    "appt.cancel.intro": "Sorry for the inconvenience. You can re-book any time.",
    "appt.reminder24.subject": "Reminder: appointment tomorrow — GoldenLife",
    "appt.reminder24.heading": "Appointment in 24 hours",
    "appt.reminder1.subject": "Reminder: appointment in 1 hour — GoldenLife",
    "appt.reminder1.heading": "Appointment in 1 hour",
    "appt.reminder15.subject": "Reminder: appointment in 15 minutes — GoldenLife",
    "appt.reminder15.heading": "Appointment in 15 minutes",
    "appt.postvisit.subject": "How was your visit? — GoldenLife",
    "appt.postvisit.heading": "Tell us about your visit",
    "appt.postvisit.intro": "We'd love your feedback — it takes less than a minute.",
    "appt.payment.subject": "Payment receipt — GoldenLife",
    "appt.payment.heading": "Payment received",
    "review.reply.subject": "Reply to your review — GoldenLife",
    "review.reply.heading": "Your provider replied to your review",
    // labels
    "label.date": "Date",
    "label.time": "Time",
    "label.provider": "Provider",
    "label.service": "Service",
    "label.amount": "Amount",
    "label.status": "Status",
  },
  hu: {
    "footer.signature": "Köszönjük, hogy a GoldenLife-t választotta.",
    "footer.automated": "Ez egy automatikus üzenet, kérjük, ne válaszoljon rá.",
    "appt.confirm.subject": "Foglalás megerősítve — GoldenLife",
    "appt.confirm.heading": "Foglalás megerősítve!",
    "appt.confirm.intro": "Az időpontja megerősítve. A részletek lent.",
    "appt.reschedule.subject": "Időpont átütemezve — GoldenLife",
    "appt.reschedule.heading": "Az időpontját átütemeztük",
    "appt.reschedule.intro": "Kérjük, ellenőrizze az új időpontot.",
    "appt.cancel.subject": "Időpont lemondva — GoldenLife",
    "appt.cancel.heading": "Az időpontját lemondtuk",
    "appt.cancel.intro": "Elnézést a kellemetlenségért. Bármikor újrafoglalhat.",
    "appt.reminder24.subject": "Emlékeztető: időpont holnap — GoldenLife",
    "appt.reminder24.heading": "Időpont 24 óra múlva",
    "appt.reminder1.subject": "Emlékeztető: időpont 1 óra múlva — GoldenLife",
    "appt.reminder1.heading": "Időpont 1 óra múlva",
    "appt.reminder15.subject": "Emlékeztető: időpont 15 perc múlva — GoldenLife",
    "appt.reminder15.heading": "Időpont 15 perc múlva",
    "appt.postvisit.subject": "Milyen volt a látogatása? — GoldenLife",
    "appt.postvisit.heading": "Mondja el véleményét",
    "appt.postvisit.intro": "Kérjük, ossza meg tapasztalatait — kevesebb mint egy percet vesz igénybe.",
    "appt.payment.subject": "Fizetési bizonylat — GoldenLife",
    "appt.payment.heading": "Fizetés megérkezett",
    "review.reply.subject": "Válasz az értékelésére — GoldenLife",
    "review.reply.heading": "A szolgáltató válaszolt az értékelésére",
    "label.date": "Dátum",
    "label.time": "Idő",
    "label.provider": "Szolgáltató",
    "label.service": "Szolgáltatás",
    "label.amount": "Összeg",
    "label.status": "Állapot",
  },
  fa: {
    "footer.signature": "از انتخاب گلدن‌لایف سپاسگزاریم.",
    "footer.automated": "این یک پیام خودکار است، لطفاً پاسخ ندهید.",
    "appt.confirm.subject": "رزرو تأیید شد — GoldenLife",
    "appt.confirm.heading": "رزرو شما تأیید شد!",
    "appt.confirm.intro": "نوبت شما ثبت شد. جزئیات در ادامه.",
    "appt.reschedule.subject": "نوبت تغییر یافت — GoldenLife",
    "appt.reschedule.heading": "نوبت شما تغییر یافت",
    "appt.reschedule.intro": "لطفاً زمان جدید را بررسی کنید.",
    "appt.cancel.subject": "نوبت لغو شد — GoldenLife",
    "appt.cancel.heading": "نوبت شما لغو شد",
    "appt.cancel.intro": "بابت ناراحتی پیش‌آمده عذرخواهیم. می‌توانید مجدداً نوبت بگیرید.",
    "appt.reminder24.subject": "یادآوری: نوبت فردا — GoldenLife",
    "appt.reminder24.heading": "نوبت در ۲۴ ساعت آینده",
    "appt.reminder1.subject": "یادآوری: نوبت تا یک ساعت دیگر — GoldenLife",
    "appt.reminder1.heading": "نوبت تا ۱ ساعت دیگر",
    "appt.reminder15.subject": "یادآوری: نوبت تا ۱۵ دقیقه دیگر — GoldenLife",
    "appt.reminder15.heading": "نوبت تا ۱۵ دقیقه دیگر",
    "appt.postvisit.subject": "بازدید شما چطور بود؟ — GoldenLife",
    "appt.postvisit.heading": "نظر خود را با ما در میان بگذارید",
    "appt.postvisit.intro": "نظر شما برای ما ارزشمند است — کمتر از یک دقیقه طول می‌کشد.",
    "appt.payment.subject": "رسید پرداخت — GoldenLife",
    "appt.payment.heading": "پرداخت دریافت شد",
    "review.reply.subject": "پاسخ به نظر شما — GoldenLife",
    "review.reply.heading": "ارائه‌دهنده به نظر شما پاسخ داد",
    "label.date": "تاریخ",
    "label.time": "زمان",
    "label.provider": "ارائه‌دهنده",
    "label.service": "خدمت",
    "label.amount": "مبلغ",
    "label.status": "وضعیت",
  },
};

export function t(key: string, lang: Lang | string | null | undefined = "en"): string {
  const l: Lang = (lang as Lang) in STRINGS ? (lang as Lang) : "en";
  return STRINGS[l][key] ?? STRINGS.en[key] ?? key;
}

export function normalizeLang(lang: string | null | undefined): Lang {
  if (!lang) return "en";
  const lower = lang.toLowerCase().slice(0, 2);
  return (["en", "hu", "fa"].includes(lower) ? lower : "en") as Lang;
}
