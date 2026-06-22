import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { useState, useRef, useCallback } from "react";
import { createContext } from "react";
import { provider, auth } from "./firebase";
import axiosInstance from "./axiosinstance";
import { useEffect, useContext } from "react";

const UserContext = createContext();

const OTP_RESEND_COOLDOWN = 60; // seconds

export const UserProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [otpDialogueOpen, setOtpDialogueOpen] = useState(false);
  const [otpData, setOtpData] = useState(null);
  // otpDigits: array of 6 single characters
  const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""]);
  const [otpError, setOtpError] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpSuccess, setOtpSuccess] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendSuccess, setResendSuccess] = useState(false);
  const cooldownRef = useRef(null);
  const inputRefs = useRef([]);

  const otpValue = otpDigits.join("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedUser = localStorage.getItem("user");
      if (savedUser) {
        try {
          setUser(JSON.parse(savedUser));
        } catch (e) {
          console.error("Failed to parse user from localStorage", e);
        }
      }
    }
  }, []);

  const login = (userdata) => {
    setUser(userdata);
    localStorage.setItem("user", JSON.stringify(userdata));
  };

  const logout = async () => {
    setUser(null);
    localStorage.removeItem("user");
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Error during sign out:", error);
    }
  };

  const startResendCooldown = useCallback(() => {
    setResendCooldown(OTP_RESEND_COOLDOWN);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(cooldownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  const triggerOtpFlow = async (payload) => {
    try {
      // Detect client region for South India email vs SMS routing
      let clientRegion = "";
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const geoRes = await fetch("https://freeipapi.com/api/json", { signal: controller.signal });
        clearTimeout(timeoutId);
        if (geoRes.ok) {
          const geoData = await geoRes.json();
          clientRegion = geoData.regionName || "";
        }
      } catch (e) {
        console.warn("Client geolocation failed, server will determine region from IP.");
      }

      const response = await axiosInstance.post("/user/send-otp", { ...payload, clientRegion });

      setOtpData({
        email: payload.email,
        name: payload.name,
        image: payload.image,
        method: response.data.method,
        region: response.data.region,
        phone: response.data.phone,
        message: response.data.message,
      });
      setOtpDigits(["", "", "", "", "", ""]);
      setOtpError("");
      setOtpSuccess(false);
      setResendSuccess(false);
      setOtpDialogueOpen(true);
      startResendCooldown();
    } catch (error) {
      console.error("OTP trigger failed:", error);
      alert(error.response?.data?.message || "Failed to trigger OTP verification.");
    }
  };


  const handlegooglesignin = async () => {
    try {
      const result = await signInWithPopup(auth, provider);
      const firebaseuser = result.user;
      const payload = {
        email: firebaseuser.email,
        name: firebaseuser.displayName,
        image: firebaseuser.photoURL || "https://github.com/shadcn.png",
      };
      await triggerOtpFlow(payload);
    } catch (error) {
      // Silently ignore popup cancelled/closed — user dismissed the popup intentionally
      const ignoredCodes = ["auth/cancelled-popup-request", "auth/popup-closed-by-user"];
      if (ignoredCodes.includes(error?.code)) {
        console.warn("Google sign-in popup was cancelled or closed.");
        return;
      }
      console.error("Google sign-in failed:", error);
    }
  };

  const handleVerifyOtp = async (e) => {
    if (e) e.preventDefault();
    if (!otpValue || otpValue.length !== 6) {
      setOtpError("Please enter all 6 digits of the OTP.");
      return;
    }

    setOtpLoading(true);
    setOtpError("");

    try {
      const response = await axiosInstance.post("/user/verify-otp", {
        email: otpData.email,
        otp: otpValue,
      });

      setOtpSuccess(true);
      setTimeout(() => {
        login(response.data.result);
        setOtpDialogueOpen(false);
        setOtpData(null);
        setOtpDigits(["", "", "", "", "", ""]);
        setOtpSuccess(false);
      }, 1200);
    } catch (error) {
      console.error("OTP verification failed:", error);
      setOtpError(error.response?.data?.message || "Invalid OTP code. Please try again.");
      // Shake the inputs by clearing them
      setOtpDigits(["", "", "", "", "", ""]);
      setTimeout(() => inputRefs.current[0]?.focus(), 50);
    } finally {
      setOtpLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (!otpData || resendCooldown > 0) return;
    setOtpLoading(true);
    setOtpError("");
    setResendSuccess(false);
    try {
      // Re-detect region so routing stays correct on resend
      let clientRegion = "";
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const geoRes = await fetch("https://freeipapi.com/api/json", { signal: controller.signal });
        clearTimeout(timeoutId);
        if (geoRes.ok) {
          const geoData = await geoRes.json();
          clientRegion = geoData.regionName || "";
        }
      } catch (e) { /* silent */ }

      const response = await axiosInstance.post("/user/send-otp", {
        email: otpData.email,
        name: otpData.name,
        image: otpData.image,
        clientRegion,
      });
      setOtpData((prev) => ({
        ...prev,
        method: response.data.method,
        message: response.data.message,
        phone: response.data.phone,
        region: response.data.region,
      }));
      setOtpDigits(["", "", "", "", "", ""]);
      setResendSuccess(true);
      startResendCooldown();
      setTimeout(() => inputRefs.current[0]?.focus(), 50);
    } catch (error) {
      console.error("Resend OTP failed:", error);
      setOtpError("Failed to resend OTP. Please try again later.");
    } finally {
      setOtpLoading(false);
    }
  };

  // Handle digit input with auto-advance
  const handleDigitChange = (index, value) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const newDigits = [...otpDigits];
    newDigits[index] = digit;
    setOtpDigits(newDigits);
    setOtpError("");
    setResendSuccess(false);
    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleDigitKeyDown = (index, e) => {
    if (e.key === "Backspace") {
      if (otpDigits[index]) {
        const newDigits = [...otpDigits];
        newDigits[index] = "";
        setOtpDigits(newDigits);
      } else if (index > 0) {
        inputRefs.current[index - 1]?.focus();
        const newDigits = [...otpDigits];
        newDigits[index - 1] = "";
        setOtpDigits(newDigits);
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleDigitPaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted) {
      const newDigits = pasted.split("").concat(["", "", "", "", "", ""]).slice(0, 6);
      setOtpDigits(newDigits);
      const nextEmpty = newDigits.findIndex((d) => !d);
      const focusIdx = nextEmpty === -1 ? 5 : nextEmpty;
      setTimeout(() => inputRefs.current[focusIdx]?.focus(), 0);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseuser) => {
      // If Firebase has a stale session but the user hasn't completed OTP verification,
      // sign them out of Firebase so they must explicitly click "Sign In" again.
      if (firebaseuser && !localStorage.getItem("user")) {
        await signOut(auth);
      }
    });
    return () => unsubscribe();
  }, []);

  return (
    <UserContext.Provider value={{ user, login, logout, handlegooglesignin }}>
      {children}
      {otpDialogueOpen && otpData && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-md transition-all duration-300">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md p-8 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200 text-foreground">
            {/* Close Button */}
            {!otpSuccess && (
              <button
                onClick={() => {
                  setOtpDialogueOpen(false);
                  setOtpData(null);
                  setOtpDigits(["", "", "", "", "", ""]);
                }}
                className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}

            {otpSuccess ? (
              /* ── Success State ── */
              <div className="flex flex-col items-center justify-center py-6 gap-4">
                <div className="w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center animate-in zoom-in-50 duration-300">
                  <svg className="w-9 h-9 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-foreground">Verified!</h3>
                <p className="text-sm text-muted-foreground">Signing you in…</p>
              </div>
            ) : (
              <>
                {/* Header */}
                <div className="text-center mb-6">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 text-primary mb-4">
                    {otpData.method === "sms" ? (
                      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                    ) : (
                      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    )}
                  </div>
                  <h3 className="text-2xl font-bold text-foreground">Secure Verification</h3>
                  <p className="text-sm text-muted-foreground mt-2">
                    {otpData.method === "sms" ? (
                      <>OTP sent to mobile number ending in <span className="font-semibold text-primary">{otpData.phone ? otpData.phone.slice(-4) : "XXXX"}</span>{otpData.region ? <> &mdash; <span className="text-xs text-muted-foreground">{otpData.region}</span></> : null}.</>
                    ) : (
                      <>OTP sent to email <span className="font-semibold text-primary">{otpData.email}</span>{otpData.region ? <> &mdash; <span className="text-xs text-muted-foreground">{otpData.region}</span></> : null}.</>
                    )}
                  </p>
                </div>

                {/* Info box */}
                <div className="bg-muted/50 border border-border rounded-xl p-4 mb-6 text-center text-sm text-foreground">
                  {otpData.message}
                </div>

                {/* OTP digit inputs */}
                <form onSubmit={handleVerifyOtp} className="space-y-5">
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 text-center">
                      Enter 6-Digit OTP Code
                    </label>
                    <div className="flex gap-2 justify-center" onPaste={handleDigitPaste}>
                      {otpDigits.map((digit, i) => (
                        <input
                          key={i}
                          ref={(el) => (inputRefs.current[i] = el)}
                          id={`otp-digit-${i}`}
                          type="text"
                          inputMode="numeric"
                          maxLength={1}
                          value={digit}
                          autoFocus={i === 0}
                          onChange={(e) => handleDigitChange(i, e.target.value)}
                          onKeyDown={(e) => handleDigitKeyDown(i, e)}
                          className={`w-11 h-14 text-center text-xl font-bold rounded-xl border bg-background
                            transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary
                            ${digit ? "border-primary/60 text-foreground" : "border-border text-muted-foreground"}
                            ${otpError ? "border-destructive/60 bg-destructive/5" : ""}
                            caret-transparent`}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Error message */}
                  {otpError && (
                    <div className="text-destructive text-xs text-center font-medium bg-destructive/10 border border-destructive/20 rounded-lg py-2">
                      {otpError}
                    </div>
                  )}

                  {/* Resend success */}
                  {resendSuccess && !otpError && (
                    <div className="text-green-600 text-xs text-center font-medium bg-green-500/10 border border-green-500/20 rounded-lg py-2">
                      ✓ A new OTP code has been sent successfully.
                    </div>
                  )}

                  {/* Verify button */}
                  <button
                    type="submit"
                    disabled={otpLoading || otpValue.length !== 6}
                    className="w-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed font-semibold py-3 rounded-xl shadow-lg shadow-primary/20 transition-all hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
                  >
                    {otpLoading ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                        Verifying…
                      </span>
                    ) : (
                      "Verify & Continue"
                    )}
                  </button>
                </form>

                {/* Footer actions */}
                <div className="text-center mt-5 flex justify-between items-center text-xs">
                  <button
                    onClick={() => {
                      setOtpDialogueOpen(false);
                      setOtpData(null);
                      setOtpDigits(["", "", "", "", "", ""]);
                    }}
                    className="text-muted-foreground hover:text-foreground underline transition-colors"
                  >
                    Cancel Login
                  </button>
                  <button
                    onClick={handleResendOtp}
                    disabled={otpLoading || resendCooldown > 0}
                    className="text-primary hover:text-primary/80 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend Code"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </UserContext.Provider>
  );
};

export const useUser = () => useContext(UserContext);
