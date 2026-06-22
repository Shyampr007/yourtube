import User from "../Modals/Auth.js";
import Video from "../Modals/video.js";

// Check download permission and register download
export const registerVideoDownload = async (req, res) => {
  const { userId, videoId } = req.body;

  if (!userId || !videoId) {
    return res.status(400).json({ message: "User ID and Video ID are required." });
  }

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    const videoObj = await Video.findById(videoId);
    if (!videoObj) {
      return res.status(404).json({ message: "Video not found." });
    }

    // Check limits if user is not premium
    if (!user.isPremium) {
      const todayString = new Date().toISOString().split("T")[0]; // YYYY-MM-DD format

      if (user.lastDownloadDate === todayString) {
        if (user.dailyDownloadCount >= 1) {
          return res.status(403).json({
            message: "Daily download limit reached. Free users are allowed 1 download per day. Upgrade to Premium for unlimited downloads!",
            limitReached: true,
          });
        } else {
          // Increment count for today
          user.dailyDownloadCount += 1;
        }
      } else {
        // First download of the day
        user.lastDownloadDate = todayString;
        user.dailyDownloadCount = 1;
      }
    }

    // Add video to downloads history if it isn't already present
    if (!user.downloads.includes(videoId)) {
      user.downloads.push(videoId);
    }

    await user.save();

    // Send successful response with the filepath
    return res.status(200).json({
      message: "Download registered successfully.",
      filePath: videoObj.filepath,
      fileName: videoObj.filename,
    });
  } catch (error) {
    console.error("Error in registering video download:", error);
    return res.status(500).json({ message: "Internal server error occurred." });
  }
};

// Retrieve user's downloads history
export const getUserDownloadsList = async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await User.findById(userId).populate("downloads");
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    return res.status(200).json(user.downloads);
  } catch (error) {
    console.error("Error in fetching downloads history:", error);
    return res.status(500).json({ message: "Internal server error occurred." });
  }
};
