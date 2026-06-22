import comment from "../Modals/comment.js";
import mongoose from "mongoose";

export const postcomment = async (req, res) => {
  const commentdata = req.body;
  const { commentbody } = commentdata;

  // Regex to block special characters: < > { } [ ] \ | ^ % * ~
  const specialCharsRegex = /[<>{}[\]\\|^%*~]/;
  if (specialCharsRegex.test(commentbody)) {
    return res.status(400).json({ message: "Comment contains forbidden special characters (<>{}[\]\\|^%*~)." });
  }

  let finalCity = commentdata.city || "Unknown City";
  if (finalCity === "Unknown City" || !finalCity) {
    try {
      let clientIP = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
      if (
        clientIP === "::1" ||
        clientIP === "127.0.0.1" ||
        clientIP === "::ffff:127.0.0.1"
      ) {
        clientIP = "";
      }
      const geoUrl = clientIP
        ? `https://freeipapi.com/api/json/${clientIP}`
        : `https://freeipapi.com/api/json`;
      
      const geoRes = await fetch(geoUrl);
      console.log("Backend geolocation response status:", geoRes.status);
      if (geoRes.ok) {
        const geoData = await geoRes.json();
        console.log("Backend geolocation data:", geoData);
        if (geoData && geoData.cityName) {
          finalCity = geoData.cityName;
        }
      }
    } catch (geoErr) {
      console.error("Backend geolocation lookup failed:", geoErr);
    }
  }

  const postcomment = new comment({
    ...commentdata,
    city: finalCity,
  });
  try {
    const savedComment = await postcomment.save();
    return res.status(200).json({ comment: true, data: savedComment });
  } catch (error) {
    console.error(" error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};
export const getallcomment = async (req, res) => {
  const { videoid } = req.params;
  try {
    const commentvideo = await comment.find({ videoid: videoid });
    return res.status(200).json(commentvideo);
  } catch (error) {
    console.error(" error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};
export const deletecomment = async (req, res) => {
  const { id: _id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(_id)) {
    return res.status(404).send("comment unavailable");
  }
  try {
    await comment.findByIdAndDelete(_id);
    return res.status(200).json({ comment: true });
  } catch (error) {
    console.error(" error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

export const editcomment = async (req, res) => {
  const { id: _id } = req.params;
  const { commentbody } = req.body;
  if (!mongoose.Types.ObjectId.isValid(_id)) {
    return res.status(404).send("comment unavailable");
  }
  try {
    const updatecomment = await comment.findByIdAndUpdate(_id, {
      $set: { commentbody: commentbody },
    });
    res.status(200).json(updatecomment);
  } catch (error) {
    console.error(" error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

export const likecomment = async (req, res) => {
  const { id: commentId } = req.params;
  const { userId } = req.body;

  if (!mongoose.Types.ObjectId.isValid(commentId)) {
    return res.status(404).send("Comment unavailable");
  }

  try {
    const targetComment = await comment.findById(commentId);
    if (!targetComment) {
      return res.status(404).send("Comment not found");
    }

    if (!targetComment.likes) targetComment.likes = [];
    if (!targetComment.dislikes) targetComment.dislikes = [];

    const likeIndex = targetComment.likes.indexOf(userId);
    if (likeIndex === -1) {
      targetComment.likes.push(userId);
      const dislikeIndex = targetComment.dislikes.indexOf(userId);
      if (dislikeIndex !== -1) {
        targetComment.dislikes.splice(dislikeIndex, 1);
      }
    } else {
      targetComment.likes.splice(likeIndex, 1);
    }

    await targetComment.save();
    return res.status(200).json(targetComment);
  } catch (error) {
    console.error("Error liking comment:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

export const dislikecomment = async (req, res) => {
  const { id: commentId } = req.params;
  const { userId } = req.body;

  if (!mongoose.Types.ObjectId.isValid(commentId)) {
    return res.status(404).send("Comment unavailable");
  }

  try {
    const targetComment = await comment.findById(commentId);
    if (!targetComment) {
      return res.status(404).send("Comment not found");
    }

    if (!targetComment.likes) targetComment.likes = [];
    if (!targetComment.dislikes) targetComment.dislikes = [];

    const dislikeIndex = targetComment.dislikes.indexOf(userId);
    if (dislikeIndex === -1) {
      targetComment.dislikes.push(userId);
      const likeIndex = targetComment.likes.indexOf(userId);
      if (likeIndex !== -1) {
        targetComment.likes.splice(likeIndex, 1);
      }
    } else {
      targetComment.dislikes.splice(dislikeIndex, 1);
    }

    if (targetComment.dislikes.length >= 2) {
      await comment.findByIdAndDelete(commentId);
      return res.status(200).json({ removed: true });
    }

    await targetComment.save();
    return res.status(200).json(targetComment);
  } catch (error) {
    console.error("Error disliking comment:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};
