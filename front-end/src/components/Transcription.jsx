import { useEffect, useState, useRef } from "react";
import marked from "marked";
import config from "../config/config";

const InterviewAssistant = ({ localStream }) => {
  const [transcript, setTranscript] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState("");
  const [previousAnalysis, setPreviousAnalysis] = useState("");
  const [nextQuestion, setNextQuestion] = useState("");
  const [expectedAnswer, setExpectedAnswer] = useState("");
  const pythonSocketRef = useRef(null);
  const transcriptContainerRef = useRef(null);

  // Configuration for message merging
  const MESSAGE_MERGE_WINDOW_MS = 30000; // 30 seconds

  const resetInterview = async () => {
    try {
      // in development, we will use the backend at http://localhost:8004 as this python backend is running on port 8004
      // in production, we will use the backend at htpps://meetings.aiiventure.com
      const response = await fetch("http://localhost:8004/api/python/reset", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });
      const data = await response.json();
      console.log("Reset response:", data);
      setTranscript("");
      setPreviousAnalysis("");
      setNextQuestion("");
      setExpectedAnswer("");
      setCurrentQuestion("");
    } catch (error) {
      console.error("Error resetting interview:", error);
    }
  };

  const analyzeResponse = async () => {
    if (!transcript.trim()) return;

    setIsAnalyzing(true);
    try {
      // in development, we will use the backend at http://localhost:8004 as this python backend is running on port 8004
      // in production, we will use the backend at htpps://meetings.aiiventure.com
      const response = await fetch("http://localhost:8004/api/python/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: transcript }),
      });

      const data = await response.json();
      if (data.error) {
        console.error("Analysis error:", data.error);
        return;
      }

      // Update state with analysis results
      setPreviousAnalysis(data.previous_analysis);
      setNextQuestion(data.next_question);
      setExpectedAnswer(data.expected_answer);

      // Set the current question to the next question for the next round
      setCurrentQuestion(data.next_question.split("\n")[0].replace("- ", "").trim());

      // Clear the transcript for the next question
      setTranscript("");
    } catch (error) {
      console.error("Error analyzing response:", error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const sendTranscription = async (text, sender) => {
    try {
      const response = await fetch(`${config.nodeApiUrl}/api/transcription`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          transcript: text,
          sender: sender,
          timestamp: new Date().toISOString(),
        }),
      });
      const data = await response.json();
      // ... handle response ...
    } catch (error) {
      console.error("Error sending transcription:", error);
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

    // Connect to Python backend
    pythonSocketRef.current = new WebSocket(`${config.pythonApiUrl.replace("http", "ws")}/ws/transcription`);

    pythonSocketRef.current.onopen = () => {
      console.log("Connected to Python backend");
    };

    pythonSocketRef.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "transcription") {
        // Just display the transcription, no automatic analysis
        console.log("Received transcription:", data.data.transcript);
      }
    };

    pythonSocketRef.current.onerror = (error) => {
      console.error("Python WebSocket error:", error);
    };

    deepgramSocket.onopen = () => {
      setIsConnected(true);
      console.log("Connected to Deepgram");

      mediaRecorder.addEventListener("dataavailable", async (event) => {
        if (event.data.size > 0 && deepgramSocket.readyState === 1) {
          deepgramSocket.send(event.data);
        }
      });

      try {
        mediaRecorder.start(1000);
        console.log("MediaRecorder started successfully");
      } catch (error) {
        console.error("Error starting MediaRecorder:", error);
      }
    };

    deepgramSocket.onmessage = (message) => {
      try {
        const received = JSON.parse(message.data);
        const newTranscript = received.channel.alternatives[0].transcript;
        if (newTranscript && received.is_final) {
          setTranscript((prev) => {
            const updatedTranscript = prev + " " + newTranscript;
            // Send to Python backend
            if (pythonSocketRef.current?.readyState === 1) {
              pythonSocketRef.current.send(
                JSON.stringify({
                  transcript: newTranscript,
                  timestamp: new Date().toISOString(),
                })
              );
            }
            return updatedTranscript;
          });
        }
      } catch (error) {
        console.error("Error processing transcript:", error);
      }
    };

    deepgramSocket.onclose = () => {
      setIsConnected(false);
      console.log("Disconnected from Deepgram");
    };

    deepgramSocket.onerror = (error) => {
      console.error("Deepgram WebSocket error:", error);
    };

    return () => {
      if (mediaRecorder.state !== "inactive") {
        try {
          mediaRecorder.stop();
        } catch (error) {
          console.error("Error stopping MediaRecorder:", error);
        }
      }
      if (deepgramSocket.readyState === 1) {
        deepgramSocket.close();
      }
      if (pythonSocketRef.current?.readyState === 1) {
        pythonSocketRef.current.close();
      }
    };
  }, [localStream]);

  // Helper function to group consecutive messages from the same speaker
  const groupConsecutiveMessages = (transcriptions) => {
    if (!transcriptions || transcriptions.length === 0) return [];

    // First sort by timestamp to ensure chronological order
    const sortedMessages = [...transcriptions].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    const groupedMessages = [];
    let currentGroup = null;

    for (const message of sortedMessages) {
      // If this is the first message or sent by a different speaker, start a new group
      if (!currentGroup || currentGroup.sender !== message.sender || currentGroup.senderName !== message.senderName) {
        // Add the previous group to our results if it exists
        if (currentGroup) {
          groupedMessages.push(currentGroup);
        }

        // Start a new group with this message
        currentGroup = {
          ...message,
          originalMessages: [{ ...message }],
        };
      } else {
        // Same speaker, merge with the current group
        // Check if messages are within the configured time window
        const timeDiff = Math.abs(new Date(message.timestamp) - new Date(currentGroup.timestamp));

        // Only merge if messages are within the configured time window
        if (timeDiff <= MESSAGE_MERGE_WINDOW_MS) {
          // Append the transcript with a line break
          currentGroup.transcript += "\n" + message.transcript;

          // Update the timestamp to the latest message
          currentGroup.timestamp = message.timestamp;

          // Keep track of original messages for reference
          currentGroup.originalMessages.push({ ...message });
        } else {
          // Time difference is too large, start a new group
          groupedMessages.push(currentGroup);
          currentGroup = {
            ...message,
            originalMessages: [{ ...message }],
          };
        }
      }
    }

    // Don't forget to add the last group
    if (currentGroup) {
      groupedMessages.push(currentGroup);
    }

    return groupedMessages;
  };

  useEffect(() => {
    // Fetch all transcriptions periodically
    const fetchTranscriptions = async () => {
      try {
        const response = await fetch(`${config.nodeApiUrl}/api/transcriptions/all`);
        const data = await response.json();

        if (data && data.length > 0) {
          // Group consecutive messages from the same speaker
          const groupedData = groupConsecutiveMessages(data);

          // Format transcriptions with proper speaker identification and role information
          const formattedTranscript = groupedData
            .map((item) => {
              // Enhanced speaker name identification with fallbacks
              const senderRole = item.sender || "unknown";
              const speakerName =
                item.senderName ||
                (senderRole === "candidate"
                  ? "Candidate"
                  : senderRole === "interviewer"
                  ? "Interviewer"
                  : senderRole === "recruiter"
                  ? "Recruiter"
                  : "Unknown");

              // Format timestamp
              const timestamp = new Date(item.timestamp).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              });

              // Format the message differently if it's a merged message
              let messageText = item.transcript;
              if (item.originalMessages && item.originalMessages.length > 1) {
                messageText = item.transcript.replace(/\n/g, "\n  "); // Indent continued lines
                messageText += `\n  (${item.originalMessages.length} messages merged)`;
              }

              // Return formatted line with role and timestamp
              return `[${timestamp}] ${speakerName} (${senderRole}):\n  ${messageText}`;
            })
            .join("\n\n");

          setTranscript(formattedTranscript);
        }
      } catch (error) {
        console.error("Error fetching transcriptions:", error);
      }
    };

    // Fetch initially and set up interval
    fetchTranscriptions();
    const intervalId = setInterval(fetchTranscriptions, 5000); // every 5 seconds

    return () => clearInterval(intervalId);
  }, []);

  // Auto-scroll the transcript container
  useEffect(() => {
    if (transcriptContainerRef.current) {
      transcriptContainerRef.current.scrollTop = transcriptContainerRef.current.scrollHeight;
    }
  }, [transcript]);

  return (
    <div className="fixed bottom-4 right-4 left-4 max-h-[80vh] z-10 bg-slate-800/95 backdrop-blur-sm rounded-xl p-4 shadow-xl border border-slate-700 flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-medium text-white">Interview Assistant</h3>
        <div className="flex items-center space-x-2">
          <span className={`w-2 h-2 rounded-full ${isConnected ? "bg-emerald-500" : "bg-red-500"}`} />
          <span className="text-xs text-slate-300">{isConnected ? "Connected" : "Disconnected"}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 h-full overflow-hidden">
        {/* Left column: Current Question and Transcript */}
        <div className="flex flex-col space-y-4 h-full">
          <div className="bg-slate-700/50 rounded-lg p-3 flex-shrink-0">
            <h4 className="text-sm font-medium text-slate-300 mb-2">Current Question</h4>
            <p className="text-base text-white">
              {currentQuestion || "No question yet. Start the interview by analyzing."}
            </p>
          </div>

          <div className="flex flex-col flex-grow bg-slate-700/50 rounded-lg p-3 overflow-hidden">
            <h4 className="text-sm font-medium text-slate-300 mb-2">Candidate's Response</h4>
            <div
              ref={transcriptContainerRef}
              className="flex-grow overflow-y-auto text-base text-white whitespace-pre-wrap"
            >
              {transcript || "No transcription yet..."}
            </div>
          </div>

          <div className="flex justify-between space-x-2">
            <button
              onClick={resetInterview}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors w-1/3"
            >
              Reset
            </button>
            <button
              onClick={analyzeResponse}
              disabled={isAnalyzing || !transcript.trim()}
              className={`px-4 py-2 ${
                isAnalyzing || !transcript.trim()
                  ? "bg-emerald-700/50 cursor-not-allowed"
                  : "bg-emerald-600 hover:bg-emerald-700"
              } text-white rounded-lg font-medium transition-colors w-2/3`}
            >
              {isAnalyzing ? "Analyzing..." : "Analyze Response"}
            </button>
          </div>
        </div>

        {/* Right column: Analysis, Next Question, Expected Answer */}
        <div className="flex flex-col space-y-4 h-full overflow-y-auto">
          {previousAnalysis && (
            <div className="bg-slate-700/50 rounded-lg p-3">
              <h4 className="text-sm font-medium text-slate-300 mb-2">Analysis of Previous Answer</h4>
              <div
                className="prose prose-invert prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: marked(previousAnalysis) }}
              />
            </div>
          )}

          {nextQuestion && (
            <div className="bg-slate-700/50 rounded-lg p-3">
              <h4 className="text-sm font-medium text-slate-300 mb-2">Next Question</h4>
              <div
                className="prose prose-invert prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: marked(nextQuestion) }}
              />
            </div>
          )}

          {expectedAnswer && (
            <div className="bg-slate-700/50 rounded-lg p-3">
              <h4 className="text-sm font-medium text-slate-300 mb-2">Expected Answer</h4>
              <div
                className="prose prose-invert prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: marked(expectedAnswer) }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default InterviewAssistant;
