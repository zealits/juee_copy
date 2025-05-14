import { useEffect, useState, useRef } from "react";
import config from "../config/config";

const CandidateTranscription = ({ localStream, userName, socket, userRole }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [lastTranscript, setLastTranscript] = useState("");
  const lastTranscriptTimestamp = useRef(0);

  // Function to send transcription via HTTP POST
  const sendTranscription = async (transcript) => {
    try {
      // Skip if this is the same as the last transcript or if socket is not connected
      if (transcript === lastTranscript || !socket) {
        return false;
      }

      // Prevent rapid duplicate submissions by checking time since last submission
      const now = Date.now();
      if (now - lastTranscriptTimestamp.current < 1000) {
        return false;
      }

      // Update tracking variables
      setLastTranscript(transcript);
      lastTranscriptTimestamp.current = now;

      const timestamp = new Date().toISOString();

      const response = await fetch(`${config.nodeApiUrl}/api/transcription`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          transcript: transcript,
          timestamp,
          sender: userRole || "candidate",
          senderName: userName || "Candidate",
          socketId: socket?.id || null,
        }),
      });

      const data = await response.json();
      console.log("[Candidate] Transcription sent to backend:", data);
      return true;
    } catch (error) {
      console.error("[Candidate] Error sending transcription:", error);
      return false;
    }
  };

  useEffect(() => {
    if (!localStream) return;

    // Get the audio track from the stream
    const audioTrack = localStream.getAudioTracks()[0];
    if (!audioTrack) {
      console.error("No audio track found in stream");
      return;
    }

    // Create a new stream with just the audio track
    const audioStream = new MediaStream([audioTrack]);

    // Check for supported MIME types
    const mimeType = MediaRecorder.isTypeSupported("audio/webm")
      ? "audio/webm"
      : MediaRecorder.isTypeSupported("audio/mp4")
      ? "audio/mp4"
      : null;

    if (!mimeType) {
      console.error("No supported audio MIME type found");
      return;
    }

    const mediaRecorder = new MediaRecorder(audioStream, {
      mimeType,
      audioBitsPerSecond: 128000,
    });

    // Connect to Deepgram
    const deepgramSocket = new WebSocket(
      "wss://api.deepgram.com/v1/listen?model=nova-3&punctuate=true&utterances=true",
      ["token", "1f3fc83e4559e5e5db749b92a75fbd0d66813d3e"]
    );

    deepgramSocket.onopen = () => {
      setIsConnected(true);
      console.log("[Candidate] Connected to Deepgram");

      mediaRecorder.addEventListener("dataavailable", async (event) => {
        if (event.data.size > 0 && deepgramSocket.readyState === 1) {
          deepgramSocket.send(event.data);
        }
      });

      try {
        mediaRecorder.start(1000);
        console.log("[Candidate] MediaRecorder started successfully");
      } catch (error) {
        console.error("[Candidate] Error starting MediaRecorder:", error);
      }
    };

    deepgramSocket.onmessage = (message) => {
      try {
        const received = JSON.parse(message.data);
        // Check if the received data has the expected structure
        if (received && received.channel && received.channel.alternatives && received.channel.alternatives.length > 0) {
          const newTranscript = received.channel.alternatives[0].transcript;

          if (newTranscript && received.is_final) {
            // Log the transcript to the frontend console in all cases
            console.log("[Candidate Transcript]:", newTranscript);

            // Send to backend using HTTP POST
            sendTranscription(newTranscript);
          }
        } else {
          console.log("[Candidate] Received unexpected Deepgram data format:", received);
        }
      } catch (error) {
        console.error("[Candidate] Error processing transcript:", error);
      }
    };

    deepgramSocket.onclose = () => {
      setIsConnected(false);
      console.log("[Candidate] Disconnected from Deepgram");
    };

    deepgramSocket.onerror = (error) => {
      console.error("[Candidate] Deepgram WebSocket error:", error);
    };

    return () => {
      if (mediaRecorder.state !== "inactive") {
        try {
          mediaRecorder.stop();
        } catch (error) {
          console.error("[Candidate] Error stopping MediaRecorder:", error);
        }
      }
      if (deepgramSocket.readyState === 1) {
        deepgramSocket.close();
      }
    };
  }, [localStream]);

  // This component doesn't render anything visible - it just handles the transcription
  return null;
};

export default CandidateTranscription;
