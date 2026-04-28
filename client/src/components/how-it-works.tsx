import { Search, Calendar, CreditCard, Star } from "lucide-react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";

export function HowItWorks() {
  const { t } = useTranslation();

  const steps = [
    {
      icon: Search,
      title: t("how_it_works.step1_title"),
      description: t("how_it_works.step1_desc"),
      step: 1,
      bgClass: "bg-gradient-to-br from-sky-200 to-sky-50 dark:from-sky-900 dark:to-sky-950 ring-1 ring-sky-200/60 dark:ring-sky-800/40",
      iconClass: "text-sky-600 dark:text-sky-300",
      badgeClass: "bg-sky-600 dark:bg-sky-500",
    },
    {
      icon: Calendar,
      title: t("how_it_works.step2_title"),
      description: t("how_it_works.step2_desc"),
      step: 2,
      bgClass: "bg-gradient-to-br from-violet-200 to-violet-50 dark:from-violet-900 dark:to-violet-950 ring-1 ring-violet-200/60 dark:ring-violet-800/40",
      iconClass: "text-violet-600 dark:text-violet-300",
      badgeClass: "bg-violet-600 dark:bg-violet-500",
    },
    {
      icon: CreditCard,
      title: t("how_it_works.step3_title"),
      description: t("how_it_works.step3_desc"),
      step: 3,
      bgClass: "bg-gradient-to-br from-emerald-200 to-emerald-50 dark:from-emerald-900 dark:to-emerald-950 ring-1 ring-emerald-200/60 dark:ring-emerald-800/40",
      iconClass: "text-emerald-600 dark:text-emerald-300",
      badgeClass: "bg-emerald-600 dark:bg-emerald-500",
    },
    {
      icon: Star,
      title: t("how_it_works.step4_title"),
      description: t("how_it_works.step4_desc"),
      step: 4,
      bgClass: "bg-gradient-to-br from-amber-200 to-amber-50 dark:from-amber-900 dark:to-amber-950 ring-1 ring-amber-200/60 dark:ring-amber-800/40",
      iconClass: "text-amber-600 dark:text-amber-300",
      badgeClass: "bg-amber-600 dark:bg-amber-500",
    },
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: {
        duration: 0.5,
        ease: "easeOut"
      }
    }
  };

  return (
    <section className="py-20">
      <div className="container mx-auto px-4">
        <motion.div 
          className="text-center mb-14"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="text-3xl md:text-5xl font-extrabold mb-4 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 dark:from-emerald-300 dark:via-teal-300 dark:to-cyan-300 bg-clip-text text-transparent">{t("how_it_works.title")}</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
            {t("how_it_works.description")}
          </p>
        </motion.div>

        <motion.div 
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
        >
          {steps.map((step, index) => (
            <motion.div 
              key={step.step} 
              className="relative text-center group"
              data-testid={`step-${step.step}`}
              variants={itemVariants}
            >
              {index < steps.length - 1 && (
                <motion.div 
                  className="hidden lg:block absolute top-10 left-[60%] w-full h-0.5"
                  initial={{ scaleX: 0 }}
                  whileInView={{ scaleX: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.5 + index * 0.2, duration: 0.5 }}
                  style={{ background: "linear-gradient(to right, hsl(var(--primary) / 0.5), transparent)" }}
                />
              )}
              <motion.div 
                className={`relative inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-6 shadow-lg ${step.bgClass}`}
                whileHover={{ scale: 1.1, rotate: 5 }}
                transition={{ type: "spring", stiffness: 300 }}
              >
                <step.icon className={`h-9 w-9 ${step.iconClass}`} />
                <motion.span 
                  className={`absolute -top-2 -right-2 w-8 h-8 rounded-full text-white text-sm font-bold flex items-center justify-center shadow-lg ${step.badgeClass}`}
                  initial={{ scale: 0 }}
                  whileInView={{ scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.3 + index * 0.1, type: "spring", stiffness: 400 }}
                >
                  {step.step}
                </motion.span>
              </motion.div>
              <h3 className="text-xl font-bold mb-3">{step.title}</h3>
              <p className="text-muted-foreground leading-relaxed">{step.description}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
