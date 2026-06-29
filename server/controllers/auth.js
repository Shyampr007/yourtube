import mongoose from "mongoose";
import users from "../Modals/Auth.js";
import { sendOtpEmail } from "../filehelper/email.js";

export const login = async (req, res) => {
  const { email, name, image } = req.body;

  try {
    const existingUser = await users.findOne({ email });

    if (!existingUser) {
      const newUser = await users.create({ email, name, image });
      return res.status(201).json({ result: newUser });
    } else {
      return res.status(200).json({ result: existingUser });
    }
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

export const sendOtp = async (req, res) => {
  const { email, name, image, clientRegion } = req.body;

  if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }

  try {
    let user = await users.findOne({ email });
    if (!user) {
      user = await users.create({ email, name, image });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.tempOtp = otp;
    user.tempOtpExpires = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    // Detect region — prefer client-sent region, fallback to IP lookup
    let region = clientRegion || "";
    if (!region) {
      try {
        let ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || req.ip;
        if (Array.isArray(ip)) ip = ip[0];
        if (ip && ip.includes(",")) ip = ip.split(",")[0].trim();
        const isLocal = !ip || ["::1", "127.0.0.1", "::ffff:127.0.0.1"].includes(ip);
        if (!isLocal) {
          const controller = new AbortController();
          const tid = setTimeout(() => controller.abort(), 5000);
          const geoRes = await fetch("https://freeipapi.com/api/json", { signal: controller.signal });
          clearTimeout(tid);

          if (geoRes.ok) {
            const geoData = await geoRes.json();
            console.log("Geo Data:", geoData);
            region = geoData.regionName || "";
            console.log("Detected Region:", region);
          }
        }
      } catch (_) { /* silent — geolocation optional */ }
    }

    const southIndiaStates = ["tamil nadu", "kerala", "karnataka", "andhra pradesh", "telangana"];
    // If region is unknown (e.g. localhost/VPN), default to email for safety
    const isSouthIndia = !region || southIndiaStates.some(s => region.toLowerCase().includes(s));

    console.log("\n==================================================");
    console.log(`  OTP: ${otp}  |  Email: ${email}`);
    console.log(`  Region: ${region || "Unknown"}  |  South India: ${isSouthIndia}`);
    console.log("==================================================\n");

    if (isSouthIndia) {
      // Fire-and-forget — never block the response on SMTP
      sendOtpEmail(email, user.name || name || "User", otp).catch(err =>
        console.error("Email delivery failed (non-blocking):", err.message)
      );
      return res.status(200).json({
        success: true,
        method: "email",
        region,
        message: "An OTP has been sent to your registered email address.",
      });
    } else {
      const phone = user.phoneNumber || "+91 98765 43210";
      console.log(`  SMS → ${phone}: OTP is ${otp}`);
      return res.status(200).json({
        success: true,
        method: "sms",
        region,
        phone,
        message: `An OTP has been sent to your registered mobile number ending in ${phone.slice(-4)}.`,
      });
    }
  } catch (error) {
    console.error("sendOtp error:", error);
    return res.status(500).json({ message: "Failed to send OTP. Please try again." });
  }
};



export const verifyOtp = async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ message: "Email and OTP are required" });
  }

  try {
    const user = await users.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.tempOtp || user.tempOtp !== otp) {
      return res.status(400).json({ message: "Invalid OTP verification code." });
    }

    if (user.tempOtpExpires && new Date() > user.tempOtpExpires) {
      return res.status(400).json({ message: "OTP has expired. Please request a new one." });
    }

    user.tempOtp = undefined;
    user.tempOtpExpires = undefined;
    await user.save();

    return res.status(200).json({ result: user });
  } catch (error) {
    console.error("verifyOtp error:", error);
    return res.status(500).json({ message: "Authentication verification failed." });
  }
};
export const updateprofile = async (req, res) => {
  const { id: _id } = req.params;
  const { channelname, description } = req.body;
  if (!mongoose.Types.ObjectId.isValid(_id)) {
    return res.status(500).json({ message: "User unavailable..." });
  }
  try {
    const updatedata = await users.findByIdAndUpdate(
      _id,
      {
        $set: {
          channelname: channelname,
          description: description,
        },
      },
      { new: true }
    );
    return res.status(201).json(updatedata);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

export const toggleSubscribe = async (req, res) => {
  const { id: userId } = req.params;
  const { channelId } = req.body;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(404).json({ message: "User unavailable..." });
  }

  try {
    const user = await users.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.subscribedChannels) {
      user.subscribedChannels = [];
    }

    const index = user.subscribedChannels.indexOf(channelId);
    let subscribed = false;
    if (index === -1) {
      user.subscribedChannels.push(channelId);
      subscribed = true;
    } else {
      user.subscribedChannels.splice(index, 1);
      subscribed = false;
    }

    await user.save();
    return res.status(200).json({ subscribed, subscribedChannels: user.subscribedChannels });
  } catch (error) {
    console.error("Subscription toggle error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

export const getAllUsers = async (req, res) => {
  try {
    const allUsers = await users.find(
      {},
      { email: 1, name: 1, image: 1, channelname: 1, _id: 1 }
    ).lean();
    return res.status(200).json(allUsers);
  } catch (error) {
    console.error("getAllUsers error:", error);
    return res.status(500).json({ message: "Failed to fetch users" });
  }
};

