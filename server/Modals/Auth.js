import mongoose from "mongoose";
const userschema = mongoose.Schema({
  email: { type: String, required: true },
  name: { type: String },
  channelname: { type: String },
  description: { type: String },
  image: { type: String },
  subscribedChannels: { type: [String], default: [] },
  isPremium: { type: Boolean, default: false },
  planType: { type: String, default: "Free" },
  lastDownloadDate: { type: String, default: "" },
  dailyDownloadCount: { type: Number, default: 0 },
  downloads: {
    type: [{ type: mongoose.Schema.Types.ObjectId, ref: "videofiles" }],
    default: [],
  },
  tempOtp: { type: String },
  tempOtpExpires: { type: Date },
  phoneNumber: { type: String, default: "+91 98765 43210" },
  joinedon: { type: Date, default: Date.now },
});

export default mongoose.model("user", userschema);
