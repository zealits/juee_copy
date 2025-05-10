"use client";

import { useEffect, useRef } from "react";
import { User } from "lucide-react";
import FaceExpressionAnalyzer from "./FaceExpressionAnalyzer";

const VideoContainer = ({ stream, username, userRole, isMainSpeaker = false }) => {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  // Format role for display
  const formattedRole = userRole ? userRole.charAt(0).toUpperCase() + userRole.slice(1) : "";

  return (
    <div className={`relative ${isMainSpeaker ? "w-full h-[450px] mx-auto" : "w-full h-24 md:h-32"}`}>
      {stream ? (
        <>
          <video
            ref={videoRef}
            className="w-full h-full object-cover rounded-xl bg-slate-700"
            autoPlay
            playsInline
            controls
          />
          <FaceExpressionAnalyzer videoRef={videoRef} isActive={!!stream} />
        </>
      ) : (
        <div className="w-full h-full rounded-xl bg-slate-700/50 flex items-center justify-center">
          <User size={isMainSpeaker ? 64 : 32} className="text-slate-500" />
        </div>
      )}

      {username && (
        <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-sm text-white px-3 py-1.5 text-sm rounded-lg flex items-center space-x-1">
          <span>{username}</span>
          {formattedRole && (
            <>
              <span className="text-slate-400 mx-1">|</span>
              <span
                className={`text-xs px-1.5 py-0.5 rounded ${
                  userRole === "interviewer"
                    ? "bg-blue-500/80"
                    : userRole === "recruiter"
                    ? "bg-purple-500/80"
                    : "bg-green-500/80"
                }`}
              >
                {formattedRole}
              </span>
            </>
          )}
        </div>
      )}

      {isMainSpeaker && stream && (
        <div className="absolute top-3 left-3 bg-emerald-500/80 backdrop-blur-sm text-white px-2 py-1 text-xs rounded-lg">
          Active Speaker
        </div>
      )}
    </div>
  );
};

const RemoteMedia = ({ consumers, activeSpeakers }) => {
  // Filter out current user's producer from active speakers
  const filteredSpeakers = activeSpeakers || [];
  const mainSpeaker = filteredSpeakers[0];
  const otherSpeakers = filteredSpeakers.slice(1, 5);

  return (
    <div className="space-y-4">
      {/* Current Speaker Video (Large Center Video) */}
      {mainSpeaker && consumers[mainSpeaker] ? (
        <div className="overflow-hidden rounded-xl shadow-xl border border-slate-700">
          <VideoContainer
            stream={consumers[mainSpeaker]?.combinedStream}
            username={consumers[mainSpeaker]?.userName}
            userRole={consumers[mainSpeaker]?.userRole}
            isMainSpeaker={true}
          />
        </div>
      ) : (
        <div className="w-full h-[450px] rounded-xl bg-slate-800/50 border border-slate-700 flex items-center justify-center">
          <div className="text-center">
            <User size={80} className="mx-auto text-slate-600 mb-4" />
            <p className="text-slate-400">No active speaker</p>
          </div>
        </div>
      )}

      {/* Small videos at top (non-dominant speakers) */}
      {otherSpeakers.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {otherSpeakers.map((speakerId, index) => (
            <div
              key={speakerId || `empty-${index}`}
              className="overflow-hidden rounded-xl shadow-lg border border-slate-700"
            >
              <VideoContainer
                stream={consumers[speakerId]?.combinedStream}
                username={consumers[speakerId]?.userName}
                userRole={consumers[speakerId]?.userRole}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default RemoteMedia;
