type ToastData = {
  title?: string;
  description?: string;
  variant?: "default" | "destructive";
  [key: string]: unknown;
};
type ToastFn = (props: ToastData) => void;

let _toast: ToastFn | null = null;

export function registerToast(fn: ToastFn) {
  _toast = fn;
}

function emit(props: ToastData) {
  if (_toast) _toast(props);
}

export const showSuccess = (title: string, description?: string) =>
  emit({ title, description, className: "border-emerald-400 dark:border-emerald-500" });

export const showError = (title: string, description?: string) =>
  emit({ title, description, variant: "destructive" });

export const showWarning = (title: string, description?: string) =>
  emit({ title, description, className: "border-amber-400 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-500" });

export const showInfo = (title: string, description?: string) =>
  emit({ title, description, className: "border-sky-400 bg-sky-50 dark:bg-sky-950/30 dark:border-sky-500" });

export const showLoading = (title: string, description?: string) =>
  emit({ title, description, className: "border-violet-400 bg-violet-50 dark:bg-violet-950/30 dark:border-violet-500" });
