import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Activity, HeartPulse, Stethoscope, ArrowRight, Brain, Salad, Gem, Leaf } from "lucide-react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";

export function ServiceCategories() {
  const { t } = useTranslation();

  const categories = [
    {
      id: "physician",
      title: t("common.physicians", "Medical Doctors & Specialists"),
      description: t("service_categories.physician_desc", "General practitioners, specialists, surgeons and diagnosticians"),
      icon: Stethoscope,
      color: "text-blue-600 dark:text-blue-400",
      bgColor: "bg-gradient-to-br from-blue-100 to-blue-50 dark:from-blue-950 dark:to-blue-900",
      borderColor: "group-hover:border-blue-300 dark:group-hover:border-blue-700",
    },
    {
      id: "mental_health",
      title: t("common.mental_health_pros", "Mental Health & Behavioral Professionals"),
      description: t("service_categories.mental_health_desc", "Psychiatrists, psychologists, therapists and counselors"),
      icon: Brain,
      color: "text-violet-600 dark:text-violet-400",
      bgColor: "bg-gradient-to-br from-violet-100 to-violet-50 dark:from-violet-950 dark:to-violet-900",
      borderColor: "group-hover:border-violet-300 dark:group-hover:border-violet-700",
    },
    {
      id: "nutrition",
      title: t("common.nutrition_pros", "Nutrition, Dietetics & Metabolic Wellness"),
      description: t("service_categories.nutrition_desc", "Clinical dietitians, nutritionists and metabolic health coaches"),
      icon: Salad,
      color: "text-lime-600 dark:text-lime-400",
      bgColor: "bg-gradient-to-br from-lime-100 to-lime-50 dark:from-lime-950 dark:to-lime-900",
      borderColor: "group-hover:border-lime-300 dark:group-hover:border-lime-700",
    },
    {
      id: "rehabilitation",
      title: t("common.rehabilitation_pros", "Physical Therapy & Rehabilitation"),
      description: t("service_categories.rehabilitation_desc", "Physiotherapists, chiropractors, occupational and speech therapists"),
      icon: Activity,
      color: "text-emerald-600 dark:text-emerald-400",
      bgColor: "bg-gradient-to-br from-emerald-100 to-emerald-50 dark:from-emerald-950 dark:to-emerald-900",
      borderColor: "group-hover:border-emerald-300 dark:group-hover:border-emerald-700",
    },
    {
      id: "dental",
      title: t("common.dental_pros", "Dental Care Professionals"),
      description: t("service_categories.dental_desc", "General dentists, orthodontists, oral surgeons and specialists"),
      icon: Gem,
      color: "text-cyan-600 dark:text-cyan-400",
      bgColor: "bg-gradient-to-br from-cyan-100 to-cyan-50 dark:from-cyan-950 dark:to-cyan-900",
      borderColor: "group-hover:border-cyan-300 dark:group-hover:border-cyan-700",
    },
    {
      id: "alternative_medicine",
      title: t("common.alternative_medicine_pros", "Alternative, Holistic & Integrative Medicine"),
      description: t("service_categories.alternative_medicine_desc", "Acupuncturists, naturopaths, Ayurvedic and TCM practitioners"),
      icon: Leaf,
      color: "text-teal-600 dark:text-teal-400",
      bgColor: "bg-gradient-to-br from-teal-100 to-teal-50 dark:from-teal-950 dark:to-teal-900",
      borderColor: "group-hover:border-teal-300 dark:group-hover:border-teal-700",
    },
    {
      id: "nursing",
      title: t("common.nursing_pros", "Maternal, Nursing & Allied Health Support"),
      description: t("service_categories.nursing_desc", "Registered nurses, home care nurses, midwives and caregivers"),
      icon: HeartPulse,
      color: "text-rose-600 dark:text-rose-400",
      bgColor: "bg-gradient-to-br from-rose-100 to-rose-50 dark:from-rose-950 dark:to-rose-900",
      borderColor: "group-hover:border-rose-300 dark:group-hover:border-rose-700",
    },
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const cardVariants = {
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
    <section className="py-20 bg-muted/30">
      <div className="container mx-auto px-4">
        <motion.div 
          className="text-center mb-14"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="text-3xl md:text-5xl font-extrabold mb-4 bg-gradient-to-r from-sky-600 via-blue-600 to-indigo-600 dark:from-sky-300 dark:via-blue-300 dark:to-indigo-300 bg-clip-text text-transparent">{t("service_categories.title")}</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
            {t("service_categories.description")}
          </p>
        </motion.div>

        <motion.div 
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
        >
          {categories.map((category) => (
            <motion.div key={category.id} variants={cardVariants}>
              <Link href={`/providers?type=${category.id}`}>
                <Card 
                  className={`h-full card-interactive cursor-pointer group border-2 border-transparent ${category.borderColor}`}
                  data-testid={`card-category-${category.id}`}
                >
                  <CardContent className="p-6 flex flex-col h-full">
                    <motion.div 
                      className={`w-14 h-14 rounded-2xl ${category.bgColor} flex items-center justify-center mb-5 shadow-lg`}
                      whileHover={{ scale: 1.1, rotate: 5 }}
                      transition={{ type: "spring", stiffness: 300 }}
                    >
                      <category.icon className={`h-7 w-7 ${category.color}`} />
                    </motion.div>
                    <h3 className="text-base font-bold mb-2">{category.title}</h3>
                    <p className="text-muted-foreground flex-1 leading-relaxed text-sm">{category.description}</p>
                    <div className="flex items-center gap-2 mt-5 text-primary font-semibold text-sm">
                      <span>{t("service_categories.find_providers")}</span>
                      <motion.div
                        initial={{ x: 0 }}
                        whileHover={{ x: 5 }}
                      >
                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                      </motion.div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
