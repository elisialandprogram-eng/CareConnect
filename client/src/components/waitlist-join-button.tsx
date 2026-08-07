import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Bell, Loader2 } from "lucide-react";
import { useLocation } from "wouter";

interface WaitlistJoinButtonProps {
  providerId: string;
  providerName?: string;
  serviceId?: string;
  defaultDate?: string;
  variant?: "default" | "outline" | "ghost" | "secondary";
  className?: string;
}

/**
 * Reusable "Join waitlist" button + dialog. Handles the auth check (sends the
 * user to /login if not signed in) so callers don't have to. After a
 * successful join, links to the patient's waitlist page.
 */
export function WaitlistJoinButton({
  providerId,
  providerName,
  serviceId,
  defaultDate,
  variant = "outline",
  className,
}: WaitlistJoinButtonProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(defaultDate || "");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [notes, setNotes] = useState("");

  const joinMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/waitlist", {
        providerId,
        serviceId,
        preferredDate: date || undefined,
        preferredStartTime: startTime || undefined,
        preferredEndTime: endTime || undefined,
        notes: notes || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/waitlist/me"] });
      toast({
        title: "You're on the waitlist",
        description: "We'll send you a notification the moment a slot opens.",
      });
      setOpen(false);
    },
    onError: (e: any) => {
      toast({
        title: "Couldn't join waitlist",
        description: e?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleClick = () => {
    if (!user) {
      navigate(`/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      return;
    }
    setOpen(true);
  };

  return (
    <>
      <Button
        variant={variant}
        className={className}
        onClick={handleClick}
        data-testid="button-join-waitlist"
      >
        <Bell className="h-4 w-4 mr-2" />
        Join waitlist
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Join the waitlist</DialogTitle>
            <DialogDescription>
              We'll notify you the moment a slot opens up
              {providerName ? ` with ${providerName}` : ""}. Set a preferred date
              and time window, or leave blank for any opening.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="wl-date">Preferred date (optional)</Label>
              <Input
                id="wl-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                data-testid="input-waitlist-date"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="wl-start">Earliest time</Label>
                <Input
                  id="wl-start"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  data-testid="input-waitlist-start"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="wl-end">Latest time</Label>
                <Input
                  id="wl-end"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  data-testid="input-waitlist-end"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="wl-notes">Notes (optional)</Label>
              <Textarea
                id="wl-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anything the provider should know..."
                rows={2}
                maxLength={500}
                data-testid="input-waitlist-notes"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => joinMutation.mutate()}
              disabled={joinMutation.isPending}
              data-testid="button-confirm-waitlist"
            >
              {joinMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Join waitlist
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
