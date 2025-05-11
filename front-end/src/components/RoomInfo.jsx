"use client";

import { useState, useRef, useEffect } from "react";
import { Video, Users, Camera, CameraOff, Mic, MicOff } from "lucide-react";

const RoomInfo = ({ onJoinRoom }) => {
  const [roomName, setRoomName] = useState("");
  const [userName, setUserName] = useState("user");
  const [isCameraEnabled, setIsCameraEnabled] = useState(true);
  const [isMicEnabled, setIsMicEnabled] = useState(true);
  const [localStream, setLocalStream] = useState(null);
  const [userRole, setUserRole] = useState("candidate");
  const videoPreviewRef = useRef(null);

  // Request camera and microphone access on component mount
  useEffect(() => {
    const getMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });

        setLocalStream(stream);

        if (videoPreviewRef.current) {
          videoPreviewRef.current.srcObject = stream;
        }
      } catch (error) {
        console.error("Error accessing media devices:", error);
        // If error, disable the corresponding toggles
        if (error.name === "NotAllowedError") {
          setIsCameraEnabled(false);
          setIsMicEnabled(false);
        }
      }
    };

    getMedia();

    return () => {
      // Cleanup stream when component unmounts
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Handle toggling camera
  const toggleCamera = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !isCameraEnabled;
        setIsCameraEnabled(!isCameraEnabled);
      }
    }
  };

  // Handle toggling microphone
  const toggleMic = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !isMicEnabled;
        setIsMicEnabled(!isMicEnabled);
      }
    }
  };

  const handleJoin = () => {
    if (roomName.trim()) {
      onJoinRoom(roomName, userName, { isCameraEnabled, isMicEnabled, localStream, userRole });
    }
  };

  return (
    <div className="w-full max-w-md">
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl shadow-xl border border-slate-700 p-8">
        <div className="flex justify-center mb-6">
          <div className="h-20 w-20 rounded-full bg-gradient-to-br from-blue-500 to-teal-400 flex items-center justify-center">
            <Video size={40} className="text-white" />
          </div>
        </div>

        <h2 className="text-2xl font-bold text-center mb-6">Join Interview</h2>

        {/* Video preview */}
        <div className="relative overflow-hidden rounded-lg mb-6 bg-black aspect-video">
          <video
            ref={videoPreviewRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover ${!isCameraEnabled ? "invisible" : ""}`}
          />

          {!isCameraEnabled && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-800">
              <CameraOff size={48} className="text-slate-500" />
            </div>
          )}

          <div className="absolute bottom-3 left-1/2 transform -translate-x-1/2 flex space-x-2">
            <button
              onClick={toggleCamera}
              className={`p-3 rounded-full transition-all ${isCameraEnabled ? "bg-slate-700" : "bg-red-500"}`}
            >
              {isCameraEnabled ? (
                <Camera size={20} className="text-white" />
              ) : (
                <CameraOff size={20} className="text-white" />
              )}
            </button>

            <button
              onClick={toggleMic}
              className={`p-3 rounded-full transition-all ${isMicEnabled ? "bg-slate-700" : "bg-red-500"}`}
            >
              {isMicEnabled ? <Mic size={20} className="text-white" /> : <MicOff size={20} className="text-white" />}
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="room-input" className="block text-sm font-medium text-slate-300">
              Room Name
            </label>
            <div className="relative">
              <input
                id="room-input"
                placeholder="Enter room name"
                type="text"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder-slate-400"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="username" className="block text-sm font-medium text-slate-300">
              Your Name
            </label>
            <div className="relative">
              <input
                id="username"
                value={userName}
                type="text"
                onChange={(e) => setUserName(e.target.value)}
                className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder-slate-400 pl-10"
              />
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <Users size={18} className="text-slate-400" />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="user-role" className="block text-sm font-medium text-slate-300">
              Your Role
            </label>
            <div className="relative">
              <select
                id="user-role"
                value={userRole}
                onChange={(e) => setUserRole(e.target.value)}
                className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white appearance-none"
              >
                <option value="candidate">Candidate</option>
                <option value="interviewer">Interviewer</option>
                <option value="recruiter">Recruiter</option>
              </select>
              <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none">
                <svg
                  className="h-5 w-5 text-slate-400"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
            </div>
          </div>

          <button
            onClick={handleJoin}
            className="w-full mt-6 px-4 py-3 bg-gradient-to-r from-blue-500 to-teal-400 text-white rounded-lg font-medium hover:from-blue-600 hover:to-teal-500 transition-all shadow-lg hover:shadow-blue-500/25 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-800"
          >
            Join Meeting
          </button>
        </div>
      </div>
    </div>
  );
};

export default RoomInfo;
