import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CreditCard, Loader2, Shield, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCurrency } from "@/lib/currency";
import { formatInCurrency } from "@/lib/currency";

const LOCAL_PRESETS_BY_CURRENCY: Record<string, number[]> = {
  HUF: [2000, 5000, 10000, 25000],
  IRR: [500_000, 1_000_000, 2_500_000, 5_000_000],
  USD: [5, 10, 25, 50],
  GBP: [5, 10, 25, 50],
  EUR: [5, 10, 25, 50],
};

const DEFAULT_PRESETS = [5, 10, 25, 50];

interface WalletTopUpModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTopUp: (amountUSD: number) => void;
  isPending: boolean;
}

export function WalletTopUpModal({
  open,
  onOpenChange,
  onTopUp,
  isPending,
}: WalletTopUpModalProps) {
  const { code, symbol, convert } = useCurrency();

  const presets = LOCAL_PRESETS_BY_CURRENCY[code] ?? DEFAULT_PRESETS;
  const rateFromUSD = convert(1);

  const [selectedLocal, setSelectedLocal] = useState<number | null>(presets[1]);
  const [customLocal, setCustomLocal] = useState("");

  const effectiveLocal = customLocal
    ? parseFloat(customLocal) || 0
    : selectedLocal ?? 0;

  const effectiveUSD = rateFromUSD > 0 ? effectiveLocal / rateFromUSD : effectiveLocal;
  const valid = effectiveLocal > 0 && Number.isFinite(effectiveUSD) && effectiveUSD > 0;

  const handleConfirm = () => {
    if (!valid) return;
    onTopUp(Math.round(effectiveUSD * 100) / 100);
  };

  const fmtLocal = (amount: number) => formatInCurrency(amount, code);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" data-testid="dialog-wallet-topup">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Add credit to wallet
          </DialogTitle>
          <DialogDescription>
            Select an amount — you'll be redirected to a secure Stripe checkout page.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div>
            <Label className="text-xs text-muted-foreground mb-2 block">Quick amounts</Label>
            <div className="grid grid-cols-4 gap-2">
              {presets.map((amount) => (
                <button
                  key={amount}
                  type="button"
                  onClick={() => { setSelectedLocal(amount); setCustomLocal(""); }}
                  data-testid={`button-preset-${amount}`}
                  className={cn(
                    "rounded-xl border py-2.5 text-sm font-semibold transition-all focus-visible:ring-2 focus-visible:ring-primary",
                    selectedLocal === amount && !customLocal
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-primary/40 bg-card text-foreground"
                  )}
                >
                  {fmtLocal(amount)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground mb-1 block" htmlFor="topup-custom">
              Or enter custom amount ({code})
            </Label>
            <div className="relative">
              <span className="absolute start-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none select-none">
                {symbol}
              </span>
              <Input
                id="topup-custom"
                type="number"
                min="1"
                step="1"
                placeholder="0"
                className="ps-7"
                value={customLocal}
                onChange={(e) => { setCustomLocal(e.target.value); setSelectedLocal(null); }}
                data-testid="input-topup-custom"
              />
            </div>
          </div>

          {valid && (
            <div
              className="rounded-xl bg-muted/40 border px-4 py-3 flex items-center justify-between text-sm"
              data-testid="topup-summary"
            >
              <span className="text-muted-foreground">You'll add</span>
              <span className="font-bold text-primary text-base">{fmtLocal(effectiveLocal)}</span>
            </div>
          )}

          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Shield className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
            Secured by Stripe — card details are never stored on our servers.
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
            data-testid="button-topup-cancel"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!valid || isPending}
            className="gap-2"
            data-testid="button-proceed-checkout"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
            {isPending ? "Redirecting…" : "Proceed to checkout"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
