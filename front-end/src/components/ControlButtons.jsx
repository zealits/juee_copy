"use client";

import { Mic, MicOff, Video, VideoOff, Phone } from "lucide-react";

const ControlButtons = ({
  onMuteAudio,
  onToggleCamera,
  onEndCall,
  isAudioMuted,
  isCameraEnabled,
  isFeedSending,
  userRole,
}) => {
  // Format role for display
  const formattedRole = userRole ? userRole.charAt(0).toUpperCase() + userRole.slice(1) : "Candidate";

  // Role badge color
  const roleBadgeColor =
    userRole === "interviewer" ? "bg-blue-500/90" : userRole === "recruiter" ? "bg-purple-500/90" : "bg-green-500/90";

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-2">
        <span className={`px-3 py-1 text-sm rounded-full ${roleBadgeColor}`}>{formattedRole}</span>
      </div>
      <div className="flex items-center space-x-2">
        <button
          onClick={onMuteAudio}
          disabled={!isFeedSending}
          className={`p-3 rounded-full transition-all ${
            isAudioMuted ? "bg-red-600" : "bg-slate-700 hover:bg-slate-600"
          } ${!isFeedSending ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          {isAudioMuted ? <MicOff size={20} className="text-white" /> : <Mic size={20} className="text-white" />}
        </button>

        <button
          onClick={onToggleCamera}
          disabled={!isFeedSending}
          className={`p-3 rounded-full transition-all ${
            !isCameraEnabled ? "bg-red-600" : "bg-slate-700 hover:bg-slate-600"
          } ${!isFeedSending ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          {!isCameraEnabled ? (
            <VideoOff size={20} className="text-white" />
          ) : (
            <Video size={20} className="text-white" />
          )}
        </button>

        <button onClick={onEndCall} className="bg-red-600 hover:bg-red-700 p-3 rounded-full transition-all">
          <Phone size={20} className="text-white rotate-225 transform" />
        </button>
      </div>
      <div className="w-[70px]"></div> {/* Empty div for balance */}
    </div>
  );
};

export default ControlButtons;
