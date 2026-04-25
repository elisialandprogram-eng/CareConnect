import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Star, Quote } from "lucide-react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";

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
  hidden: { opacity: 0, y: 30, scale: 0.95 },
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

export function Testimonials() {
  const { t } = useTranslation();

  const testimonials = [
    {
      id: 1,
      name: t("testimonials.items.t1_name"),
      role: t("testimonials.patient"),
      avatar: "",
      rating: 5,
      comment: t("testimonials.items.t1_comment"),
    },
    {
      id: 2,
      name: t("testimonials.items.t2_name"),
      role: t("testimonials.patient"),
      avatar: "",
      rating: 5,
      comment: t("testimonials.items.t2_comment"),
    },
    {
      id: 3,
      name: t("testimonials.items.t3_name"),
      role: t("testimonials.patient"),
      avatar: "",
      rating: 5,
      comment: t("testimonials.items.t3_comment"),
    },
  ];

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
          <h2 className="text-3xl md:text-4xl font-bold mb-4">{t("testimonials.title")}</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
            {t("testimonials.description")}
          </p>
        </motion.div>

        <motion.div 
          className="grid grid-cols-1 md:grid-cols-3 gap-8"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
        >
          {testimonials.map((testimonial) => (
            <motion.div key={testimonial.id} variants={cardVariants}>
              <Card 
                className="h-full card-interactive border-2 border-transparent hover:border-primary/20" 
                data-testid={`testimonial-${testimonial.id}`}
              >
                <CardContent className="p-8 flex flex-col h-full">
                  <motion.div
                    initial={{ scale: 0, rotate: -180 }}
                    whileInView={{ scale: 1, rotate: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                  >
                    <Quote className="h-10 w-10 text-primary/20 mb-6" />
                  </motion.div>
                  <div className="flex gap-1 mb-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, scale: 0 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.3 + i * 0.1 }}
                      >
                        <Star
                          className={`h-5 w-5 ${
                            i < testimonial.rating
                              ? "fill-yellow-400 text-yellow-400"
                              : "fill-muted text-muted"
                          }`}
                        />
                      </motion.div>
                    ))}
                  </div>
                  <p className="text-muted-foreground flex-1 mb-8 leading-relaxed text-lg italic">
                    "{testimonial.comment}"
                  </p>
                  <div className="flex items-center gap-4 pt-6 border-t">
                    <Avatar className="h-12 w-12 ring-2 ring-primary/20">
                      <AvatarImage src={testimonial.avatar} />
                      <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/5 text-primary font-semibold">
                        {testimonial.name.split(" ").map(n => n[0]).join("")}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-semibold">{testimonial.name}</p>
                      <p className="text-sm text-muted-foreground">{testimonial.role}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
