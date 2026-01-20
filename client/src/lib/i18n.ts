import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

const resources = {
  en: {
    translation: {
      common: {
        search: "Search",
        physiotherapists: "Physiotherapists",
        nurses: "Home Nurses",
        doctors: "Doctors",
        dashboard: "Dashboard",
        my_appointments: "My Appointments",
        messages: "Messages",
        notifications: "Notifications",
        profile: "Profile",
        settings: "Settings",
        logout: "Logout",
        login: "Login",
        get_started: "Get Started",
        first_name: "First Name",
        last_name: "Last Name",
        email: "Email",
        password: "Password",
        signing_in: "Signing in...",
        sign_in: "Sign In",
        no_account: "Don't have an account?",
        sign_up: "Sign Up",
        welcome_back: "Welcome back",
        forgot_password: "Forgot Password?",
      },
      auth: {
        signin_description: "Sign in to your account to manage your bookings",
        enter_password: "Enter your password",
        login_success: "You have successfully logged in",
        login_failed: "Login failed",
        invalid_credentials: "Invalid email or password",
      },
      hero: {
        trusted_badge: "Trusted by 10,000+ patients",
        title: "Your Health, Our Priority",
        title_span: "Care Anytime, Anywhere",
        description: "Connect with certified healthcare professionals for home visits or online consultations.",
      },
      features: {
        verified_title: "Verified Professionals",
        verified_desc: "All our providers are background checked and certified.",
        booking_title: "Easy Booking",
        booking_desc: "Book appointments in less than 2 minutes.",
        quality_title: "Quality Care",
        quality_desc: "Receive top-notch healthcare services at your convenience.",
      },
      chat: {
        assistant_title: "AI Health Assistant",
        assistant_status: "Online",
        welcome_message: "Hello! How can I help you today?",
        input_placeholder: "Type a message...",
      },
      validation: {
        invalid_email: "Invalid email address",
        password_min: "Password must be at least 6 characters",
      }
    }
  },
  hu: {
    translation: {
      common: {
        search: "Keresés",
        physiotherapists: "Fizioterapeuták",
        nurses: "Házi ápolók",
        doctors: "Orvosok",
        dashboard: "Vezérlőpult",
        my_appointments: "Saját időpontok",
        messages: "Üzenetek",
        notifications: "Értesítések",
        profile: "Profil",
        settings: "Beállítások",
        logout: "Kijelentkezés",
        login: "Bejelentkezés",
        get_started: "Kezdés",
        first_name: "Keresztnév",
        last_name: "Vezetéknév",
        email: "Email",
        password: "Jelszó",
        signing_in: "Bejelentkezés...",
        sign_in: "Bejelentkezés",
        no_account: "Nincs még fiókod?",
        sign_up: "Regisztráció",
        welcome_back: "Üdvözöljük újra",
        forgot_password: "Elfelejtett jelszó?",
      },
      auth: {
        signin_description: "Jelentkezzen be fiókjába a foglalásai kezeléséhez",
        enter_password: "Adja meg jelszavát",
        login_success: "Sikeresen bejelentkezett",
        login_failed: "Sikertelen bejelentkezés",
        invalid_credentials: "Érvénytelen email vagy jelszó",
      },
      hero: {
        trusted_badge: "Több mint 10 000 páciens bizalmával",
        title: "Az Ön egészsége a mi prioritásunk",
        title_span: "Ellátás bárhol, bármikor",
        description: "Lépjen kapcsolatba minősített egészségügyi szakemberekkel házi vizit vagy online konzultáció céljából.",
      },
      features: {
        verified_title: "Ellenőrzött szakemberek",
        verified_desc: "Minden szolgáltatónk ellenőrzött és minősített.",
        booking_title: "Egyszerű foglalás",
        booking_desc: "Foglaljon időpontot kevesebb mint 2 perc alatt.",
        quality_title: "Minőségi ellátás",
        quality_desc: "Kiváló egészségügyi szolgáltatások az Ön kényelmében.",
      },
      chat: {
        assistant_title: "AI Egészségügyi Asszisztens",
        assistant_status: "Online",
        welcome_message: "Üdvözlöm! Miben segíthetek ma?",
        input_placeholder: "Írjon üzenetet...",
      },
      validation: {
        invalid_email: "Érvénytelen email cím",
        password_min: "A jelszónak legalább 6 karakterből kell állnia",
      }
    }
  },
  fa: {
    translation: {
      common: {
        search: "جستجو",
        physiotherapists: "فیزیوتراپیست‌ها",
        nurses: "پرستاران در منزل",
        doctors: "پزشکان",
        dashboard: "داشبورد",
        my_appointments: "نوبت‌های من",
        messages: "پیام‌ها",
        notifications: "اعلان‌ها",
        profile: "پروفایل",
        settings: "تنظیمات",
        logout: "خروج",
        login: "ورود",
        get_started: "شروع کنید",
        first_name: "نام",
        last_name: "نام خانوادگی",
        email: "ایمیل",
        password: "رمز عبور",
        signing_in: "در حال ورود...",
        sign_in: "ورود",
        no_account: "حساب کاربری ندارید؟",
        sign_up: "ثبت‌نام",
        welcome_back: "خوش آمدید",
        forgot_password: "رمز عبور را فراموش کرده‌اید؟",
      },
      auth: {
        signin_description: "برای مدیریت نوبت‌های خود وارد حساب کاربری شوید",
        enter_password: "رمز عبور خود را وارد کنید",
        login_success: "با موفقیت وارد شدید",
        login_failed: "ورود ناموفق بود",
        invalid_credentials: "ایمیل یا رمز عبور اشتباه است",
      },
      hero: {
        trusted_badge: "مورد اعتماد بیش از ۱۰,۰۰۰ بیمار",
        title: "سلامتی شما، اولویت ما",
        title_span: "مراقبت در هر زمان و هر مکان",
        description: "با متخصصان مجرب مراقبت‌های بهداشتی برای ویزیت در منزل یا مشاوره آنلاین در ارتباط باشید.",
      },
      features: {
        verified_title: "متخصصان تایید شده",
        verified_desc: "تمامی متخصصان ما دارای گواهی‌نامه و تاییدیه هستند.",
        booking_title: "رزرو آسان",
        booking_desc: "نوبت خود را در کمتر از ۲ دقیقه رزرو کنید.",
        quality_title: "مراقبت با کیفیت",
        quality_desc: "خدمات بهداشتی درجه یک را در زمان دلخواه خود دریافت کنید.",
      },
      chat: {
        assistant_title: "دستیار سلامت هوشمند",
        assistant_status: "آنلاین",
        welcome_message: "سلام! چطور می‌توانم امروز به شما کمک کنم؟",
        input_placeholder: "پیام خود را تایپ کنید...",
      },
      validation: {
        invalid_email: "ایمیل نامعتبر است",
        password_min: "رمز عبور باید حداقل ۶ کاراکتر باشد",
      }
    }
  }
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "en",
    interpolation: {
      escapeValue: false
    },
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"]
    }
  });

// Handle RTL for Persian
i18n.on('languageChanged', (lng) => {
  if (typeof document !== 'undefined') {
    document.dir = lng === 'fa' ? 'rtl' : 'ltr';
    document.documentElement.lang = lng;
  }
});

export default i18n;
