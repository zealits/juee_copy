import { useEffect, useState, useRef } from "react";
import ReactMarkdown from "react-markdown";
import config from "../config/config";

const InterviewAssistant = ({ localStream }) => {
  const [transcript, setTranscript] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState("");
  const [previousAnalysis, setPreviousAnalysis] = useState("");
  const [nextQuestion, setNextQuestion] = useState("");
  const [expectedAnswer, setExpectedAnswer] = useState("");
  const [candidateTranscript, setCandidateTranscript] = useState("");
  const transcriptContainerRef = useRef(null);
  const pollingIntervalRef = useRef(null);

  // Function to send transcription via HTTP POST
  const sendTranscription = async (transcript) => {
    try {
      const response = await fetch(`${config.nodeApiUrl}/api/transcription`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          transcript: transcript,
          timestamp: new Date().toISOString(),
          sender: "interviewer",
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
      const response = await fetch(`${config.nodeApiUrl}/api/transcriptions`);
      const data = await response.json();

      // Process candidate transcriptions
      if (data.candidate && data.candidate.length > 0) {
        // Create a composite string from all candidate transcriptions
        const allCandidateText = data.candidate.map((item) => item.transcript).join(" ");

        // Only update if there's a change
        setCandidateTranscript(allCandidateText);
      }
    } catch (error) {
      console.error("[Interviewer] Error fetching transcriptions:", error);
    }
  };

  const resetInterview = async () => {
    try {
      // Clear local transcripts
      setTranscript("");
      setCandidateTranscript("");
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
    const combinedTranscript = transcript + " " + candidateTranscript;

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
      setCandidateTranscript("");

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

  // Setup polling for transcriptions
  useEffect(() => {
    // Start polling for transcriptions every 2 seconds
    pollingIntervalRef.current = setInterval(fetchTranscriptions, 2000);

    // Initial fetch
    fetchTranscriptions();

    return () => {
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
  }, [transcript, candidateTranscript]);

  // Prepare the combined transcript display
  const combinedTranscriptDisplay = () => {
    if (!transcript && !candidateTranscript) {
      return "No transcription yet...";
    }

    let display = "";

    if (transcript) {
      display += `Interviewer: ${transcript}\n\n`;
    }

    if (candidateTranscript) {
      display += `Candidate: ${candidateTranscript}`;
    }

    return display;
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
        {/* Debug Info - Remove in production d */}
        <div className="bg-red-900/30 rounded-lg p-2 text-xs">
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
        </div>

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
            {combinedTranscriptDisplay()}
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
            disabled={isAnalyzing || !(transcript.trim() || candidateTranscript.trim())}
            className={`px-4 py-2 ${
              isAnalyzing || !(transcript.trim() || candidateTranscript.trim())
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
