import { CheckCircle2, Circle, Clock, Info, MapPin, Video, Home, FileText, CreditCard, Phone } from "lucide-react";

interface CheckItem {
  id: string;
  icon: React.ReactNode;
  text: string;
  done?: boolean;
}

interface Props {
  visitType: string;
  appointmentDate: string;
  startTime: string;
  /** Authoritative UTC ISO string (start_at column). Used for exact countdown. */
  startAtUtc?: string | null;
  providerName?: string;
  patientAddress?: string | null;
  meetingLink?: string | null;
  paymentStatus?: string | null;
  hasNotes?: boolean;
  className?: string;
}

function getChecklist(props: Props): CheckItem[] {
  const { visitType, paymentStatus, patientAddress, meetingLink, hasNotes } = props;

  const items: CheckItem[] = [];

  if (paymentStatus === "completed" || paymentStatus === "paid") {
    items.push({ id: "payment", icon: <CreditCard className="h-4 w-4" />, text: "Payment confirmed", done: true });
  } else if (paymentStatus === "pending") {
    items.push({ id: "payment", icon: <CreditCard className="h-4 w-4" />, text: "Complete payment before your appointment", done: false });
  }

  if (visitType === "online") {
    items.push({ id: "link", icon: <Video className="h-4 w-4" />, text: "Test your camera and microphone", done: false });
    if (meetingLink) {
      items.push({ id: "joinlink", icon: <Video className="h-4 w-4" />, text: "Meeting link is ready — join from the details page", done: true });
    }
    items.push({ id: "quiet", icon: <Info className="h-4 w-4" />, text: "Find a quiet, well-lit space", done: false });
    items.push({ id: "device", icon: <Phone className="h-4 w-4" />, text: "Ensure your device is charged", done: false });
  }

  if (visitType === "home") {
    if (patientAddress) {
      items.push({ id: "address", icon: <MapPin className="h-4 w-4" />, text: "Address confirmed — provider will visit you", done: true });
    } else {
      items.push({ id: "address", icon: <MapPin className="h-4 w-4" />, text: "Confirm your address with the provider", done: false });
    }
    items.push({ id: "home-prep", icon: <Home className="h-4 w-4" />, text: "Prepare a clean, accessible space for your session", done: false });
    items.push({ id: "id", icon: <FileText className="h-4 w-4" />, text: "Have a valid ID ready for verification", done: false });
  }

  if (visitType === "clinic") {
    items.push({ id: "arrive", icon: <Clock className="h-4 w-4" />, text: "Arrive 10 minutes early", done: false });
    items.push({ id: "docs", icon: <FileText className="h-4 w-4" />, text: "Bring any relevant medical documents or test results", done: false });
    items.push({ id: "insurance", icon: <CreditCard className="h-4 w-4" />, text: "Bring your insurance card if applicable", done: false });
  }

  if (hasNotes) {
    items.push({ id: "notes", icon: <FileText className="h-4 w-4" />, text: "Your appointment notes have been shared with the provider", done: true });
  }

  return items;
}

export function PreparationPanel(props: Props) {
  const { visitType, appointmentDate, startTime, startAtUtc, providerName, className = "" } = props;

  // Prefer the authoritative UTC timestamp; fall back to wall-clock parse.
  let apptEpoch: number;
  if (startAtUtc) {
    const utc = new Date(startAtUtc);
    apptEpoch = isNaN(utc.getTime()) ? 0 : utc.getTime();
  } else {
    const [h, m] = (startTime || "00:00").split(":").map(Number);
    const d = new Date(`${appointmentDate.slice(0, 10)}T00:00:00`);
    d.setHours(h, m, 0, 0);
    apptEpoch = d.getTime();
  }
  const hoursUntil = (apptEpoch - Date.now()) / 3_600_000;

  if (hoursUntil < 0 || hoursUntil > 48) return null;

  const checklist = getChecklist(props);
  const doneCount = checklist.filter(c => c.done).length;
  const visitIcon = visitType === "online" ? <Video className="h-4 w-4" /> : visitType === "home" ? <Home className="h-4 w-4" /> : <MapPin className="h-4 w-4" />;

  return (
    <div
      className={`rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 p-4 space-y-3 ${className}`}
      data-testid="preparation-panel"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0 text-blue-600 dark:text-blue-400">
            {visitIcon}
          </div>
          <div>
            <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-200">
              {hoursUntil < 2 ? "Your appointment is soon!" : "Prepare for your appointment"}
            </h4>
            {providerName && (
              <p className="text-xs text-blue-700 dark:text-blue-400">with {providerName}</p>
            )}
          </div>
        </div>
        <span className="text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/40 px-2 py-0.5 rounded-full">
          {doneCount}/{checklist.length} ready
        </span>
      </div>

      <div className="space-y-1.5">
        {checklist.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-2.5 text-sm"
            data-testid={`prep-item-${item.id}`}
          >
            {item.done ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
            ) : (
              <Circle className="h-4 w-4 text-blue-400 dark:text-blue-600 shrink-0" />
            )}
            <span className={item.done ? "text-muted-foreground line-through" : "text-blue-900 dark:text-blue-200"}>
              {item.text}
            </span>
            {!item.done && <span className="ml-auto text-blue-500 dark:text-blue-400 shrink-0">{item.icon}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
