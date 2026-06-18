import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Bug, Upload, X, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";

const schema = z.object({
  category: z.string().min(1),
  severity: z.string().min(1),
  title: z.string().min(5, "Title must be at least 5 characters").max(200),
  description: z.string().min(10, "Please describe the problem in more detail").max(5000),
  stepsToReproduce: z.string().max(2000).optional(),
  includeDiagnostics: z.boolean().default(true),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function ReportBugDialog({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [location] = useLocation();
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      category: "bug",
      severity: "medium",
      title: "",
      description: "",
      stepsToReproduce: "",
      includeDiagnostics: true,
    },
  });

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const fd = new FormData();
      fd.append("title", values.title);
      fd.append("description", values.description);
      fd.append("category", values.category);
      fd.append("severity", values.severity);
      if (values.stepsToReproduce) fd.append("stepsToReproduce", values.stepsToReproduce);
      fd.append("includeDiagnostics", String(values.includeDiagnostics));
      fd.append("pageUrl", window.location.href);
      fd.append("browserInfo", navigator.userAgent);
      fd.append("deviceInfo", `${window.screen.width}x${window.screen.height} ${navigator.platform}`);
      if (screenshot) fd.append("screenshot", screenshot);

      const res = await fetch("/api/bug-reports", {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("token") ?? ""}` },
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message ?? "Failed to submit report");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Report submitted",
        description: `Your report has been received. ID: ${data.report?.id?.slice(0, 8).toUpperCase()}`,
      });
      form.reset();
      setScreenshot(null);
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Submission failed", description: err.message });
    },
  });

  const onSubmit = (values: FormValues) => mutation.mutate(values);

  const removeScreenshot = () => {
    setScreenshot(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bug className="h-5 w-5 text-orange-500" />
            Report a Problem
          </DialogTitle>
          <DialogDescription>
            Help us improve by describing what went wrong.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="category" render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-bug-category">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="bug">Bug / Error</SelectItem>
                      <SelectItem value="ui_issue">UI Issue</SelectItem>
                      <SelectItem value="booking_issue">Booking Issue</SelectItem>
                      <SelectItem value="payment_issue">Payment Issue</SelectItem>
                      <SelectItem value="account_issue">Account Issue</SelectItem>
                      <SelectItem value="performance_issue">Performance</SelectItem>
                      <SelectItem value="feature_request">Feature Request</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="severity" render={({ field }) => (
                <FormItem>
                  <FormLabel>Severity</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-bug-severity">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="low">Low — Minor inconvenience</SelectItem>
                      <SelectItem value="medium">Medium — Affects workflow</SelectItem>
                      <SelectItem value="high">High — Blocking feature</SelectItem>
                      <SelectItem value="critical">Critical — App unusable</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="title" render={({ field }) => (
              <FormItem>
                <FormLabel>Title <span className="text-destructive">*</span></FormLabel>
                <FormControl>
                  <Input placeholder="Short summary of the problem" data-testid="input-bug-title" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem>
                <FormLabel>Description <span className="text-destructive">*</span></FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="What happened? What did you expect to happen?"
                    className="min-h-[100px]"
                    data-testid="textarea-bug-description"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="stepsToReproduce" render={({ field }) => (
              <FormItem>
                <FormLabel>Steps to Reproduce <span className="text-muted-foreground text-xs">(optional)</span></FormLabel>
                <FormControl>
                  <Textarea
                    placeholder={"1. Go to...\n2. Click...\n3. See error"}
                    className="min-h-[80px]"
                    data-testid="textarea-bug-steps"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            {/* Screenshot upload */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Screenshot <span className="text-muted-foreground text-xs">(optional, max 5MB)</span></label>
              {!screenshot ? (
                <div
                  className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-4 text-center cursor-pointer hover:border-primary/40 transition-colors"
                  onClick={() => fileRef.current?.click()}
                  data-testid="upload-bug-screenshot"
                >
                  <Upload className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Click to upload PNG, JPG, WebP or PDF</p>
                </div>
              ) : (
                <div className="flex items-center gap-2 p-2 bg-muted rounded-lg text-sm">
                  <span className="flex-1 truncate">{screenshot.name}</span>
                  <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={removeScreenshot}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file && file.size <= 5 * 1024 * 1024) setScreenshot(file);
                  else if (file) toast({ variant: "destructive", title: "File too large", description: "Max 5MB allowed" });
                }}
              />
            </div>

            <FormField control={form.control} name="includeDiagnostics" render={({ field }) => (
              <FormItem className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div>
                  <FormLabel className="text-sm font-medium">Include diagnostics</FormLabel>
                  <p className="text-xs text-muted-foreground mt-0.5">Attaches your browser, device, and page info automatically</p>
                </div>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="toggle-bug-diagnostics" />
                </FormControl>
              </FormItem>
            )} />

            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)} data-testid="button-cancel-bug">
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={mutation.isPending} data-testid="button-submit-bug">
                {mutation.isPending ? "Submitting…" : "Submit Report"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
