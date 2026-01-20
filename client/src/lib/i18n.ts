import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

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

export default i18n;
