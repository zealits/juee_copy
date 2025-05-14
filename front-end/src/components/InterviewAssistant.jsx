import { useEffect, useState, useRef } from "react";
import ReactMarkdown from "react-markdown";
import config from "../config/config";

const InterviewAssistant = ({ localStream, userName, socket, userRole }) => {
  const [transcript, setTranscript] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState("");
  const [previousAnalysis, setPreviousAnalysis] = useState("");
  const [nextQuestion, setNextQuestion] = useState("");
  const [expectedAnswer, setExpectedAnswer] = useState("");
  const [allTranscriptions, setAllTranscriptions] = useState([]);
  const transcriptContainerRef = useRef(null);
  const pollingIntervalRef = useRef(null);
  const [lastTranscript, setLastTranscript] = useState("");
  const lastTranscriptTimestamp = useRef(0);
  const [connectedUsers, setConnectedUsers] = useState({});

  // Configuration for message merging
  const MESSAGE_MERGE_WINDOW_MS = 30000; // 30 seconds

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
          sender: userRole || "interviewer", // Use actual role from props
          senderName: userName || "Interviewer",
          socketId: socket?.id || null,
        }),
      });

      const data = await response.json();
      console.log("[Interviewer] Transcription sent to backend:", data);
      return true;
    } catch (error) {
      console.error("[Interviewer] Error sending transcription:", error);
      return false;
    }
  };

  // Function to fetch transcriptions
  const fetchTranscriptions = async () => {
    try {
      // Fetch all transcriptions in chronological order
      const response = await fetch(`${config.nodeApiUrl}/api/transcriptions/all`);
      const data = await response.json();

      // Group messages from the same speaker
      const groupedTranscriptions = groupConsecutiveMessages(data);

      // Update the transcriptions state
      setAllTranscriptions(groupedTranscriptions);
    } catch (error) {
      console.error("[Interviewer] Error fetching transcriptions:", error);
    }
  };

  // Helper function to group consecutive messages from the same speaker
  const groupConsecutiveMessages = (transcriptions) => {
    if (!transcriptions || transcriptions.length === 0) return [];

    // First sort by timestamp to ensure chronological order
    const sortedMessages = [...transcriptions].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    const groupedMessages = [];
    let currentGroup = null;

    for (const message of sortedMessages) {
      // If this is the first message or sent by a different speaker, start a new group
      if (!currentGroup || currentGroup.socketId !== message.socketId || currentGroup.sender !== message.sender) {
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

  const resetInterview = async () => {
    try {
      // Clear local transcripts
      setTranscript("");
      setAllTranscriptions([]);
      setPreviousAnalysis("");
      setNextQuestion("");
      setExpectedAnswer("");
      setCurrentQuestion("");

      // Clear backend transcripts
      await fetch(`${config.nodeApiUrl}/api/transcriptions/clear`, {
        method: "POST",
      });

      // Reset on Python backend
      try {
        const response = await fetch(`${config.pythonApiUrl}/reset`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        });
        const data = await response.json();
        console.log("Reset response from Python backend:", data);
      } catch (error) {
        console.error("Error resetting interview on Python backend:", error);
      }
    } catch (error) {
      console.error("Error resetting interview:", error);
    }
  };

  // Extract sections from markdown text
  const extractSections = (markdownText) => {
    console.log("Raw markdown text to parse:", markdownText);

    // Defensive check
    if (!markdownText || typeof markdownText !== "string") {
      console.error("Invalid markdown text:", markdownText);
      return {};
    }

    const sections = {};
    let currentSection = null;
    let currentContent = [];

    // Split by lines and process
    const lines = markdownText.split("\n");

    // Debug output all lines
    console.log("Lines to process:", lines);

    for (const line of lines) {
      // Check for ## Section headers - case insensitive and allowing for whitespace
      if (line.trim().match(/^##\s+(.+)$/i)) {
        // Extract section name (removing ## and trimming)
        const sectionName = line
          .trim()
          .replace(/^##\s+/i, "")
          .trim();
        console.log("Found section:", sectionName);

        // Save previous section if exists
        if (currentSection && currentContent.length > 0) {
          sections[currentSection.toLowerCase().replace(/\s+/g, "_")] = currentContent.join("\n");
          currentContent = [];
        }

        // Start new section
        currentSection = sectionName;
      } else if (currentSection) {
        currentContent.push(line);
      }
    }

    // Add the last section
    if (currentSection && currentContent.length > 0) {
      sections[currentSection.toLowerCase().replace(/\s+/g, "_")] = currentContent.join("\n");
    }

    // Debug log all extracted sections and their content
    console.log("Extracted section keys:", Object.keys(sections));
    Object.entries(sections).forEach(([key, value]) => {
      console.log(`Section [${key}] content (${value.length} chars):`, value.substring(0, 100) + "...");
    });

    // Default empty sections if missing
    const finalSections = {
      analysis: sections.analysis || "",
      evaluation: sections.evaluation || "",
      follow_up_questions: sections.follow_up_questions || "",
    };

    console.log("Final sections object:", finalSections);
    return finalSections;
  };

  const analyzeResponse = async () => {
    // Combine interviewer and candidate transcripts for analysis
    const combinedTranscript =
      transcript +
      " " +
      allTranscriptions
        .filter((t) => t.sender === "candidate")
        .map((t) => t.transcript)
        .join(" ");

    if (!combinedTranscript.trim()) return;

    setIsAnalyzing(true);
    try {
      console.log("Sending for analysis:", combinedTranscript);

      const response = await fetch(`${config.pythonApiUrl}/analyze`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: combinedTranscript,
        }),
      });

      const data = await response.json();
      console.log("Analysis response:", data);

      if (data.error) {
        console.error("Analysis error:", data.error);
        return;
      }

      // Extract the markdown analysis from the response
      const analysisText = data.analysis || "";
      console.log("Analysis text:", analysisText);

      // Manually check for the sections without using the extraction function
      // This is a direct approach that should work regardless of formatting
      const analysisMatch = analysisText.match(/## Analysis\s+([\s\S]*?)(?=## |$)/i);
      const evaluationMatch = analysisText.match(/## Evaluation\s+([\s\S]*?)(?=## |$)/i);
      const followUpMatch = analysisText.match(/## Follow-up Questions\s+([\s\S]*?)(?=## |$)/i);

      console.log("Direct section matches:", {
        analysisMatch: analysisMatch ? "found" : "not found",
        evaluationMatch: evaluationMatch ? "found" : "not found",
        followUpMatch: followUpMatch ? "found" : "not found",
      });

      // Get the content from each matched section
      const analysisContent = analysisMatch ? analysisMatch[1].trim() : "";
      const evaluationContent = evaluationMatch ? evaluationMatch[1].trim() : "";
      const followUpContent = followUpMatch ? followUpMatch[1].trim() : "";

      console.log("Extracted content lengths:", {
        analysis: analysisContent.length,
        evaluation: evaluationContent.length,
        followUp: followUpContent.length,
      });

      // Set state with the extracted content
      setPreviousAnalysis(analysisContent);
      setExpectedAnswer(evaluationContent);
      setNextQuestion(followUpContent);

      console.log("STATE SET with extracted content:", {
        analysis: analysisContent.substring(0, 50) + "...",
        evaluation: evaluationContent.substring(0, 50) + "...",
        followUp: followUpContent.substring(0, 50) + "...",
      });

      // Set the current question to the first question from follow-up questions
      if (followUpContent) {
        // Split by bullet points and get the first question
        const questions = followUpContent
          .split("\n")
          .filter((line) => line.trim().startsWith("-") || line.trim().startsWith("*"));

        console.log("Extracted questions:", questions);

        if (questions.length > 0) {
          // Remove bullet point and any extra whitespace
          const firstQuestion = questions[0].replace(/^[-*]\s*/, "").trim();
          console.log("Setting current question:", firstQuestion);
          setCurrentQuestion(firstQuestion);
        }
      }

      // Re-enable transcript clearing
      // Clear only the transcripts, keep the analysis results
      setTranscript("");
      setAllTranscriptions([]);

      // Clear backend transcripts
      try {
        await fetch(`${config.pythonApiUrl}/transcriptions/clear`, {
          method: "POST",
        });
      } catch (error) {
        console.error("Error clearing backend transcripts:", error);
      }
    } catch (error) {
      console.error("Error analyzing response:", error);
      alert("Error connecting to the Python analysis backend. Make sure it's running on port 8004.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Listen for user joined events to keep track of users in the room
  useEffect(() => {
    if (!socket) return;

    const handleUserJoined = (userInfo) => {
      console.log("User joined:", userInfo);

      // Add user to our local user registry
      setConnectedUsers((prev) => ({
        ...prev,
        [userInfo.socketId]: {
          name: userInfo.userName,
          role: userInfo.userRole,
          joinedAt: new Date(),
        },
      }));
    };

    const handleUserLeft = (userInfo) => {
      console.log("User left:", userInfo);

      // Remove user from our local registry
      setConnectedUsers((prev) => {
        const newUsers = { ...prev };
        delete newUsers[userInfo.socketId];
        return newUsers;
      });
    };

    // Listen for user joined and left events
    socket.on("userJoined", handleUserJoined);
    socket.on("userLeft", handleUserLeft);

    return () => {
      socket.off("userJoined", handleUserJoined);
      socket.off("userLeft", handleUserLeft);
    };
  }, [socket]);

  // Set up polling interval for fetching transcriptions
  useEffect(() => {
    // Initial fetch
    fetchTranscriptions();

    // Set up polling interval
    pollingIntervalRef.current = setInterval(fetchTranscriptions, 3000); // every 3 seconds

    return () => {
      // Clear interval on component unmount
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

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
      console.log("[Interviewer] Connected to Deepgram");

      mediaRecorder.addEventListener("dataavailable", async (event) => {
        if (event.data.size > 0 && deepgramSocket.readyState === 1) {
          deepgramSocket.send(event.data);
        }
      });

      try {
        mediaRecorder.start(1000);
        console.log("[Interviewer] MediaRecorder started successfully");
      } catch (error) {
        console.error("[Interviewer] Error starting MediaRecorder:", error);
      }
    };

    deepgramSocket.onmessage = (message) => {
      try {
        const received = JSON.parse(message.data);
        if (received && received.channel && received.channel.alternatives && received.channel.alternatives.length > 0) {
          const newTranscript = received.channel.alternatives[0].transcript;
          if (newTranscript && received.is_final) {
            setTranscript((prev) => {
              const updatedTranscript = prev + " " + newTranscript;

              // Send to backend using our helper function
              sendTranscription(newTranscript);

              return updatedTranscript;
            });
          }
        }
      } catch (error) {
        console.error("[Interviewer] Error processing transcript:", error);
      }
    };

    deepgramSocket.onclose = () => {
      setIsConnected(false);
      console.log("[Interviewer] Disconnected from Deepgram");
    };

    deepgramSocket.onerror = (error) => {
      console.error("[Interviewer] Deepgram WebSocket error:", error);
    };

    return () => {
      if (mediaRecorder.state !== "inactive") {
        try {
          mediaRecorder.stop();
        } catch (error) {
          console.error("[Interviewer] Error stopping MediaRecorder:", error);
        }
      }
      if (deepgramSocket.readyState === 1) {
        deepgramSocket.close();
      }
    };
  }, [localStream]);

  // Auto-scroll the transcript container
  useEffect(() => {
    if (transcriptContainerRef.current) {
      transcriptContainerRef.current.scrollTop = transcriptContainerRef.current.scrollHeight;
    }
  }, [transcript, allTranscriptions]);

  // Prepare the combined transcript display
  const combinedTranscriptDisplay = () => {
    if (allTranscriptions.length === 0) {
      return "No transcription yet...";
    }

    // Create a display with all transcriptions in chronological order
    return allTranscriptions.map((item, index) => {
      const speakerName = item.senderName || (item.sender === "candidate" ? "Candidate" : "Interviewer");
      return (
        <div key={index} className={`mb-2 ${item.sender === "candidate" ? "text-amber-300" : "text-blue-300"}`}>
          <span className="font-bold">{speakerName}: </span>
          <span className="text-white">{item.transcript}</span>
          <span className="text-xs text-slate-400 ml-2">
            {new Date(item.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      );
    });
  };

  return (
    <div className="h-full w-full bg-slate-800 border-l border-slate-700 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-slate-700">
        <h3 className="text-xl font-medium text-white">Interview Assistant</h3>
        <div className="flex items-center space-x-2">
          <span className={`w-2 h-2 rounded-full ${isConnected ? "bg-emerald-500" : "bg-red-500"}`} />
          <span className="text-xs text-slate-300">{isConnected ? "Connected" : "Disconnected"}</span>
        </div>
      </div>

      <div className="flex flex-col space-y-4 h-full overflow-auto p-4">
        {/* <div className="bg-red-900/30 rounded-lg p-2 text-xs">
          <h5 className="font-bold text-white mb-1">Debug Info:</h5>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-white">Analysis length: </span>
              <span className="text-slate-300">{previousAnalysis.length} chars</span>
            </div>
            <div>
              <span className="text-white">Evaluation length: </span>
              <span className="text-slate-300">{expectedAnswer.length} chars</span>
            </div>
            <div>
              <span className="text-white">Follow-up length: </span>
              <span className="text-slate-300">{nextQuestion.length} chars</span>
            </div>
            <div>
              <span className="text-white">Current Q length: </span>
              <span className="text-slate-300">{currentQuestion.length} chars</span>
            </div>
          </div>
        </div> */}

        {/* Current Question Section */}
        <div className="bg-slate-700/50 rounded-lg p-4 flex-shrink-0 shadow-md">
          <h4 className="text-sm font-medium text-slate-300 mb-2 flex items-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4 mr-2"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            Current Question
          </h4>
          <p className="text-base text-white">
            {currentQuestion || "No question yet. Start the interview by analyzing."}
          </p>
        </div>

        {/* Conversation Transcript Section */}
        <div className="flex flex-col flex-grow bg-slate-700/50 rounded-lg p-4 overflow-hidden shadow-md">
          <h4 className="text-sm font-medium text-slate-300 mb-2 flex items-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4 mr-2"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
              />
            </svg>
            Conversation Transcript
          </h4>
          <div
            ref={transcriptContainerRef}
            className="flex-grow overflow-y-auto text-base text-white whitespace-pre-wrap bg-slate-800/50 p-3 rounded"
          >
            {allTranscriptions.length > 0 ? (
              <div className="space-y-2">
                {allTranscriptions.map((item, index) => {
                  // Determine if this message is from the current user
                  const isCurrentUser = item.socketId === socket?.id;

                  // Try to get user data from our connected users if available
                  const userData = item.socketId && connectedUsers[item.socketId];

                  // Determine sender role for display - prioritize our connected users data
                  const senderRole = (userData?.role || item.sender || "unknown").toLowerCase();

                  // Set the display name with better fallbacks - prioritize connected users data
                  const speakerName =
                    userData?.name ||
                    item.senderName ||
                    (senderRole === "candidate"
                      ? "Candidate"
                      : senderRole === "interviewer"
                      ? "Interviewer"
                      : senderRole === "recruiter"
                      ? "Recruiter"
                      : "User");

                  // Assign color and style based on role
                  let speakerClass = "text-blue-300"; // default for interviewer
                  let badgeClass = "bg-blue-900/50 text-blue-200"; // default badge
                  let borderClass = "border-blue-700/30"; // default border

                  if (senderRole === "candidate") {
                    speakerClass = "text-amber-300";
                    badgeClass = "bg-amber-900/50 text-amber-200";
                    borderClass = "border-amber-700/30";
                  } else if (senderRole === "recruiter") {
                    speakerClass = "text-emerald-300";
                    badgeClass = "bg-emerald-900/50 text-emerald-200";
                    borderClass = "border-emerald-700/30";
                  }

                  // Add highlighting for current user's messages
                  const messageClass = isCurrentUser ? "bg-slate-700/40 border border-slate-600/50" : "";

                  return (
                    <div
                      key={index}
                      className={`pb-2 mb-2 ${borderClass} border-b last:border-0 ${messageClass} rounded-md p-2`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`font-bold ${speakerClass}`}>
                            {speakerName}
                            {isCurrentUser && <span className="text-xs ml-1 text-slate-400">(You)</span>}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${badgeClass}`}>{senderRole}</span>
                        </div>
                        <span className="text-xs text-slate-400">
                          {new Date(item.timestamp).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })}
                        </span>
                      </div>
                      <div className={`text-white pl-2 border-l-2 ${borderClass}`}>
                        {/* If the message is merged, display with line breaks */}
                        {item.transcript.split("\n").map((line, lineIndex) => (
                          <div key={lineIndex} className={lineIndex > 0 ? "mt-2" : ""}>
                            {line}
                            {/* Show timestamp for merged messages if there are multiple */}
                            {item.originalMessages &&
                              item.originalMessages.length > 1 &&
                              lineIndex < item.originalMessages.length && (
                                <span className="text-xs text-slate-500 ml-2">
                                  {new Date(item.originalMessages[lineIndex].timestamp).toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </span>
                              )}
                          </div>
                        ))}
                        {/* If multiple messages were merged, show a subtle indicator */}
                        {item.originalMessages && item.originalMessages.length > 1 && (
                          <div className="text-xs text-slate-500 mt-1 italic">
                            {item.originalMessages.length} consecutive messages merged
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-slate-400 italic text-center py-4">No transcription yet...</div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-between space-x-2">
          <button
            onClick={resetInterview}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors w-1/3 shadow-md flex items-center justify-center"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4 mr-2"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            Reset
          </button>
          <button
            onClick={analyzeResponse}
            disabled={isAnalyzing || !(transcript.trim() || allTranscriptions.length > 0)}
            className={`px-4 py-2 ${
              isAnalyzing || !(transcript.trim() || allTranscriptions.length > 0)
                ? "bg-emerald-700/50 cursor-not-allowed"
                : "bg-emerald-600 hover:bg-emerald-700"
            } text-white rounded-lg font-medium transition-colors w-2/3 shadow-md flex items-center justify-center`}
          >
            {isAnalyzing ? (
              <>
                <svg
                  className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Analyzing...
              </>
            ) : (
              <>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4 mr-2"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                  />
                </svg>
                Analyze Response
              </>
            )}
          </button>
        </div>

        {/* Analysis Results Section - Display in a cleaner grid layout */}
        {(previousAnalysis || nextQuestion || expectedAnswer) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
            {/* Analysis Section */}
            {previousAnalysis && (
              <div className="bg-slate-700/50 rounded-lg p-4 shadow-md">
                <h4 className="text-sm font-medium text-slate-300 mb-2 flex items-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4 mr-2"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                    />
                  </svg>
                  Analysis
                </h4>
                <div className="prose prose-invert prose-sm max-w-none bg-slate-800/50 p-3 rounded">
                  <ReactMarkdown>{previousAnalysis}</ReactMarkdown>
                </div>
              </div>
            )}

            {/* Evaluation Section */}
            {expectedAnswer && (
              <div className="bg-slate-700/50 rounded-lg p-4 shadow-md">
                <h4 className="text-sm font-medium text-slate-300 mb-2 flex items-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4 mr-2"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  Evaluation
                </h4>
                <div className="prose prose-invert prose-sm max-w-none bg-slate-800/50 p-3 rounded">
                  <ReactMarkdown>{expectedAnswer}</ReactMarkdown>
                </div>
              </div>
            )}

            {/* Follow-up Questions Section */}
            {nextQuestion && (
              <div className="bg-slate-700/50 rounded-lg p-4 shadow-md md:col-span-2">
                <h4 className="text-sm font-medium text-slate-300 mb-2 flex items-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4 mr-2"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  Follow-up Questions
                </h4>
                <div className="prose prose-invert prose-sm max-w-none bg-slate-800/50 p-3 rounded">
                  <ReactMarkdown>{nextQuestion}</ReactMarkdown>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default InterviewAssistant;
