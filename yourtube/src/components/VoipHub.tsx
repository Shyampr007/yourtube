/* =============================================================================
   VoipHub.tsx — Floating VoIP Dashboard
   ─ WebRTC P2P video calls (camera + audio)
   ─ Screen sharing (any tab/window, including YouTube)
   ─ Local session recording (MediaRecorder + Web Audio mixing)
   ─ WebSocket signaling via existing backend
============================================================================= */

"use client";

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useUser } from "@/lib/AuthContext";
import axiosInstance from "@/lib/axiosinstance";

// ─── Types ──────────────────────────────────────────────────────────────────

type CallState =
  | "idle"
  | "dialing"
  | "incoming"
  | "active";

interface Contact {
  _id: string;
  name: string;
  email: string;
  image: string;
  channelname?: string;
}

// ─── STUN servers (publicly available) ──────────────────────────────────────
const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

// ─── Helpers ────────────────────────────────────────────────────────────────
const WS_URL =
  (process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000").replace(
    /^http/,
    "ws"
  );

// ─── Component ──────────────────────────────────────────────────────────────
export default function VoipHub() {
  const { user } = useUser();

  // Panel open/close
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"contacts" | "call">("contacts");

  // Contacts
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);

  // Call state
  const [callState, setCallState] = useState<CallState>("idle");
  const [callPeer, setCallPeer] = useState<Contact | null>(null); // who we're calling / being called by
  const [incomingOffer, setIncomingOffer] = useState<RTCSessionDescriptionInit | null>(null);

  // Media states
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [sharingScreen, setSharingScreen] = useState(false);
  const [recording, setRecording] = useState(false);

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const recordingDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const remoteAudioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  // ── WebSocket connect ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!user?._id) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "register", userId: user._id }));
    };

    ws.onmessage = (event) => {
      let msg: any;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      handleSignalingMessage(msg);
    };

    ws.onclose = () => {
      wsRef.current = null;
    };

    return () => {
      ws.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?._id]);

  // ── Fetch contacts ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user || !open) return;
    setContactsLoading(true);
    axiosInstance
      .get("/user/all")
      .then((res) => {
        // Exclude self
        setContacts(
          (res.data as Contact[]).filter((c) => c._id !== user._id)
        );
      })
      .catch(console.error)
      .finally(() => setContactsLoading(false));
  }, [user, open]);

  // ── Signaling message handler ──────────────────────────────────────────────
  const handleSignalingMessage = useCallback(
    async (msg: any) => {
      switch (msg.type) {
        case "online-users":
          setOnlineUsers(msg.users as string[]);
          break;

        case "incoming-call": {
          // Build a contact object from incoming metadata
          const caller: Contact = {
            _id: msg.from,
            name: msg.fromName || "Unknown",
            email: "",
            image: msg.fromImage || "",
          };
          setCallPeer(caller);
          setIncomingOffer(msg.offer);
          setCallState("incoming");
          setOpen(true);
          setTab("call");
          break;
        }

        case "call-accepted": {
          if (!pcRef.current) break;
          await pcRef.current.setRemoteDescription(
            new RTCSessionDescription(msg.answer)
          );
          setCallState("active");
          setTab("call");
          break;
        }

        case "call-declined":
          tearDown();
          setCallState("idle");
          setCallPeer(null);
          alert("Call was declined.");
          break;

        case "ice-candidate": {
          if (!pcRef.current || !msg.candidate) break;
          try {
            await pcRef.current.addIceCandidate(
              new RTCIceCandidate(msg.candidate)
            );
          } catch (e) {
            console.warn("ICE candidate error", e);
          }
          break;
        }

        case "call-ended":
          tearDown();
          setCallState("idle");
          setCallPeer(null);
          break;

        default:
          break;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // ── Create PeerConnection ──────────────────────────────────────────────────
  const createPC = useCallback(() => {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    pcRef.current = pc;

    pc.onicecandidate = ({ candidate }) => {
      if (candidate && callPeer && wsRef.current) {
        wsRef.current.send(
          JSON.stringify({
            type: "ice-candidate",
            to: callPeer._id,
            candidate,
          })
        );
      }
    };

    pc.ontrack = ({ streams }) => {
      if (remoteVideoRef.current && streams[0]) {
        remoteVideoRef.current.srcObject = streams[0];
        // ── Mix remote audio into recording destination ──
        if (audioCtxRef.current && recordingDestRef.current) {
          const remoteAudioTrack = streams[0].getAudioTracks()[0];
          if (remoteAudioTrack) {
            const remoteStream = new MediaStream([remoteAudioTrack]);
            if (remoteAudioSourceRef.current) {
              remoteAudioSourceRef.current.disconnect();
            }
            remoteAudioSourceRef.current =
              audioCtxRef.current.createMediaStreamSource(remoteStream);
            remoteAudioSourceRef.current.connect(recordingDestRef.current);
          }
        }
      }
    };

    pc.onconnectionstatechange = () => {
      if (
        pc.connectionState === "disconnected" ||
        pc.connectionState === "failed"
      ) {
        tearDown();
        setCallState("idle");
        setCallPeer(null);
      }
    };

    return pc;
  }, [callPeer]);

  // ── Get local media (camera + mic) ─────────────────────────────────────────
  const getLocalStream = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    localStreamRef.current = stream;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
    }
    return stream;
  }, []);

  // ── Add tracks to peer connection ──────────────────────────────────────────
  const addTracksToPC = useCallback(
    (pc: RTCPeerConnection, stream: MediaStream) => {
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });
    },
    []
  );

  // ── Initiate a call ────────────────────────────────────────────────────────
  const initiateCall = useCallback(
    async (contact: Contact) => {
      if (!user || !wsRef.current) return;
      setCallPeer(contact);
      setCallState("dialing");
      setTab("call");

      try {
        const stream = await getLocalStream();
        const pc = createPC();
        addTracksToPC(pc, stream);

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        wsRef.current.send(
          JSON.stringify({
            type: "call-user",
            from: user._id,
            fromName: user.name,
            fromImage: user.image,
            to: contact._id,
            offer,
          })
        );
      } catch (err) {
        console.error("initiateCall error:", err);
        tearDown();
        setCallState("idle");
        setCallPeer(null);
        alert("Could not access camera/microphone. Please check permissions.");
      }
    },
    [user, getLocalStream, createPC, addTracksToPC]
  );

  // ── Accept incoming call ────────────────────────────────────────────────────
  const acceptCall = useCallback(async () => {
    if (!incomingOffer || !callPeer || !wsRef.current) return;

    try {
      const stream = await getLocalStream();
      const pc = createPC();
      addTracksToPC(pc, stream);

      await pc.setRemoteDescription(new RTCSessionDescription(incomingOffer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      wsRef.current.send(
        JSON.stringify({
          type: "accept-call",
          to: callPeer._id,
          answer,
        })
      );

      setCallState("active");
      setTab("call");
      setIncomingOffer(null);
    } catch (err) {
      console.error("acceptCall error:", err);
      tearDown();
      setCallState("idle");
      setCallPeer(null);
    }
  }, [incomingOffer, callPeer, getLocalStream, createPC, addTracksToPC]);

  // ── Decline incoming call ───────────────────────────────────────────────────
  const declineCall = useCallback(() => {
    if (callPeer && wsRef.current) {
      wsRef.current.send(
        JSON.stringify({ type: "decline-call", to: callPeer._id })
      );
    }
    setCallState("idle");
    setCallPeer(null);
    setIncomingOffer(null);
  }, [callPeer]);

  // ── Hang up ────────────────────────────────────────────────────────────────
  const hangUp = useCallback(() => {
    if (callPeer && wsRef.current) {
      wsRef.current.send(
        JSON.stringify({ type: "hangup", to: callPeer._id })
      );
    }
    if (recording) stopRecording();
    tearDown();
    setCallState("idle");
    setCallPeer(null);
    setTab("contacts");
  }, [callPeer, recording]);

  // ── Tear down streams and PC ────────────────────────────────────────────────
  const tearDown = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    setSharingScreen(false);
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
    recordingDestRef.current = null;
    remoteAudioSourceRef.current = null;
  }, []);

  // ── Toggle microphone ──────────────────────────────────────────────────────
  const toggleMic = useCallback(() => {
    if (!localStreamRef.current) return;
    localStreamRef.current.getAudioTracks().forEach((t) => {
      t.enabled = !t.enabled;
    });
    setMicOn((prev) => !prev);
  }, []);

  // ── Toggle camera ──────────────────────────────────────────────────────────
  const toggleCam = useCallback(() => {
    if (!localStreamRef.current) return;
    localStreamRef.current.getVideoTracks().forEach((t) => {
      t.enabled = !t.enabled;
    });
    setCamOn((prev) => !prev);
  }, []);

  // ── Screen share ───────────────────────────────────────────────────────────
  const toggleScreenShare = useCallback(async () => {
    if (!pcRef.current || !localStreamRef.current) return;

    if (sharingScreen) {
      // Stop screen share, restore camera
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;

      const camTrack = localStreamRef.current.getVideoTracks()[0];
      const sender = pcRef.current
        .getSenders()
        .find((s) => s.track?.kind === "video");
      if (sender && camTrack) {
        await sender.replaceTrack(camTrack);
        camTrack.enabled = true;
      }
      // Restore local preview
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }
      setSharingScreen(false);
    } else {
      try {
        const screenStream = await (navigator.mediaDevices as any).getDisplayMedia({
          video: { cursor: "always" },
          audio: true, // capture tab audio if available
        });
        screenStreamRef.current = screenStream;

        const screenVideoTrack = screenStream.getVideoTracks()[0];
        const sender = pcRef.current
          .getSenders()
          .find((s) => s.track?.kind === "video");
        if (sender) {
          await sender.replaceTrack(screenVideoTrack);
        }
        // Show screen share in local preview
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = screenStream;
        }

        // Auto-stop when user uses browser's native stop button
        screenVideoTrack.onended = () => {
          setSharingScreen(false);
          screenStreamRef.current = null;
          const camTrack = localStreamRef.current?.getVideoTracks()[0];
          if (sender && camTrack) {
            sender.replaceTrack(camTrack);
            if (localVideoRef.current) {
              localVideoRef.current.srcObject = localStreamRef.current;
            }
          }
        };

        setSharingScreen(true);
      } catch (err: any) {
        if (err.name !== "NotAllowedError") {
          console.error("Screen share error:", err);
        }
      }
    }
  }, [sharingScreen]);

  // ── Recording ──────────────────────────────────────────────────────────────
  const startRecording = useCallback(() => {
    if (!localStreamRef.current) return;

    // Create AudioContext for mixing local + remote audio
    const audioCtx = new AudioContext();
    audioCtxRef.current = audioCtx;
    const dest = audioCtx.createMediaStreamDestination();
    recordingDestRef.current = dest;

    // Local audio
    const localAudioTracks = localStreamRef.current.getAudioTracks();
    if (localAudioTracks.length > 0) {
      const localAudioStream = new MediaStream(localAudioTracks);
      const localSource = audioCtx.createMediaStreamSource(localAudioStream);
      localSource.connect(dest);
    }

    // Remote audio (if already have a remote stream)
    const remoteStream = remoteVideoRef.current?.srcObject as MediaStream | null;
    if (remoteStream) {
      const remoteAudioTracks = remoteStream.getAudioTracks();
      if (remoteAudioTracks.length > 0) {
        const remoteAudioStream = new MediaStream(remoteAudioTracks);
        remoteAudioSourceRef.current =
          audioCtx.createMediaStreamSource(remoteAudioStream);
        remoteAudioSourceRef.current.connect(dest);
      }
    }

    // Combine: video track (screen share or camera) + mixed audio
    const videoSource = sharingScreen ? screenStreamRef.current : localStreamRef.current;
    const videoTrack = videoSource?.getVideoTracks()[0];
    const tracks: MediaStreamTrack[] = [...dest.stream.getAudioTracks()];
    if (videoTrack) tracks.push(videoTrack);

    const combinedStream = new MediaStream(tracks);
    recordedChunksRef.current = [];

    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
      ? "video/webm;codecs=vp9,opus"
      : "video/webm";

    const recorder = new MediaRecorder(combinedStream, { mimeType });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `yourtube-call-${Date.now()}.webm`;
      a.click();
      URL.revokeObjectURL(url);
    };

    mediaRecorderRef.current = recorder;
    recorder.start(250); // collect every 250 ms
    setRecording(true);
  }, [sharingScreen]);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    setRecording(false);
  }, []);

  // ─── Don't render if user not logged in ───────────────────────────────────
  if (!user) return null;

  const isOnline = (id: string) => onlineUsers.includes(id);

  // ─── UI ──────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Incoming call overlay (always visible, regardless of panel open) ── */}
      {callState === "incoming" && callPeer && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div
            style={{
              background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
              border: "1px solid rgba(99,179,237,0.3)",
              borderRadius: "24px",
              padding: "40px 32px",
              maxWidth: 380,
              width: "90%",
              boxShadow: "0 25px 50px rgba(0,0,0,0.6), 0 0 0 1px rgba(99,179,237,0.1)",
              textAlign: "center",
              animation: "voip-pulse 2s ease-in-out infinite",
            }}
          >
            {/* Avatar with ring animation */}
            <div style={{ position: "relative", display: "inline-block", marginBottom: 20 }}>
              <div style={{
                position: "absolute", inset: -8, borderRadius: "50%",
                border: "3px solid rgba(99,179,237,0.5)",
                animation: "voip-ring 1.5s ease-out infinite",
              }} />
              <div style={{
                position: "absolute", inset: -16, borderRadius: "50%",
                border: "2px solid rgba(99,179,237,0.25)",
                animation: "voip-ring 1.5s ease-out 0.3s infinite",
              }} />
              {callPeer.image ? (
                <img
                  src={callPeer.image}
                  alt={callPeer.name}
                  style={{ width: 80, height: 80, borderRadius: "50%", objectFit: "cover", border: "3px solid rgba(99,179,237,0.6)" }}
                />
              ) : (
                <div style={{
                  width: 80, height: 80, borderRadius: "50%",
                  background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 32, fontWeight: 700, color: "white",
                }}>
                  {callPeer.name[0]}
                </div>
              )}
            </div>

            <p style={{ color: "#a0aec0", fontSize: 13, marginBottom: 6, letterSpacing: 2, textTransform: "uppercase" }}>Incoming Video Call</p>
            <h2 style={{ color: "white", fontSize: 24, fontWeight: 700, marginBottom: 4 }}>{callPeer.name}</h2>
            {callPeer.channelname && (
              <p style={{ color: "#63b3ed", fontSize: 13, marginBottom: 28 }}>@{callPeer.channelname}</p>
            )}

            <div style={{ display: "flex", gap: 16, justifyContent: "center" }}>
              <button
                onClick={declineCall}
                style={{
                  background: "linear-gradient(135deg, #e53e3e, #c53030)",
                  color: "white", border: "none", borderRadius: "50%",
                  width: 64, height: 64, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 26, boxShadow: "0 4px 15px rgba(229,62,62,0.4)",
                  transition: "transform 0.15s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.1)")}
                onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
                title="Decline"
              >
                📵
              </button>
              <button
                onClick={acceptCall}
                style={{
                  background: "linear-gradient(135deg, #38a169, #276749)",
                  color: "white", border: "none", borderRadius: "50%",
                  width: 64, height: 64, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 26, boxShadow: "0 4px 15px rgba(56,161,105,0.4)",
                  transition: "transform 0.15s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.1)")}
                onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
                title="Accept"
              >
                📹
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Floating Action Button ─────────────────────────────────────────── */}
      <button
        id="voip-fab"
        onClick={() => setOpen((v) => !v)}
        title="Video Calls"
        style={{
          position: "fixed",
          bottom: 28,
          right: 28,
          zIndex: 9000,
          width: 58,
          height: 58,
          borderRadius: "50%",
          background: callState === "active"
            ? "linear-gradient(135deg, #38a169, #276749)"
            : "linear-gradient(135deg, #3b82f6, #6366f1)",
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 24,
          boxShadow: callState === "active"
            ? "0 0 0 4px rgba(56,161,105,0.35), 0 8px 25px rgba(0,0,0,0.3)"
            : "0 8px 25px rgba(59,130,246,0.4)",
          transition: "transform 0.2s, box-shadow 0.2s",
          animation: callState === "active" ? "voip-pulse 2s ease-in-out infinite" : "none",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.1)")}
        onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
      >
        {callState === "active" ? "🔴" : "📹"}
      </button>

      {/* ── Main Hub Panel ─────────────────────────────────────────────────── */}
      {open && (
        <div
          id="voip-hub-panel"
          style={{
            position: "fixed",
            bottom: 98,
            right: 28,
            zIndex: 9001,
            width: callState === "active" ? 520 : 360,
            maxHeight: "82vh",
            background: "linear-gradient(160deg, #0d1117 0%, #161b22 100%)",
            border: "1px solid rgba(99,179,237,0.2)",
            borderRadius: 20,
            overflow: "hidden",
            boxShadow: "0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05)",
            display: "flex",
            flexDirection: "column",
            transition: "width 0.35s ease",
          }}
        >
          {/* Header */}
          <div style={{
            padding: "16px 20px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "rgba(255,255,255,0.03)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 20 }}>📹</span>
              <span style={{ color: "white", fontWeight: 700, fontSize: 15 }}>
                YourTube Calls
              </span>
              {callState === "active" && (
                <span style={{
                  background: "rgba(56,161,105,0.2)", color: "#68d391",
                  fontSize: 10, fontWeight: 700, padding: "2px 8px",
                  borderRadius: 99, border: "1px solid rgba(56,161,105,0.4)",
                  letterSpacing: 1, textTransform: "uppercase",
                }}>
                  LIVE
                </span>
              )}
            </div>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: "none", border: "none", color: "#718096",
                cursor: "pointer", fontSize: 18, lineHeight: 1,
                transition: "color 0.15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "white")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#718096")}
            >
              ✕
            </button>
          </div>

          {/* Tab bar (only in non-active states) */}
          {callState !== "active" && (
            <div style={{
              display: "flex",
              borderBottom: "1px solid rgba(255,255,255,0.07)",
              background: "rgba(0,0,0,0.2)",
            }}>
              {(["contacts"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{
                    flex: 1, padding: "10px 0",
                    background: "none", border: "none",
                    color: tab === t ? "#63b3ed" : "#718096",
                    fontWeight: tab === t ? 700 : 400,
                    fontSize: 13, cursor: "pointer",
                    borderBottom: tab === t ? "2px solid #63b3ed" : "2px solid transparent",
                    transition: "color 0.2s",
                    textTransform: "capitalize",
                  }}
                >
                  {t === "contacts" ? "👥 Contacts" : "📞 Call"}
                </button>
              ))}
            </div>
          )}

          {/* Body */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {/* ── CONTACTS TAB ── */}
            {callState !== "active" && tab === "contacts" && (
              <div style={{ padding: "12px 0" }}>
                {/* Dialing state */}
                {callState === "dialing" && callPeer && (
                  <div style={{ padding: "24px 20px", textAlign: "center" }}>
                    <div style={{
                      width: 72, height: 72, borderRadius: "50%",
                      background: "linear-gradient(135deg, #3b82f6, #6366f1)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 32, margin: "0 auto 16px",
                      animation: "voip-pulse 1.5s ease-in-out infinite",
                      boxShadow: "0 0 0 8px rgba(59,130,246,0.15), 0 0 0 16px rgba(59,130,246,0.07)",
                    }}>
                      {callPeer.image ? (
                        <img src={callPeer.image} alt="" style={{ width: "100%", borderRadius: "50%", objectFit: "cover" }} />
                      ) : callPeer.name[0]}
                    </div>
                    <p style={{ color: "#a0aec0", fontSize: 13, marginBottom: 4, letterSpacing: 1 }}>Calling…</p>
                    <h3 style={{ color: "white", fontWeight: 700, fontSize: 20 }}>{callPeer.name}</h3>
                    <button
                      onClick={hangUp}
                      style={{
                        marginTop: 20, background: "linear-gradient(135deg, #e53e3e, #c53030)",
                        color: "white", border: "none", borderRadius: 99, padding: "10px 28px",
                        cursor: "pointer", fontWeight: 600, fontSize: 14,
                      }}
                    >
                      Cancel Call
                    </button>
                  </div>
                )}

                {/* Contacts list */}
                {callState === "idle" && (
                  <>
                    <div style={{ padding: "8px 20px 12px", color: "#718096", fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 700 }}>
                      Registered Users
                    </div>
                    {contactsLoading && (
                      <div style={{ padding: "20px", textAlign: "center", color: "#718096" }}>Loading contacts…</div>
                    )}
                    {!contactsLoading && contacts.length === 0 && (
                      <div style={{ padding: "20px", textAlign: "center", color: "#718096" }}>No other users registered yet.</div>
                    )}
                    {contacts.map((c) => {
                      const online = isOnline(c._id);
                      return (
                        <div
                          key={c._id}
                          style={{
                            display: "flex", alignItems: "center", gap: 12,
                            padding: "10px 20px", cursor: "default",
                            transition: "background 0.15s",
                          }}
                          onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.04)")}
                          onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.background = "transparent")}
                        >
                          {/* Avatar */}
                          <div style={{ position: "relative", flexShrink: 0 }}>
                            {c.image ? (
                              <img
                                src={c.image}
                                alt={c.name}
                                style={{ width: 42, height: 42, borderRadius: "50%", objectFit: "cover" }}
                              />
                            ) : (
                              <div style={{
                                width: 42, height: 42, borderRadius: "50%",
                                background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontWeight: 700, color: "white", fontSize: 18,
                              }}>
                                {c.name?.[0] || "?"}
                              </div>
                            )}
                            <div style={{
                              position: "absolute", bottom: 1, right: 1,
                              width: 11, height: 11, borderRadius: "50%",
                              background: online ? "#38a169" : "#4a5568",
                              border: "2px solid #0d1117",
                            }} />
                          </div>
                          {/* Info */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ color: "white", fontWeight: 600, fontSize: 14, marginBottom: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {c.name || c.email}
                            </p>
                            <p style={{ color: online ? "#68d391" : "#718096", fontSize: 11 }}>
                              {online ? "● Online" : "○ Offline"}
                            </p>
                          </div>
                          {/* Call button */}
                          <button
                            onClick={() => initiateCall(c)}
                            disabled={!online}
                            title={online ? `Call ${c.name}` : "User is offline"}
                            style={{
                              background: online
                                ? "linear-gradient(135deg, #3b82f6, #6366f1)"
                                : "rgba(255,255,255,0.08)",
                              color: online ? "white" : "#4a5568",
                              border: "none", borderRadius: 10, padding: "7px 14px",
                              cursor: online ? "pointer" : "not-allowed",
                              fontSize: 13, fontWeight: 600,
                              transition: "opacity 0.2s",
                              display: "flex", alignItems: "center", gap: 5,
                            }}
                          >
                            📹 Call
                          </button>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            )}

            {/* ── ACTIVE CALL UI ── */}
            {callState === "active" && (
              <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                {/* Video area */}
                <div style={{ position: "relative", background: "#000", flex: 1, minHeight: 280 }}>
                  {/* Remote video (main) */}
                  <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    style={{
                      width: "100%", height: "100%", objectFit: "cover",
                      minHeight: 280, maxHeight: 340,
                      display: "block",
                    }}
                  />
                  {/* Peer name badge */}
                  {callPeer && (
                    <div style={{
                      position: "absolute", top: 12, left: 12,
                      background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)",
                      borderRadius: 8, padding: "5px 10px",
                      color: "white", fontSize: 12, fontWeight: 600,
                    }}>
                      {callPeer.name}
                    </div>
                  )}
                  {/* Local preview (PiP) */}
                  <div style={{
                    position: "absolute", bottom: 12, right: 12,
                    width: 110, height: 82, borderRadius: 10,
                    overflow: "hidden", border: "2px solid rgba(255,255,255,0.25)",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
                    background: "#111",
                  }}>
                    <video
                      ref={localVideoRef}
                      autoPlay
                      muted
                      playsInline
                      style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }}
                    />
                    {sharingScreen && (
                      <div style={{
                        position: "absolute", top: 4, left: 4,
                        background: "rgba(239,68,68,0.85)", borderRadius: 4,
                        padding: "1px 6px", fontSize: 9, color: "white", fontWeight: 700,
                      }}>
                        SCREEN
                      </div>
                    )}
                  </div>
                  {/* Recording indicator */}
                  {recording && (
                    <div style={{
                      position: "absolute", top: 12, right: 12,
                      display: "flex", alignItems: "center", gap: 6,
                      background: "rgba(220,38,38,0.85)", borderRadius: 8,
                      padding: "5px 10px", color: "white", fontSize: 12, fontWeight: 700,
                    }}>
                      <span style={{ animation: "voip-blink 1s ease-in-out infinite" }}>⏺</span>
                      REC
                    </div>
                  )}
                </div>

                {/* Call controls */}
                <div style={{
                  padding: "14px 16px",
                  background: "rgba(0,0,0,0.3)",
                  borderTop: "1px solid rgba(255,255,255,0.07)",
                }}>
                  {/* Status row */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12, gap: 8 }}>
                    {sharingScreen && (
                      <span style={{
                        background: "rgba(239,68,68,0.2)", color: "#fc8181",
                        borderRadius: 6, padding: "3px 10px", fontSize: 11, fontWeight: 700,
                        border: "1px solid rgba(239,68,68,0.3)",
                      }}>
                        🖥 Sharing Screen
                      </span>
                    )}
                    {recording && (
                      <span style={{
                        background: "rgba(220,38,38,0.2)", color: "#fc8181",
                        borderRadius: 6, padding: "3px 10px", fontSize: 11, fontWeight: 700,
                        border: "1px solid rgba(220,38,38,0.3)",
                        animation: "voip-pulse 1.5s ease-in-out infinite",
                      }}>
                        ⏺ Recording
                      </span>
                    )}
                  </div>

                  {/* Control buttons */}
                  <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
                    {/* Mic */}
                    <ControlBtn
                      label={micOn ? "🎙" : "🔇"}
                      tooltip={micOn ? "Mute Mic" : "Unmute Mic"}
                      active={micOn}
                      onClick={toggleMic}
                    />
                    {/* Camera */}
                    <ControlBtn
                      label={camOn ? "📷" : "🚫"}
                      tooltip={camOn ? "Stop Camera" : "Start Camera"}
                      active={camOn}
                      onClick={toggleCam}
                    />
                    {/* Screen share */}
                    <ControlBtn
                      label="🖥"
                      tooltip={sharingScreen ? "Stop Sharing" : "Share Screen (YouTube)"}
                      active={sharingScreen}
                      highlight={sharingScreen}
                      onClick={toggleScreenShare}
                    />
                    {/* Record */}
                    <ControlBtn
                      label={recording ? "⏹" : "⏺"}
                      tooltip={recording ? "Stop Recording" : "Record Session"}
                      active={recording}
                      highlight={recording}
                      danger={recording}
                      onClick={recording ? stopRecording : startRecording}
                    />
                    {/* Hang up */}
                    <ControlBtn
                      label="📵"
                      tooltip="End Call"
                      active={false}
                      danger={true}
                      onClick={hangUp}
                      alwaysDanger
                    />
                  </div>

                  {/* Screen share tip */}
                  {!sharingScreen && (
                    <p style={{
                      color: "#4a5568", fontSize: 11, textAlign: "center",
                      marginTop: 10, fontStyle: "italic",
                    }}>
                      💡 Tip: Click 🖥 to share your YouTube browser tab for co-viewing
                    </p>
                  )}
                  {sharingScreen && (
                    <p style={{
                      color: "#63b3ed", fontSize: 11, textAlign: "center",
                      marginTop: 10, fontStyle: "italic",
                    }}>
                      🎬 Your screen is being shared — open YouTube for co-viewing!
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Keyframe animations injected via style tag ─────────────────────── */}
      <style>{`
        @keyframes voip-pulse {
          0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(56,161,105,0.4); }
          50% { transform: scale(1.03); box-shadow: 0 0 0 8px rgba(56,161,105,0); }
        }
        @keyframes voip-ring {
          0% { transform: scale(0.9); opacity: 1; }
          100% { transform: scale(1.4); opacity: 0; }
        }
        @keyframes voip-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        #voip-hub-panel::-webkit-scrollbar { width: 4px; }
        #voip-hub-panel::-webkit-scrollbar-track { background: transparent; }
        #voip-hub-panel::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
      `}</style>
    </>
  );
}

// ─── Small reusable control button ────────────────────────────────────────────
function ControlBtn({
  label,
  tooltip,
  active,
  highlight = false,
  danger = false,
  alwaysDanger = false,
  onClick,
}: {
  label: string;
  tooltip: string;
  active: boolean;
  highlight?: boolean;
  danger?: boolean;
  alwaysDanger?: boolean;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  const bg = alwaysDanger
    ? "linear-gradient(135deg, #e53e3e, #c53030)"
    : highlight
    ? danger
      ? "rgba(220,38,38,0.25)"
      : "rgba(99,179,237,0.25)"
    : active
    ? "rgba(255,255,255,0.1)"
    : "rgba(255,255,255,0.06)";

  return (
    <button
      onClick={onClick}
      title={tooltip}
      style={{
        width: 52, height: 52, borderRadius: 14,
        background: hover
          ? alwaysDanger
            ? "linear-gradient(135deg, #fc5c5c, #e53e3e)"
            : "rgba(255,255,255,0.15)"
          : bg,
        border: highlight && !alwaysDanger
          ? `1px solid ${danger ? "rgba(220,38,38,0.4)" : "rgba(99,179,237,0.4)"}`
          : "1px solid rgba(255,255,255,0.08)",
        color: "white", cursor: "pointer",
        fontSize: 22, display: "flex",
        alignItems: "center", justifyContent: "center",
        transition: "transform 0.15s, background 0.2s",
        transform: hover ? "translateY(-2px)" : "translateY(0)",
        boxShadow: alwaysDanger ? "0 4px 15px rgba(229,62,62,0.3)" : "none",
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {label}
    </button>
  );
}
