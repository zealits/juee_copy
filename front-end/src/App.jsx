"use client";

import { useState, useEffect } from "react";
import RoomInfo from "./components/RoomInfo";
import ControlButtons from "./components/ControlButtons";
import RemoteMedia from "./components/RemoteMedia";
import LocalMedia from "./components/LocalMedia";
import InterviewAssistant from "./components/InterviewAssistant";
import NotificationSystem from "./components/NotificationSystem";
import useMediaSoup from "./hooks/useMediaSoup";
import { loadModels } from "./utils/faceApiUtils";
import CandidateTranscription from "./components/CandidateTranscription";

function App() {
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [modelLoadError, setModelLoadError] = useState(false);

  const {
    joinRoom,
    muteAudio,
    toggleCamera,
    endCall,
    clearNotification,
    isJoined,
    isFeedSending,
    isAudioMuted,
    isCameraEnabled,
    localStream,
    consumers,
    activeSpeakers,
    notifications,
    userRole,
  } = useMediaSoup();

  // Load face-api.js models on component mount
  useEffect(() => {
    const initFaceApi = async () => {
      try {
        const loaded = await loadModels();
        setModelsLoaded(loaded);
        if (!loaded) {
          setModelLoadError(true);
        }
      } catch (error) {
        console.error("Error initializing face-api:", error);
        setModelLoadError(true);
      }
    };

    initFaceApi();
  }, []);

  // Determine if the user should see the interview assistant
  const showInterviewAssistant = userRole === "interviewer" || userRole === "recruiter";

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 text-white">
      {/* Notification system is always visible */}
      <NotificationSystem notifications={notifications} clearNotification={clearNotification} />

      {!isJoined ? (
        <div className="container mx-auto px-4 py-8">
          <header className="mb-8">
            <h1 className="text-3xl font-bold text-center bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-teal-400">
              Technical Interview Assistant
            </h1>

            {modelLoadError && (
              <div className="mt-2 text-center text-red-400 text-sm">
                Failed to load facial recognition models. Emotion detection may not work.
              </div>
            )}
          </header>

          <div className="flex justify-center items-center min-h-[70vh]">
            <RoomInfo onJoinRoom={joinRoom} />
          </div>

          <footer className="mt-8 text-center text-sm text-slate-400">
            <p>Powered by MediaSoup, React & Groq LLM</p>
          </footer>
        </div>
      ) : (
        <div className="h-screen flex flex-col">
          {/* Top control bar */}
          <div className="bg-slate-900 p-3 border-b border-slate-700">
            <ControlButtons
              onMuteAudio={muteAudio}
              onToggleCamera={toggleCamera}
              onEndCall={endCall}
              isAudioMuted={isAudioMuted}
              isCameraEnabled={isCameraEnabled}
              isFeedSending={isFeedSending}
              userRole={userRole}
            />
          </div>

          {/* Main content area - split layout depends on user role */}
          <div className="flex-1 flex overflow-hidden">
            {/* Video area - takes full width for candidates, half for others */}
            <div className={`flex flex-col bg-slate-900 overflow-auto ${showInterviewAssistant ? "flex-1" : "w-full"}`}>
              <div className="flex-1 p-4">
                <RemoteMedia
                  consumers={consumers}
                  activeSpeakers={activeSpeakers}
                  localStream={localStream}
                  localUserInfo={{
                    userName:  "You",
                    userRole: userRole,
                  }}
                />
              </div>

              {/* <div className="p-4 border-t border-slate-700">
                <LocalMedia localStream={localStream} isCameraEnabled={isCameraEnabled} userRole={userRole} />
              </div> */}
            </div>

            {/* Assistant area - only shown for interviewers and recruiters */}
            {localStream && showInterviewAssistant && (
              <div className="w-1/2 flex flex-col overflow-hidden">
                <InterviewAssistant localStream={localStream} />
              </div>
            )}

            {/* Hidden transcription for candidates - only logs to console */}
            {localStream && userRole === "candidate" && <CandidateTranscription localStream={localStream} />}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
