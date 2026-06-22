import React, { useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Textarea } from "./ui/textarea";
import { Button } from "./ui/button";
import { formatDistanceToNow } from "date-fns";
import { useUser } from "@/lib/AuthContext";
import axiosInstance from "@/lib/axiosinstance";
import { ThumbsUp, ThumbsDown, Languages } from "lucide-react";
import { toast } from "sonner";
interface Comment {
  _id: string;
  videoid: string;
  userid: string;
  commentbody: string;
  usercommented: string;
  city?: string;
  likes?: string[];
  dislikes?: string[];
  commentedon: string;
}
const Comments = ({ videoId }: any) => {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const { user, login, handlegooglesignin } = useUser();
  const [loading, setLoading] = useState(true);
  const [translations, setTranslations] = useState<{[commentId: string]: string}>({});
  const [translatingIds, setTranslatingIds] = useState<string[]>([]);
  useEffect(() => {
    loadComments();
  }, [videoId]);

  const loadComments = async () => {
    try {
      const res = await axiosInstance.get(`/comment/${videoId}`);
      setComments(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      console.log(error);
      setComments([]);
    } finally {
      setLoading(false);
    }
  };
  if (loading) {
    return <div>Loading history...</div>;
  }
  // ── Post comment — optimistic: appears instantly, confirmed from server ──
  const handleSubmitComment = async () => {
    if (!user || !newComment.trim()) return;

    const specialCharsRegex = /[<>{}[\]\\|^%*~]/;
    if (specialCharsRegex.test(newComment)) {
      toast.error("Comment contains forbidden characters: < > { } [ ] \\ | ^ % * ~");
      return;
    }

    // Build a temporary comment that appears immediately
    const tempId = `temp_${Date.now()}`;
    const optimisticComment: Comment = {
      _id: tempId,
      videoid: videoId,
      userid: user._id,
      commentbody: newComment,
      usercommented: user.name || "You",
      city: "Posting…",
      likes: [],
      dislikes: [],
      commentedon: new Date().toISOString(),
    };

    // Show in UI right away, clear the input
    setComments((prev) => [optimisticComment, ...prev]);
    const submitted = newComment;
    setNewComment("");
    setIsSubmitting(true);

    try {
      const res = await axiosInstance.post("/comment/postcomment", {
        videoid: videoId,
        userid: user._id,
        commentbody: submitted,
        usercommented: user.name,
      });

      if (res.data.comment) {
        // Replace the temp entry with the real DB record
        setComments((prev) =>
          prev.map((c) =>
            c._id === tempId
              ? {
                  _id: res.data.data._id,
                  videoid: videoId,
                  userid: user._id,
                  commentbody: submitted,
                  usercommented: user.name || "Anonymous",
                  city: res.data.data.city || "Unknown City",
                  likes: [],
                  dislikes: [],
                  commentedon: res.data.data.commentedon || new Date().toISOString(),
                }
              : c
          )
        );
      }
    } catch (error: any) {
      // Remove the optimistic entry and restore the draft
      setComments((prev) => prev.filter((c) => c._id !== tempId));
      setNewComment(submitted);
      if (error?.response?.data?.message) {
        toast.error(error.response.data.message);
      } else {
        toast.error("Failed to post comment. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (comment: Comment) => {
    setEditingCommentId(comment._id);
    setEditText(comment.commentbody);
  };

  const handleUpdateComment = async () => {
    if (!editText.trim()) return;
    try {
      const res = await axiosInstance.post(
        `/comment/editcomment/${editingCommentId}`,
        { commentbody: editText }
      );
      if (res.data) {
        setComments((prev) =>
          prev.map((c) =>
            c._id === editingCommentId ? { ...c, commentbody: editText } : c
          )
        );
        setEditingCommentId(null);
        setEditText("");
      }
    } catch (error) {
      console.log(error);
    }
  };

  const handleTranslate = async (commentId: string, commentBody: string) => {
    if (translations[commentId]) {
      setTranslations((prev) => {
        const copy = { ...prev };
        delete copy[commentId];
        return copy;
      });
      return;
    }

    setTranslatingIds((prev) => [...prev, commentId]);
    try {
      const res = await fetch(
        `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(
          commentBody
        )}`
      );
      if (res.ok) {
        const data = await res.json();
        const translatedText = data?.[0]?.[0]?.[0];
        if (translatedText) {
          setTranslations((prev) => ({ ...prev, [commentId]: translatedText }));
        } else {
          toast.error("Could not translate comment.");
        }
      } else {
        toast.error("Translation service error.");
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to connect to translation service.");
    } finally {
      setTranslatingIds((prev) => prev.filter((id) => id !== commentId));
    }
  };

  // ── Like comment — optimistic toggle ────────────────────────────────────
  const handleLikeComment = async (commentId: string) => {
    if (!user) {
      try {
        const response = await axiosInstance.post("/user/login", {
          email: "developer@example.com",
          name: "Developer User",
          image: "https://github.com/shadcn.png",
        });
        login(response.data.result);
        return;
      } catch (err) {
        console.error("Auto login failed", err);
      }
      return;
    }

    // Snapshot
    const prev = comments.find((c) => c._id === commentId);

    // Optimistic flip
    setComments((all) =>
      all.map((c) => {
        if (c._id !== commentId) return c;
        const already = c.likes?.includes(user._id);
        return {
          ...c,
          likes: already
            ? c.likes!.filter((id) => id !== user._id)
            : [...(c.likes || []), user._id],
        };
      })
    );

    try {
      const res = await axiosInstance.post(`/comment/likecomment/${commentId}`, {
        userId: user._id,
      });
      if (res.data) {
        setComments((all) =>
          all.map((c) =>
            c._id === commentId
              ? { ...c, likes: res.data.likes, dislikes: res.data.dislikes }
              : c
          )
        );
      }
    } catch {
      // Rollback
      if (prev) {
        setComments((all) => all.map((c) => (c._id === commentId ? prev : c)));
      }
    }
  };

  // ── Dislike comment — optimistic toggle ─────────────────────────────────
  const handleDislikeComment = async (commentId: string) => {
    if (!user) {
      try {
        const response = await axiosInstance.post("/user/login", {
          email: "developer@example.com",
          name: "Developer User",
          image: "https://github.com/shadcn.png",
        });
        login(response.data.result);
        return;
      } catch (err) {
        console.error("Auto login failed", err);
      }
      return;
    }

    const prev = comments.find((c) => c._id === commentId);

    setComments((all) =>
      all.map((c) => {
        if (c._id !== commentId) return c;
        const already = c.dislikes?.includes(user._id);
        return {
          ...c,
          dislikes: already
            ? c.dislikes!.filter((id) => id !== user._id)
            : [...(c.dislikes || []), user._id],
        };
      })
    );

    try {
      const res = await axiosInstance.post(`/comment/dislikecomment/${commentId}`, {
        userId: user._id,
      });
      if (res.data.removed) {
        toast.success("Comment auto-removed after 2 dislikes.");
        setComments((all) => all.filter((c) => c._id !== commentId));
      } else if (res.data) {
        setComments((all) =>
          all.map((c) =>
            c._id === commentId
              ? { ...c, likes: res.data.likes, dislikes: res.data.dislikes }
              : c
          )
        );
      }
    } catch {
      if (prev) {
        setComments((all) => all.map((c) => (c._id === commentId ? prev : c)));
      }
    }
  };

  // ── Delete — removes instantly, restores on failure ──────────────────────
  const handleDelete = async (id: string) => {
    const snapshot = comments.find((c) => c._id === id);
    setComments((prev) => prev.filter((c) => c._id !== id));
    try {
      await axiosInstance.delete(`/comment/deletecomment/${id}`);
    } catch {
      if (snapshot) setComments((prev) => [snapshot, ...prev]);
      toast.error("Delete failed. Please try again.");
    }
  };
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold border-b pb-2">{comments.length} Comments</h2>

      {user ? (
        <div className="flex gap-4">
          <Avatar className="w-10 h-10">
            <AvatarImage src={user.image || ""} />
            <AvatarFallback>{user.name?.[0] || "U"}</AvatarFallback>
          </Avatar>
          <div className="flex-1 space-y-2">
            <Textarea
              placeholder="Add a comment..."
              value={newComment}
              onChange={(e: any) => setNewComment(e.target.value)}
              className="min-h-[80px] resize-none border-0 border-b-2 rounded-none focus-visible:ring-0"
            />
            <div className="flex gap-2 justify-end">
              <Button
                variant="ghost"
                onClick={() => setNewComment("")}
                disabled={!newComment.trim()}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmitComment}
                disabled={!newComment.trim() || isSubmitting}
              >
                Comment
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between p-4 bg-secondary border border-dashed border-border rounded-lg">
          <p className="text-sm text-gray-600">You must be signed in to post comments.</p>
          <Button onClick={handlegooglesignin} size="sm" className="rounded-full">
            Sign in with Developer Account
          </Button>
        </div>
      )}
      <div className="space-y-4">
        {comments.length === 0 ? (
          <p className="text-sm text-gray-500 italic">
            No comments yet. Be the first to comment!
          </p>
        ) : (
          comments.map((comment) => (
            <div key={comment._id} className="flex gap-4">
              <Avatar className="w-10 h-10">
                <AvatarImage src="/placeholder.svg?height=40&width=40" />
                <AvatarFallback>{comment.usercommented[0]}</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-medium text-sm">
                    {comment.usercommented}
                  </span>
                  <span className="text-xs text-gray-500">•</span>
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                    {comment.city || "Unknown City"}
                  </span>
                  <span className="text-xs text-gray-500">•</span>
                  <span className="text-xs text-gray-600">
                    {formatDistanceToNow(new Date(comment.commentedon))} ago
                  </span>
                </div>

                {editingCommentId === comment._id ? (
                  <div className="space-y-2">
                    <Textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                    />
                    <div className="flex gap-2 justify-end">
                      <Button
                        onClick={handleUpdateComment}
                        disabled={!editText.trim()}
                      >
                        Save
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setEditingCommentId(null);
                          setEditText("");
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-sm">
                      {translations[comment._id] ? (
                        <span>
                          <span className="text-xs text-blue-600 font-semibold block mb-0.5">
                            Translated to English:
                          </span>
                          {translations[comment._id]}
                        </span>
                      ) : (
                        comment.commentbody
                      )}
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                      <button
                        onClick={() => handleLikeComment(comment._id)}
                        className={`flex items-center gap-1 hover:text-black transition-colors ${
                          user && comment.likes?.includes(user._id) ? "text-blue-600 font-semibold" : ""
                        }`}
                      >
                        <ThumbsUp className="w-4 h-4" />
                        <span>{comment.likes?.length || 0}</span>
                      </button>

                      <button
                        onClick={() => handleDislikeComment(comment._id)}
                        className={`flex items-center gap-1 hover:text-black transition-colors ${
                          user && comment.dislikes?.includes(user._id) ? "text-red-600 font-semibold" : ""
                        }`}
                      >
                        <ThumbsDown className="w-4 h-4" />
                        <span>{comment.dislikes?.length || 0}</span>
                      </button>

                      <button
                        onClick={() => handleTranslate(comment._id, comment.commentbody)}
                        className="flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium transition-colors"
                        disabled={translatingIds.includes(comment._id)}
                      >
                        <Languages className="w-4 h-4" />
                        <span>
                          {translatingIds.includes(comment._id)
                            ? "Translating..."
                            : translations[comment._id]
                            ? "Show original"
                            : "Translate"}
                        </span>
                      </button>

                      {comment.userid === user?._id && (
                        <div className="flex gap-2 border-l pl-3 ml-1">
                          <button onClick={() => handleEdit(comment)} className="hover:text-black">
                            Edit
                          </button>
                          <button onClick={() => handleDelete(comment._id)} className="hover:text-black text-red-500">
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default Comments;
