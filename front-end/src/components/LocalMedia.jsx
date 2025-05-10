"use client";

import { useEffect, useRef } from "react";
import FaceExpressionAnalyzer from "./FaceExpressionAnalyzer";
import { CameraOff } from "lucide-react";

const LocalMedia = ({ localStream, isCameraEnabled = true, userRole = "candidate" }) => {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && localStream) {
      videoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Format role for display
  const formattedRole = userRole ? userRole.charAt(0).toUpperCase() + userRole.slice(1) : "Candidate";

  // Role badge color
  const roleBadgeColor =
    userRole === "interviewer" ? "bg-blue-500/80" : userRole === "recruiter" ? "bg-purple-500/80" : "bg-green-500/80";

  if (!localStream) return null;

  return (
    <div className="relative w-[240px] h-[180px] rounded-xl overflow-hidden">
      <div className={`relative h-full ${!isCameraEnabled ? "bg-slate-800" : ""}`}>
        <video
          ref={videoRef}
          className={`w-full h-full object-cover ${!isCameraEnabled ? "invisible" : ""}`}
          muted
          autoPlay
          playsInline
        />

        {!isCameraEnabled && (
          <div className="absolute inset-0 flex items-center justify-center">
            <CameraOff size={32} className="text-slate-500" />
          </div>
        )}

        {isCameraEnabled && <FaceExpressionAnalyzer videoRef={videoRef} isActive={!!localStream} />}

        <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-sm text-white px-2 py-1 text-xs rounded-lg flex items-center space-x-1">
          <span>You</span>
          <span className="text-slate-400 mx-1">|</span>
          <span className={`text-xs px-1.5 py-0.5 rounded ${roleBadgeColor}`}>{formattedRole}</span>
        </div>
      </div>
    </div>
  );
};

export default LocalMedia;
