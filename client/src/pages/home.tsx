import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SearchBar } from "@/components/search-bar";
import { ServiceCategories } from "@/components/service-categories";
import { HowItWorks } from "@/components/how-it-works";
import { StatsSection } from "@/components/stats-section";
import { Testimonials } from "@/components/testimonials";
import { CTASection } from "@/components/cta-section";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { ContactForm } from "@/components/contact-form";
import { Shield, Clock, Award, Sparkles, CreditCard, Wallet, Banknote, MessageCircle, Send, X, Bot, User as UserIcon, Mail, Phone, MapPin } from "lucide-react";
import { SiVisa, SiMastercard, SiGooglepay, SiApplepay } from "react-icons/si";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/auth"; // Assuming useAuth is imported from here
import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { useTranslation } from "react-i18next";

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5 }
};

const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.1
    }
  }
};

const floatingAnimation = {
  animate: {
    y: [0, -10, 0],
    transition: {
      duration: 4,
      repeat: Infinity,
      ease: "easeInOut"
    }
  }
};

function AIChatBox() {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [conversationId, setConversationId] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: conversation } = useQuery<any>({
    queryKey: ["/api/conversations", conversationId],
    enabled: !!conversationId,
  });

  const createConversation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/conversations", { title: "New Chat" });
      return res.json();
    },
    onSuccess: (data) => {
      setConversationId(data.id);
    },
  });

  const sendMessage = useMutation({
    mutationFn: async (content: string) => {
      if (!conversationId) {
        const conv = await createConversation.mutateAsync();
        await apiRequest("POST", `/api/conversations/${conv.id}/messages`, { content });
      } else {
        await apiRequest("POST", `/api/conversations/${conversationId}/messages`, { content });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", conversationId] });
      setMessage("");
    },
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conversation?.messages]);

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            className="mb-4 w-80 md:w-96 h-[500px] bg-card border rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          >
            <div className="p-4 bg-primary text-primary-foreground flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-white/20 rounded-lg">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">{t("chat.assistant_title")}</h3>
                  <p className="text-[10px] opacity-80">{t("chat.assistant_status")}</p>
                </div>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="hover:bg-white/10 text-primary-foreground"
                onClick={() => setIsOpen(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4">
                <div className="flex gap-2">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Bot className="w-4 h-4 text-primary" />
                  </div>
                  <div className="p-3 rounded-2xl rounded-tl-none bg-muted text-sm max-w-[85%]">
                    {t("chat.welcome_message")}
                  </div>
                </div>

                {conversation?.messages?.map((msg: any) => (
                  <div
                    key={msg.id}
                    className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                      msg.role === "user" ? "bg-primary" : "bg-primary/10"
                    }`}>
                      {msg.role === "user" ? (
                        <UserIcon className="w-4 h-4 text-primary-foreground" />
                      ) : (
                        <Bot className="w-4 h-4 text-primary" />
                      )}
                    </div>
                    <div className={`p-3 rounded-2xl text-sm max-w-[85%] ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-tr-none"
                        : "bg-muted rounded-tl-none"
                    }`}>
                      {msg.content}
                    </div>
                  </div>
                ))}
                <div ref={scrollRef} />
              </div>
            </ScrollArea>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (message.trim()) sendMessage.mutate(message);
              }}
              className="p-4 border-t flex gap-2"
            >
              <Input
                placeholder={t("chat.input_placeholder")}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="flex-1"
                disabled={sendMessage.isPending}
              />
              <Button size="icon" type="submit" disabled={sendMessage.isPending || !message.trim()}>
                <Send className="w-4 h-4" />
              </Button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <Button
        size="icon"
        className="w-14 h-14 rounded-full shadow-lg hover:scale-110 transition-transform duration-300"
        onClick={() => {
          setIsOpen(!isOpen);
          if (!conversationId && !isOpen) createConversation.mutate();
        }}
        data-testid="button-ai-chat"
      >
        <MessageCircle className="w-6 h-6" />
      </Button>
    </div>
  );
}

export default function Home() {
  const { t } = useTranslation();
  console.log("Home page rendering");
  const { user } = useAuth();

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1">
        <AIChatBox />
        <section className="relative py-20 lg:py-32 overflow-hidden">
          <div className="absolute inset-0 animated-gradient -z-10" />
          <motion.div
            className="absolute top-20 right-10 w-72 h-72 bg-primary/20 rounded-full blur-3xl -z-10"
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.3, 0.5, 0.3]
            }}
            transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute bottom-10 left-10 w-96 h-96 bg-primary/10 rounded-full blur-3xl -z-10"
            animate={{
              scale: [1.2, 1, 1.2],
              opacity: [0.2, 0.4, 0.2]
            }}
            transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-r from-primary/5 to-transparent rounded-full blur-3xl -z-10"
            animate={{ rotate: 360 }}
            transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
          />

          <div className="container mx-auto px-4">
            <motion.div
              className="max-w-4xl mx-auto text-center space-y-8"
              initial="initial"
              animate="animate"
              variants={staggerContainer}
            >
              <motion.div variants={fadeInUp}>
                <Badge variant="secondary" className="text-sm px-4 py-2 gap-2 shimmer" data-testid="badge-hero">
                  <Sparkles className="h-4 w-4 text-primary" />
                  {t("hero.trusted_badge")}
                </Badge>
              </motion.div>

              <motion.h1
                className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight"
                variants={fadeInUp}
              >
                {t("hero.title")}
                <motion.span
                  className="text-primary block mt-2"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3, duration: 0.5 }}
                >
                  {t("hero.title_span")}
                </motion.span>
              </motion.h1>

              <motion.p
                className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto"
                variants={fadeInUp}
              >
                {t("hero.description")}
              </motion.p>

              <motion.div variants={fadeInUp}>
                <SearchBar className="max-w-3xl mx-auto" />
              </motion.div>

              <motion.div
                className="flex flex-wrap justify-center gap-3 pt-4"
                variants={fadeInUp}
              >
                <Link href="/providers?type=physiotherapist">
                  <Badge
                    variant="outline"
                    className="px-4 py-2 text-sm cursor-pointer hover:bg-primary hover:text-primary-foreground transition-all duration-300 hover:scale-105 hover:shadow-lg"
                    data-testid="badge-physio"
                  >
                    {t("common.physiotherapists")}
                  </Badge>
                </Link>
                <Link href="/providers?type=nurse">
                  <Badge
                    variant="outline"
                    className="px-4 py-2 text-sm cursor-pointer hover:bg-primary hover:text-primary-foreground transition-all duration-300 hover:scale-105 hover:shadow-lg"
                    data-testid="badge-nursing"
                  >
                    {t("common.nurses")}
                  </Badge>
                </Link>
                <Link href="/providers?type=doctor">
                  <Badge
                    variant="outline"
                    className="px-4 py-2 text-sm cursor-pointer hover:bg-primary hover:text-primary-foreground transition-all duration-300 hover:scale-105 hover:shadow-lg"
                    data-testid="badge-doctor"
                  >
                    {t("common.doctors")}
                  </Badge>
                </Link>
              </motion.div>
            </motion.div>
          </div>
        </section>

        <section className="py-12 border-y bg-card/50 backdrop-blur-sm">
          <div className="container mx-auto px-4">
            <motion.div
              className="grid grid-cols-1 md:grid-cols-3 gap-8"
              initial="initial"
              whileInView="animate"
              viewport={{ once: true, margin: "-100px" }}
              variants={staggerContainer}
            >
              <motion.div
                className="flex items-center gap-4 p-4 rounded-xl hover:bg-muted/50 transition-colors duration-300 icon-bounce"
                data-testid="feature-verified"
                variants={fadeInUp}
                whileHover={{ scale: 1.02 }}
              >
                <div className="flex-shrink-0 w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shadow-lg">
                  <Shield className="h-7 w-7 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">{t("features.verified_title")}</h3>
                  <p className="text-sm text-muted-foreground">{t("features.verified_desc")}</p>
                </div>
              </motion.div>
              <motion.div
                className="flex items-center gap-4 p-4 rounded-xl hover:bg-muted/50 transition-colors duration-300 icon-bounce"
                data-testid="feature-booking"
                variants={fadeInUp}
                whileHover={{ scale: 1.02 }}
              >
                <div className="flex-shrink-0 w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shadow-lg">
                  <Clock className="h-7 w-7 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">{t("features.booking_title")}</h3>
                  <p className="text-sm text-muted-foreground">{t("features.booking_desc")}</p>
                </div>
              </motion.div>
              <motion.div
                className="flex items-center gap-4 p-4 rounded-xl hover:bg-muted/50 transition-colors duration-300 icon-bounce"
                data-testid="feature-quality"
                variants={fadeInUp}
                whileHover={{ scale: 1.02 }}
              >
                <div className="flex-shrink-0 w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shadow-lg">
                  <Award className="h-7 w-7 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">{t("features.quality_title")}</h3>
                  <p className="text-sm text-muted-foreground">{t("features.quality_desc")}</p>
                </div>
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* Payment Methods Section */}
        <section className="py-8 bg-muted/30">
          <div className="container mx-auto px-4">
            <motion.div
              className="flex flex-col items-center gap-4"
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              <p className="text-sm text-muted-foreground font-medium">We Accept</p>
              <div className="flex flex-wrap justify-center items-center gap-6">
                <div className="flex items-center gap-2 text-muted-foreground" data-testid="payment-visa">
                  <SiVisa className="h-8 w-12" />
                </div>
                <div className="flex items-center gap-2 text-muted-foreground" data-testid="payment-mastercard">
                  <SiMastercard className="h-8 w-8" />
                </div>
                <div className="flex items-center gap-2 text-muted-foreground" data-testid="payment-gpay">
                  <SiGooglepay className="h-8 w-12" />
                </div>
                <div className="flex items-center gap-2 text-muted-foreground" data-testid="payment-applepay">
                  <SiApplepay className="h-8 w-12" />
                </div>
                <div className="flex items-center gap-2 text-muted-foreground" data-testid="payment-card">
                  <CreditCard className="h-6 w-6" />
                  <span className="text-sm">Credit/Debit</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground" data-testid="payment-wallet">
                  <Wallet className="h-6 w-6" />
                  <span className="text-sm">UPI</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground" data-testid="payment-netbanking">
                  <Banknote className="h-6 w-6" />
                  <span className="text-sm">Net Banking</span>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        <ServiceCategories />
        <HowItWorks />
        <StatsSection />
        <Testimonials />
        <ContactForm />
        <CTASection />
      </main>

      <Footer />
    </div>
  );
}