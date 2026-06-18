import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { QK } from "@/lib/query-keys";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Gift, CreditCard, Wallet, CheckCircle2, Loader2 } from "lucide-react";
import { useCurrency } from "@/lib/currency";

export default function GiftCardsPage() {
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const { format: fmtMoney, code: currencyCode } = useCurrency();

  const [amount, setAmount] = useState("50");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [redeemCode, setRedeemCode] = useState("");
  const [checkCode, setCheckCode] = useState("");
  const [checkedCard, setCheckedCard] = useState<any>(null);
  const [checkLoading, setCheckLoading] = useState(false);

  const PRESET_AMOUNTS = [25, 50, 100, 200];

  const { data: myCards = [], isLoading: cardsLoading } = useQuery<any[]>({
    queryKey: QK.giftCards(),
    enabled: isAuthenticated,
  });

  const purchaseMut = useMutation({
    mutationFn: (payload: any) => apiRequest("POST", "/api/gift-cards/purchase", payload).then(r => r.json()),
    onSuccess: (data) => {
      toast({ title: "Gift card purchased!", description: `Code: ${data.code}` });
      queryClient.invalidateQueries({ queryKey: QK.giftCards() });
      setAmount("50");
      setRecipientEmail("");
    },
    onError: (e: any) => toast({ title: "Purchase failed", description: e?.message, variant: "destructive" }),
  });

  const redeemMut = useMutation({
    mutationFn: (code: string) => apiRequest("POST", "/api/gift-cards/redeem", { code }).then(r => r.json()),
    onSuccess: (data) => {
      toast({ title: "Gift card redeemed!", description: `${fmtMoney(data.amount)} added to your wallet.` });
      setRedeemCode("");
      queryClient.invalidateQueries({ queryKey: QK.wallet() });
    },
    onError: (e: any) => toast({ title: "Redemption failed", description: e?.message, variant: "destructive" }),
  });

  async function handleCheckBalance() {
    if (!checkCode.trim()) return;
    setCheckLoading(true);
    setCheckedCard(null);
    try {
      const res = await fetch(`/api/gift-cards/${checkCode.trim().toUpperCase()}`);
      if (!res.ok) { toast({ title: "Gift card not found", variant: "destructive" }); return; }
      setCheckedCard(await res.json());
    } catch {
      toast({ title: "Could not check balance", variant: "destructive" });
    } finally { setCheckLoading(false); }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8 max-w-3xl space-y-8">
        <PageBreadcrumbs items={[{ label: "Gift Cards" }]} />

        <div>
          <h1 className="text-3xl font-bold">Gift Cards</h1>
          <p className="text-muted-foreground mt-1">Buy a gift card for someone special or redeem one to add credit to your wallet.</p>
        </div>

        {/* Purchase */}
        <Card data-testid="card-purchase-gift-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gift className="h-5 w-5 text-primary" />
              Buy a gift card
            </CardTitle>
            <CardDescription>Gift cards never expire within one year and can be redeemed for any service.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Amount</Label>
              <div className="flex gap-2 flex-wrap">
                {PRESET_AMOUNTS.map(a => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAmount(String(a))}
                    data-testid={`button-amount-preset-${a}`}
                    className={`px-4 py-1.5 rounded-lg text-sm font-medium border-2 transition-all ${amount === String(a) ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
                  >
                    {fmtMoney(a)}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground font-mono">USD</span>
                <Input
                  type="number"
                  min={1}
                  max={1000}
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="Custom USD amount"
                  data-testid="input-gift-card-amount"
                  className="flex-1"
                />
              </div>
              {currencyCode !== "USD" && Number(amount) > 0 && (
                <p className="text-xs text-muted-foreground">≈ {fmtMoney(Number(amount))} in your currency</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Recipient email (optional)</Label>
              <Input
                type="email"
                value={recipientEmail}
                onChange={e => setRecipientEmail(e.target.value)}
                placeholder="friend@example.com"
                data-testid="input-gift-card-recipient"
              />
              <p className="text-xs text-muted-foreground">We will send the code to this email address.</p>
            </div>
            <Button
              disabled={!amount || Number(amount) < 1 || purchaseMut.isPending || !isAuthenticated}
              onClick={() => purchaseMut.mutate({ amount: Number(amount), recipientEmail: recipientEmail || undefined })}
              className="w-full"
              data-testid="button-purchase-gift-card"
            >
              {purchaseMut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CreditCard className="h-4 w-4 mr-2" />}
              {isAuthenticated ? "Purchase gift card" : "Log in to purchase"}
            </Button>
          </CardContent>
        </Card>

        {/* Redeem */}
        <Card data-testid="card-redeem-gift-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" />
              Redeem a gift card
            </CardTitle>
            <CardDescription>Enter your code to add the balance to your wallet.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                value={redeemCode}
                onChange={e => setRedeemCode(e.target.value.toUpperCase())}
                placeholder="XXXX-XXXX-XXXX-XXXX"
                className="font-mono"
                data-testid="input-redeem-code"
              />
              <Button
                disabled={!redeemCode.trim() || redeemMut.isPending || !isAuthenticated}
                onClick={() => redeemMut.mutate(redeemCode)}
                data-testid="button-redeem-gift-card"
              >
                {redeemMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Redeem"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Balance check */}
        <Card data-testid="card-check-balance">
          <CardHeader>
            <CardTitle className="text-base">Check gift card balance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                value={checkCode}
                onChange={e => setCheckCode(e.target.value.toUpperCase())}
                placeholder="XXXX-XXXX-XXXX-XXXX"
                className="font-mono"
                data-testid="input-check-code"
              />
              <Button variant="outline" disabled={!checkCode.trim() || checkLoading} onClick={handleCheckBalance} data-testid="button-check-balance">
                {checkLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Check"}
              </Button>
            </div>
            {checkedCard && (
              <div className="p-3 rounded-lg border bg-muted/30 space-y-1" data-testid="card-balance-result">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span className="text-sm font-medium">Valid gift card</span>
                  {!checkedCard.is_active && <Badge variant="destructive">Used</Badge>}
                </div>
                <p className="text-sm">Balance: <strong>{fmtMoney(Number(checkedCard.balance))}</strong></p>
                {checkedCard.expires_at && (
                  <p className="text-xs text-muted-foreground">Expires: {new Date(checkedCard.expires_at).toLocaleDateString()}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* My gift cards */}
        {isAuthenticated && (
          <Card data-testid="card-my-gift-cards">
            <CardHeader>
              <CardTitle className="text-base">Gift cards I purchased</CardTitle>
            </CardHeader>
            <CardContent>
              {cardsLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : (myCards as any[]).length === 0 ? (
                <p className="text-sm text-muted-foreground">You have not purchased any gift cards yet.</p>
              ) : (
                <div className="space-y-2">
                  {(myCards as any[]).map((c: any) => (
                    <div key={c.id} className="flex items-center justify-between p-3 rounded-lg border" data-testid={`card-gift-card-${c.id}`}>
                      <div className="space-y-0.5">
                        <p className="font-mono text-sm font-medium">{c.code}</p>
                        <p className="text-xs text-muted-foreground">{c.recipient_email ? `To: ${c.recipient_email}` : "Personal"}</p>
                      </div>
                      <div className="text-right space-y-0.5">
                        <p className="text-sm font-semibold">{fmtMoney(Number(c.balance))}</p>
                        <Badge variant={c.is_active ? "default" : "secondary"}>{c.is_active ? "Active" : "Used"}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </main>
      <Footer />
    </div>
  );
}
