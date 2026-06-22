import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import { Toaster } from "@/components/ui/sonner";
import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { UserProvider } from "../lib/AuthContext";
import { useEffect } from "react";
import VoipHub from "@/components/VoipHub";
import Head from "next/head";

export default function App({ Component, pageProps }: AppProps) {
  useEffect(() => {
    const checkTheme = async () => {
      // 1. Get current time in IST (+5:30)
      const now = new Date();
      const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
      const istTime = new Date(utc + (3600000 * 5.5));
      const hours = istTime.getHours();
      const minutes = istTime.getMinutes();
      const minutesSinceMidnight = hours * 60 + minutes;
      
      // 10:00 AM (600 mins) to 12:00 PM (720 mins) IST
      const isBetween10and12 = minutesSinceMidnight >= 600 && minutesSinceMidnight <= 720;

      // 2. Fetch location from freeipapi (5s timeout, non-blocking)
      let isSouthIndia = false;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const geoRes = await fetch("https://freeipapi.com/api/json", { signal: controller.signal });
        clearTimeout(timeoutId);
        if (geoRes.ok) {
          const geoData = await geoRes.json();
          const region = geoData.regionName || "";
          const southIndiaStates = ["tamil nadu", "kerala", "karnataka", "andhra pradesh", "telangana"];
          isSouthIndia = southIndiaStates.some(state => region.toLowerCase().includes(state));
          console.log(`[Theme Manager] Region: ${region}, Is South India: ${isSouthIndia}, Time: ${hours}:${minutes.toString().padStart(2, '0')} IST, In Window: ${isBetween10and12}`);
        }
      } catch (e: any) {
        // Silently ignore — network failure or timeout, default to dark theme
        if (e?.name !== "AbortError") {
          console.warn("[Theme Manager] Geolocation unavailable, defaulting to dark theme.");
        }
      }

      // 3. Apply theme: Light if South India AND 10am-12pm IST. Otherwise Dark.
      if (isSouthIndia && isBetween10and12) {
        document.documentElement.classList.remove("dark");
        document.documentElement.style.colorScheme = "light";
      } else {
        document.documentElement.classList.add("dark");
        document.documentElement.style.colorScheme = "dark";
      }
    };

    checkTheme();
    const interval = setInterval(checkTheme, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <UserProvider>
      <Head>
        <title>YourTube – Watch & Share Videos</title>
        <meta name="description" content="YourTube – a YouTube-inspired video sharing platform. Watch, like, comment, and share videos." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div className="min-h-screen bg-background text-foreground transition-colors duration-200">
        <Header />
        <Toaster />
        <VoipHub />
        <div className="flex">
          <Sidebar />
          <Component {...pageProps} />
        </div>
      </div>
    </UserProvider>
  );
}
