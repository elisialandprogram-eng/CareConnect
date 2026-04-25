import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Activity, HeartPulse, Stethoscope, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";

export function ServiceCategories() {
  const { t } = useTranslation();

  const categories = [
    {
      id: "physiotherapist",
      title: t("common.physiotherapists"),
      description: t("service_categories.physio_desc"),
      icon: Activity,
      color: "text-blue-600 dark:text-blue-400",
      bgColor: "bg-gradient-to-br from-blue-100 to-blue-50 dark:from-blue-950 dark:to-blue-900",
      borderColor: "group-hover:border-blue-300 dark:group-hover:border-blue-700",
    },
    {
      id: "nurse",
      title: t("common.nurses"),
      description: t("service_categories.nurse_desc"),
      icon: HeartPulse,
      color: "text-pink-600 dark:text-pink-400",
      bgColor: "bg-gradient-to-br from-pink-100 to-pink-50 dark:from-pink-950 dark:to-pink-900",
      borderColor: "group-hover:border-pink-300 dark:group-hover:border-pink-700",
    },
    {
      id: "doctor",
      title: t("common.doctors"),
      description: t("service_categories.doctor_desc"),
      icon: Stethoscope,
      color: "text-green-600 dark:text-green-400",
      bgColor: "bg-gradient-to-br from-green-100 to-green-50 dark:from-green-950 dark:to-green-900",
      borderColor: "group-hover:border-green-300 dark:group-hover:border-green-700",
    },
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15
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
          <h2 className="text-3xl md:text-4xl font-bold mb-4">{t("service_categories.title")}</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
            {t("service_categories.description")}
          </p>
        </motion.div>

        <motion.div 
          className="grid grid-cols-1 md:grid-cols-3 gap-8"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
        >
          {categories.map((category, index) => (
            <motion.div key={category.id} variants={cardVariants}>
              <Link href={`/providers?type=${category.id}`}>
                <Card 
                  className={`h-full card-interactive cursor-pointer group border-2 border-transparent ${category.borderColor}`}
                  data-testid={`card-category-${category.id}`}
                >
                  <CardContent className="p-8 flex flex-col h-full">
                    <motion.div 
                      className={`w-16 h-16 rounded-2xl ${category.bgColor} flex items-center justify-center mb-6 shadow-lg`}
                      whileHover={{ scale: 1.1, rotate: 5 }}
                      transition={{ type: "spring", stiffness: 300 }}
                    >
                      <category.icon className={`h-8 w-8 ${category.color}`} />
                    </motion.div>
                    <h3 className="text-xl font-bold mb-3">{category.title}</h3>
                    <p className="text-muted-foreground flex-1 leading-relaxed">{category.description}</p>
                    <div className="flex items-center gap-2 mt-6 text-primary font-semibold">
                      <span>{t("service_categories.find_providers")}</span>
                      <motion.div
                        initial={{ x: 0 }}
                        whileHover={{ x: 5 }}
                      >
                        <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
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
