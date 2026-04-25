import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, MapPin, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";

interface SearchBarProps {
  className?: string;
  variant?: "hero" | "compact";
}

export function SearchBar({ className = "", variant = "hero" }: SearchBarProps) {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const [location, setLocation] = useState("");
  const [serviceType, setServiceType] = useState<string>("");
  const [isFocused, setIsFocused] = useState(false);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (location) params.set("location", location);
    if (serviceType) params.set("type", serviceType);
    navigate(`/providers?${params.toString()}`);
  };

  if (variant === "compact") {
    return (
      <form onSubmit={handleSearch} className={`flex gap-2 ${className}`}>
        <div className="relative flex-1">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("common.city_area_placeholder")}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="pl-9"
            data-testid="input-location-compact"
          />
        </div>
        <Select value={serviceType} onValueChange={setServiceType}>
          <SelectTrigger className="w-[180px]" data-testid="select-service-type-compact">
            <SelectValue placeholder={t("common.service_type")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("common.all_services")}</SelectItem>
            <SelectItem value="physiotherapist">{t("common.physiotherapy")}</SelectItem>
            <SelectItem value="nurse">{t("common.home_nursing")}</SelectItem>
            <SelectItem value="doctor">{t("common.doctor_visit")}</SelectItem>
          </SelectContent>
        </Select>
        <Button type="submit" size="icon" data-testid="button-search-compact">
          <Search className="h-4 w-4" />
        </Button>
      </form>
    );
  }

  return (
    <motion.form 
      onSubmit={handleSearch} 
      className={`w-full ${className}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.5 }}
    >
      <motion.div 
        className={`flex flex-col md:flex-row gap-3 p-4 md:p-5 bg-background/95 backdrop-blur-md rounded-2xl shadow-xl border-2 transition-all duration-300 ${isFocused ? 'border-primary/30 shadow-primary/10' : 'border-transparent'}`}
        whileHover={{ scale: 1.01 }}
        transition={{ type: "spring", stiffness: 300 }}
      >
        <div className="relative flex-1">
          <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-primary" />
          <Input
            placeholder={t("common.city_area_placeholder")}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            className="pl-12 h-14 text-base rounded-xl border-2 focus:border-primary/50 transition-colors"
            data-testid="input-location"
          />
        </div>
        <Select value={serviceType} onValueChange={setServiceType}>
          <SelectTrigger 
            className="h-14 md:w-[240px] rounded-xl border-2 focus:border-primary/50 transition-colors" 
            data-testid="select-service-type"
          >
            <SelectValue placeholder={t("common.service_type")} />
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            <SelectItem value="all" className="rounded-lg">{t("common.all_services")}</SelectItem>
            <SelectItem value="physiotherapist" className="rounded-lg">{t("common.physiotherapy")}</SelectItem>
            <SelectItem value="nurse" className="rounded-lg">{t("common.home_nursing")}</SelectItem>
            <SelectItem value="doctor" className="rounded-lg">{t("common.doctor_visit")}</SelectItem>
          </SelectContent>
        </Select>
        <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }}>
          <Button 
            type="submit" 
            size="lg" 
            className="h-14 px-8 rounded-xl shadow-lg glow font-semibold text-base" 
            data-testid="button-search"
          >
            <Search className="h-5 w-5 mr-2" />
            {t("common.search")}
            <Sparkles className="h-4 w-4 ml-2 opacity-70" />
          </Button>
        </motion.div>
      </motion.div>
    </motion.form>
  );
}
