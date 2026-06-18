interface IcsEvent {
  uid: string;
  title: string;
  description?: string;
  location?: string;
  date: string;
  startTime: string;
  endTime: string;
  organizerName?: string;
  organizerEmail?: string;
}

function formatDateTime(date: string, time: string): string {
  const [y, m, d] = date.split("-");
  const [hh, mm] = time.split(":");
  const dt = new Date(Date.UTC(
    parseInt(y),
    parseInt(m) - 1,
    parseInt(d),
    parseInt(hh),
    parseInt(mm),
  ));
  return dt.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeIcsText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

export function generateIcsContent(event: IcsEvent): string {
  const dtStart = formatDateTime(event.date, event.startTime);
  const dtEnd = formatDateTime(event.date, event.endTime || event.startTime);
  const dtStamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//GoldenLife//Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.uid}@goldenlife.health`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
  ];
  if (event.description) lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`);
  if (event.location) lines.push(`LOCATION:${escapeIcsText(event.location)}`);
  if (event.organizerName && event.organizerEmail) {
    lines.push(`ORGANIZER;CN=${escapeIcsText(event.organizerName)}:mailto:${event.organizerEmail}`);
  }
  lines.push("STATUS:CONFIRMED");
  lines.push("END:VEVENT");
  lines.push("END:VCALENDAR");

  return lines.join("\r\n");
}

export function icsAttachment(filename: string, event: IcsEvent) {
  return {
    filename,
    content: Buffer.from(generateIcsContent(event)).toString("base64"),
  };
}
