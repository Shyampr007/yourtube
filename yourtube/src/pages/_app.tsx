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

      // 2. Fetch location: prefer HTML5 Geolocation, fallback to IP lookup
      let isSouthIndia = false;
      let region = "";

      const getBrowserRegion = (): Promise<string | null> => {
        return new Promise((resolve) => {
          if (!navigator.geolocation) {
            resolve(null);
            return;
          }
          navigator.geolocation.getCurrentPosition(
            async (position) => {
              try {
                const { latitude, longitude } = position.coords;
                const geoRes = await fetch(
                  `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`
                );
                if (geoRes.ok) {
                  const geoData = await geoRes.json();
                  resolve(geoData.principalSubdivision || null);
                } else {
                  resolve(null);
                }
              } catch (e) {
                resolve(null);
              }
            },
            (error) => {
              resolve(null);
            },
            { timeout: 5000 }
          );
        });
      };

      try {
        const browserRegion = await getBrowserRegion();
        if (browserRegion) {
          region = browserRegion;
        } else {
          // Fallback to IP address detection
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);
          const geoRes = await fetch("https://freeipapi.com/api/json", { signal: controller.signal });
          clearTimeout(timeoutId);
          if (geoRes.ok) {
            const geoData = await geoRes.json();
            region = geoData.regionName || "";
          }
        }

        if (region) {
          const southIndiaStates = ["tamil nadu", "kerala", "karnataka", "andhra pradesh", "telangana"];
          isSouthIndia = southIndiaStates.some(state => region.toLowerCase().includes(state));
          console.log(`[Theme Manager] Region: ${region}, Is South India: ${isSouthIndia}, Time: ${hours}:${minutes.toString().padStart(2, '0')} IST, In Window: ${isBetween10and12}`);
        } else {
          console.warn("[Theme Manager] Geolocation unavailable, defaulting to dark theme.");
        }
      } catch (e: any) {
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
