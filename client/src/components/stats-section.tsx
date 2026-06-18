import { Users, Award, Calendar, Heart } from "lucide-react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

function AnimatedCounter({ value, suffix, isDecimal = false }: { value: number; suffix: string; isDecimal?: boolean }) {
  const [displayValue, setDisplayValue] = useState(0);
  const [hasAnimated, setHasAnimated] = useState(false);

  useEffect(() => {
    if (hasAnimated) return;
    
    const controls = animate(0, value, {
      duration: 2,
      ease: "easeOut",
      onUpdate: (latest) => {
        if (isDecimal) {
          setDisplayValue(Math.round(latest * 10) / 10);
        } else {
          setDisplayValue(Math.round(latest));
        }
      },
      onComplete: () => setHasAnimated(true),
    });

    return () => controls.stop();
  }, [value, isDecimal, hasAnimated]);

  const formattedValue = isDecimal 
    ? displayValue.toFixed(1) 
    : displayValue.toLocaleString();

  return <span>{formattedValue}{suffix}</span>;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.9 },
  visible: { 
    opacity: 1, 
    y: 0,
    scale: 1,
    transition: {
      duration: 0.5,
      ease: "easeOut"
    }
  }
};

export function StatsSection() {
  const { t } = useTranslation();

  const stats = [
    {
      icon: Users,
      value: 10000,
      suffix: "+",
      label: t("stats.patients"),
    },
    {
      icon: Award,
      value: 500,
      suffix: "+",
      label: t("stats.providers"),
    },
    {
      icon: Calendar,
      value: 50000,
      suffix: "+",
      label: t("stats.bookings"),
    },
    {
      icon: Heart,
      value: 4.9,
      suffix: "",
      label: t("stats.rating"),
    },
  ];

  return (
    <section className="py-20 bg-gradient-to-br from-primary via-primary to-primary/90 text-primary-foreground relative overflow-hidden">
      <motion.div 
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage: "radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 80% 50%, white 1px, transparent 1px)",
          backgroundSize: "60px 60px"
        }}
        animate={{ 
          backgroundPosition: ["0% 0%", "100% 100%"],
        }}
        transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
      />
      
      <div className="container mx-auto px-4 relative z-10">
        <motion.div 
          className="grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
        >
          {stats.map((stat, index) => (
            <motion.div 
              key={index} 
              className="text-center"
              data-testid={`stat-${index}`}
              variants={itemVariants}
            >
              <motion.div 
                className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary-foreground/10 backdrop-blur-sm mb-5 shadow-lg"
                whileHover={{ scale: 1.1, rotate: 5 }}
                transition={{ type: "spring", stiffness: 300 }}
              >
                <stat.icon className="h-8 w-8" />
              </motion.div>
              <motion.p 
                className="text-4xl md:text-5xl font-bold mb-2"
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
              >
                <AnimatedCounter 
                  value={stat.value} 
                  suffix={stat.suffix} 
                  isDecimal={stat.label === t("stats.rating")}
                />
              </motion.p>
              <p className="text-sm md:text-base text-primary-foreground/80 font-medium">{stat.label}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
