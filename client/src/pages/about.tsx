import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Card, CardContent } from "@/components/ui/card";
import { Heart, Shield, Users, Clock, MapPin, Phone, Mail } from "lucide-react";

export default function About() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <section className="py-16 bg-gradient-to-b from-primary/5 to-background">
          <div className="container mx-auto px-4 text-center">
            <h1 className="text-4xl font-bold mb-4">About Golden Life</h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Connecting patients with trusted healthcare professionals for quality care delivered with compassion.
            </p>
          </div>
        </section>

        <section className="py-16">
          <div className="container mx-auto px-4 max-w-4xl">
            <div className="prose prose-lg max-w-none dark:prose-invert">
              <h2 className="text-2xl font-semibold mb-6">Our Mission</h2>
              <p className="text-muted-foreground mb-8">
                Golden Life is dedicated to making healthcare accessible and convenient for everyone. 
                Our platform connects patients with verified physiotherapists, doctors, and home care nurses, 
                enabling seamless appointment booking for both online consultations and home visits.
              </p>

              <h2 className="text-2xl font-semibold mb-6">What We Offer</h2>
              <div className="grid md:grid-cols-2 gap-6 mb-12">
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-4">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <Heart className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold mb-2">Quality Care</h3>
                        <p className="text-sm text-muted-foreground">
                          All our healthcare providers are verified professionals committed to delivering excellent care.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-4">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <Shield className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold mb-2">Secure Platform</h3>
                        <p className="text-sm text-muted-foreground">
                          Your data is protected with industry-standard encryption and strict privacy controls.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-4">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <Users className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold mb-2">Trusted Professionals</h3>
                        <p className="text-sm text-muted-foreground">
                          Our network includes experienced physiotherapists, doctors, and nurses.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-4">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <Clock className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold mb-2">Convenient Booking</h3>
                        <p className="text-sm text-muted-foreground">
                          Book appointments online anytime, with flexible scheduling options.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <h2 className="text-2xl font-semibold mb-6">Contact Us</h2>
              <Card>
                <CardContent className="pt-6">
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <MapPin className="h-5 w-5 text-primary" />
                      <span className="text-muted-foreground">Hungary, 3060 Pásztó, Semmelweis utca 10</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Mail className="h-5 w-5 text-primary" />
                      <div className="flex flex-col gap-1">
                        <a href="mailto:Info@GoldenLife.Health" className="text-primary hover:underline">
                          Info@GoldenLife.Health
                        </a>
                        <a href="mailto:Admin@GoldenLife.Health" className="text-primary hover:underline">
                          Admin@GoldenLife.Health
                        </a>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Phone className="h-5 w-5 text-primary" />
                      <a href="tel:+36702370103" className="text-primary hover:underline">
                        +36702370103
                      </a>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
