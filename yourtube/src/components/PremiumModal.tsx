import React, { useState, useEffect } from "react";
import { useUser } from "@/lib/AuthContext";
import axiosInstance from "@/lib/axiosinstance";
import { toast } from "sonner";
import { Sparkles, Crown, CheckCircle2, ShieldAlert, BadgeCheck } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Button } from "./ui/button";

interface PremiumModalProps {
  isOpen: boolean;
  onClose: () => void;
}

declare global {
  interface Window {
    Razorpay: any;
  }
}

interface PlanConfig {
  name: string;
  price: number; // in INR
  watchTime: string;
  downloads: string;
  badgeColor: string;
  bgColor: string;
  borderColor: string;
  badgeName: string;
}

const PLAN_TIERS: PlanConfig[] = [
  {
    name: "Bronze",
    price: 10,
    watchTime: "7 Minutes limit per video",
    downloads: "1 Video Download per day",
    badgeColor: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    bgColor: "bg-orange-500/5",
    borderColor: "border-orange-500/20 hover:border-orange-500/40",
    badgeName: "BRONZE",
  },
  {
    name: "Silver",
    price: 50,
    watchTime: "10 Minutes limit per video",
    downloads: "1 Video Download per day",
    badgeColor: "bg-slate-300/20 text-slate-300 border-slate-300/30",
    bgColor: "bg-slate-300/5",
    borderColor: "border-slate-300/20 hover:border-slate-300/40",
    badgeName: "SILVER",
  },
  {
    name: "Gold",
    price: 100,
    watchTime: "Unlimited watching time",
    downloads: "Unlimited video downloads",
    badgeColor: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
    bgColor: "bg-yellow-500/10",
    borderColor: "border-yellow-500/40 hover:border-yellow-500/70",
    badgeName: "GOLD PRO",
  },
];

export default function PremiumModal({ isOpen, onClose }: PremiumModalProps) {
  const { user, login } = useUser();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [razorpayLoaded, setRazorpayLoaded] = useState(false);

  // Load Razorpay Script
  useEffect(() => {
    if (typeof window === "undefined" || window.Razorpay) {
      setRazorpayLoaded(true);
      return;
    }

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => setRazorpayLoaded(true);
    script.onerror = () => {
      console.error("Failed to load Razorpay SDK");
      toast.error("Failed to load payment gateway. Test simulation is available.");
    };
    document.body.appendChild(script);

    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, []);

  const handlePurchase = async (plan: PlanConfig) => {
    if (!user) {
      toast.error("Please sign in to upgrade your subscription plan.");
      return;
    }

    setLoadingPlan(plan.name);
    try {
      // 1. Create Order on Backend
      const response = await axiosInstance.post("/payment/order", {
        plan: plan.name,
      });
      const orderData = response.data;

      // Handle Mock Order Mode
      if (orderData.mock) {
        toast.info(`Simulating payment for ${plan.name} plan...`);
        setTimeout(async () => {
          try {
            const verifyRes = await axiosInstance.post("/payment/verify", {
              userId: user._id,
              planType: plan.name,
              razorpay_order_id: orderData.id,
            });
            if (verifyRes.data.success) {
              login(verifyRes.data.user);
              toast.success(`Upgraded to ${plan.name} Plan successfully! (Mock Mode)`);
              onClose();
            } else {
              toast.error("Mock verification failed.");
            }
          } catch (err) {
            console.error(err);
            toast.error("Error executing mock upgrade.");
          } finally {
            setLoadingPlan(null);
          }
        }, 1500);
        return;
      }

      // Normal Razorpay Mode
      if (!window.Razorpay) {
        toast.error("Razorpay script not loaded. Simulating mock payment...");
        setTimeout(async () => {
          const verifyRes = await axiosInstance.post("/payment/verify", {
            userId: user._id,
            planType: plan.name,
            razorpay_order_id: orderData.id,
          });
          if (verifyRes.data.success) {
            login(verifyRes.data.user);
            toast.success(`Upgraded to ${plan.name} Plan! (Mock Mode)`);
            onClose();
          }
          setLoadingPlan(null);
        }, 1500);
        return;
      }

      const options = {
        key: orderData.key,
        amount: orderData.amount,
        currency: orderData.currency,
        name: "YourTube Subscriptions",
        description: `Upgrade to ${plan.name} Tier Membership`,
        order_id: orderData.id,
        handler: async (paymentResponse: any) => {
          setLoadingPlan(plan.name);
          try {
            const verifyRes = await axiosInstance.post("/payment/verify", {
              userId: user._id,
              planType: plan.name,
              razorpay_order_id: paymentResponse.razorpay_order_id,
              razorpay_payment_id: paymentResponse.razorpay_payment_id,
              razorpay_signature: paymentResponse.razorpay_signature,
            });

            if (verifyRes.data.success) {
              login(verifyRes.data.user);
              toast.success(`Success! Welcome to YourTube ${plan.name} Membership.`);
              onClose();
            } else {
              toast.error("Payment verification failed.");
            }
          } catch (err) {
            console.error("Signature verification error:", err);
            toast.error("Error verifying payment signature.");
          } finally {
            setLoadingPlan(null);
          }
        },
        prefill: {
          name: user.name || "User",
          email: user.email || "developer@example.com",
        },
        theme: {
          color: plan.name === "Gold" ? "#d97706" : plan.name === "Silver" ? "#475569" : "#ea580c",
        },
        modal: {
          ondismiss: () => {
            setLoadingPlan(null);
          },
        },
      };

      const rzpInstance = new window.Razorpay(options);
      rzpInstance.open();
    } catch (error) {
      console.error("Error initiating payment:", error);
      toast.error("Failed to process payment request.");
      setLoadingPlan(null);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[800px] bg-gradient-to-b from-gray-900 to-black text-white border border-gray-800 rounded-3xl overflow-hidden p-0 shadow-2xl">
        {/* Banner header */}
        <div className="relative bg-gradient-to-r from-purple-900 via-indigo-950 to-indigo-900 py-8 text-center flex flex-col items-center justify-center border-b border-gray-800">
          <div className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 text-xs px-3 py-1 rounded-full flex items-center gap-1 font-semibold mb-2">
            <Sparkles className="w-4 h-4 animate-spin-slow text-indigo-400" />
            TIERED MEMBERSHIP PLANS
          </div>
          <DialogTitle className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            Choose Your Upgrade Tier
          </DialogTitle>
          <p className="text-gray-300 text-xs mt-1.5 max-w-md mx-auto">
            Upgrade your membership plan to extend video watching duration, remove limits, and unlock downloads.
          </p>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {PLAN_TIERS.map((plan) => {
              const isActivePlan = user?.planType === plan.name;
              return (
                <div
                  key={plan.name}
                  className={`flex flex-col rounded-2xl border ${plan.borderColor} ${plan.bgColor} overflow-hidden p-5 transition-all duration-200 justify-between ${isActivePlan ? "ring-2 ring-indigo-500" : ""}`}
                >
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className={`text-[10px] border px-2.5 py-0.5 rounded-full font-bold tracking-wider ${plan.badgeColor}`}>
                        {plan.badgeName}
                      </span>
                      {isActivePlan && (
                        <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider flex items-center gap-0.5">
                          <BadgeCheck className="w-3.5 h-3.5" />
                          ACTIVE
                        </span>
                      )}
                    </div>
                    <div>
                      <h4 className="text-lg font-bold text-white">{plan.name} Plan</h4>
                      <p className="text-2xl font-extrabold text-white mt-1">
                        ₹{plan.price}
                        <span className="text-xs font-normal text-gray-400"> / one-time</span>
                      </p>
                    </div>

                    <ul className="space-y-2.5 pt-2 text-xs text-gray-300">
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                        <span>{plan.watchTime}</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                        <span>{plan.downloads}</span>
                      </li>
                      <li className="flex items-center gap-2 text-gray-400">
                        <CheckCircle2 className="w-4 h-4 text-gray-600 flex-shrink-0" />
                        <span>Plan upgrade badge</span>
                      </li>
                    </ul>
                  </div>

                  <div className="pt-6">
                    <Button
                      onClick={() => handlePurchase(plan)}
                      disabled={loadingPlan !== null || isActivePlan}
                      className={`w-full py-4 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer ${
                        isActivePlan
                          ? "bg-gray-800 text-gray-500 border border-gray-700"
                          : plan.name === "Gold"
                          ? "bg-amber-600 hover:bg-amber-700 text-white hover:scale-[1.01]"
                          : plan.name === "Silver"
                          ? "bg-slate-700 hover:bg-slate-600 text-white hover:scale-[1.01]"
                          : "bg-orange-600 hover:bg-orange-700 text-white hover:scale-[1.01]"
                      }`}
                    >
                      {loadingPlan === plan.name
                        ? "Upgrading..."
                        : isActivePlan
                        ? "Current Plan"
                        : `Upgrade - ₹${plan.price}`}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-center gap-2 bg-indigo-950/20 border border-indigo-900/30 rounded-xl p-3.5 text-xs text-indigo-300 text-center max-w-lg mx-auto">
            <ShieldAlert className="w-4 h-4 text-indigo-400 flex-shrink-0" />
            <span>Payments are currently in <strong>Test Sandbox Mode</strong>. Real transaction cards will not be charged.</span>
          </div>

          <div className="text-center pt-2">
            <button
              onClick={onClose}
              className="text-xs text-gray-400 hover:text-white transition-colors"
            >
              Keep current plan
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
