import Razorpay from "razorpay";
import crypto from "crypto";
import User from "../Modals/Auth.js";
import { sendInvoiceEmail } from "../filehelper/email.js";

// Plan price mappings in paise (INR)
const SUBSCRIPTION_PRICES = {
  Bronze: 1000,   // ₹10
  Silver: 5000,   // ₹50
  Gold: 10000,   // ₹100
};

// Initialize Razorpay safely
const getRazorpayInstance = () => {
  const keyId = process.env.RAZORPAY_KEY_ID || "rzp_test_mockkeyid123";
  const keySecret = process.env.RAZORPAY_KEY_SECRET || "mockkeysecret123";
  
  return new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });
};

// Create a new Razorpay Order for a specific subscription plan tier
export const createPremiumOrder = async (req, res) => {
  const { plan } = req.body;
  
  if (!plan || !SUBSCRIPTION_PRICES[plan]) {
    return res.status(400).json({ message: "Invalid plan type specified." });
  }

  const orderAmount = SUBSCRIPTION_PRICES[plan];
  const keyId = process.env.RAZORPAY_KEY_ID;
  const isMockMode = !keyId || keyId.startsWith("rzp_test_mock");

  if (isMockMode) {
    console.log(`Razorpay Keys are mock or not set. Creating mock order for plan ${plan}.`);
    return res.status(200).json({
      id: "order_mock_" + Math.random().toString(36).substring(2, 15),
      amount: orderAmount,
      currency: "INR",
      mock: true,
      key: "rzp_test_mockkeyid123",
      plan: plan
    });
  }

  try {
    const razorpay = getRazorpayInstance();
    const options = {
      amount: orderAmount,
      currency: "INR",
      receipt: `receipt_order_${plan.toLowerCase()}_` + Date.now(),
    };

    const order = await razorpay.orders.create(options);
    return res.status(200).json({
      ...order,
      mock: false,
      key: keyId,
      plan: plan
    });
  } catch (error) {
    console.error(`Razorpay order creation failed for plan ${plan}:`, error);
    // Fallback order so the developer can continue testing
    return res.status(200).json({
      id: "order_mock_" + Math.random().toString(36).substring(2, 15),
      amount: orderAmount,
      currency: "INR",
      mock: true,
      key: "rzp_test_mockkeyid123",
      plan: plan
    });
  }
};

// Verify payment signature, upgrade plan, and trigger email receipt
export const verifyPremiumPayment = async (req, res) => {
  const { userId, planType, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  if (!userId || !planType || !SUBSCRIPTION_PRICES[planType]) {
    return res.status(400).json({ success: false, message: "Invalid request payload." });
  }

  // Handle Mock Payment Upgrade
  if (razorpay_order_id && razorpay_order_id.startsWith("order_mock_")) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ success: false, message: "User not found." });
      }

      user.planType = planType;
      user.isPremium = planType === "Gold";
      await user.save();

      // Trigger asynchronous invoice email notification
      const amount = SUBSCRIPTION_PRICES[planType];
      sendInvoiceEmail(user.email, user.name, {
        planType,
        amount,
        orderId: razorpay_order_id,
        transactionId: razorpay_payment_id || "tx_mock_" + Date.now().toString().slice(-6),
      });

      return res.status(200).json({
        success: true,
        message: `Plan upgraded successfully to ${planType} (Mock Mode).`,
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          isPremium: user.isPremium,
          planType: user.planType,
        }
      });
    } catch (dbErr) {
      console.error("Mock upgrade database error:", dbErr);
      return res.status(500).json({ success: false, message: "Failed to update subscription status." });
    }
  }

  // Handle Real Payment Upgrade
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) {
    return res.status(500).json({ success: false, message: "Payment configuration secret is missing." });
  }

  try {
    const hmac = crypto.createHmac("sha256", keySecret);
    hmac.update(razorpay_order_id + "|" + razorpay_payment_id);
    const generatedSignature = hmac.digest("hex");

    if (generatedSignature !== razorpay_signature) {
      return res.status(400).json({ success: false, message: "Payment signature verification failed." });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    user.planType = planType;
    user.isPremium = planType === "Gold";
    await user.save();

    // Trigger invoice email notification
    const amount = SUBSCRIPTION_PRICES[planType];
    sendInvoiceEmail(user.email, user.name, {
      planType,
      amount,
      orderId: razorpay_order_id,
      transactionId: razorpay_payment_id,
    });

    return res.status(200).json({
      success: true,
      message: `Plan upgraded successfully to ${planType}.`,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        isPremium: user.isPremium,
        planType: user.planType,
      }
    });
  } catch (error) {
    console.error("Signature verification error:", error);
    return res.status(500).json({ success: false, message: "Internal verification error occurred." });
  }
};
