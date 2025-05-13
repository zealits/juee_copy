import { useState, useEffect, useRef } from "react";
import { formatDistanceToNow } from "date-fns";

const ChatInterface = ({ socket, userRole, onNewMessage }) => {
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);

  // Load chat history when component mounts
  useEffect(() => {
    if (!socket) return;

    const loadChatHistory = async () => {
      try {
        const history = await socket.emitWithAck("getChatHistory", {});
        setMessages(history || []);
        scrollToBottom();
      } catch (err) {
        console.error("Failed to load chat history:", err);
      }
    };

    loadChatHistory();

    // Listen for new messages
    const handleNewMessage = (message) => {
      setMessages((prev) => [...prev, message]);

      // Increment unread count if chat is closed
      if (!isOpen) {
        setUnreadCount((prev) => prev + 1);
      }

      // Notify parent component
      if (onNewMessage) {
        onNewMessage(message);
      }

      // Auto-scroll to bottom on new message
      scrollToBottom();
    };

    socket.on("chatMessage", handleNewMessage);

    return () => {
      socket.off("chatMessage", handleNewMessage);
    };
  }, [socket, isOpen, onNewMessage]);

  // Scroll to bottom when new messages arrive
  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  // Auto-scroll to bottom when messages change or chat opens
  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  // Reset unread count when opening chat
  useEffect(() => {
    if (isOpen) {
      setUnreadCount(0);
    }
  }, [isOpen]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!messageInput.trim() || !socket) return;

    socket.emit("sendChatMessage", messageInput.trim());
    setMessageInput("");
  };

  const toggleChat = () => {
    setIsOpen(!isOpen);
  };

  // Function to get a color for a user based on their name (for consistent colors)
  const getUserColor = (userName) => {
    // Simple hash function to generate color from username
    const hash = userName.split("").reduce((acc, char) => {
      return char.charCodeAt(0) + ((acc << 5) - acc);
    }, 0);

    // Generate hue between 0 and 360 (avoiding red tones which are used for system messages)
    const hue = ((hash % 280) + 80) % 360; // Avoiding red (0-60 & 300-360)

    // Return HSL color with high saturation and appropriate lightness
    return `hsl(${hue}, 70%, 45%)`;
  };

  // Format timestamp relative to now (e.g., "5 minutes ago")
  const formatMessageTime = (timestamp) => {
    try {
      return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
    } catch (err) {
      return "just now";
    }
  };

  return (
    <div className="relative z-10">
      {/* Chat toggle button with notification indicator */}
      <button
        onClick={toggleChat}
        className="fixed bottom-4 right-4 bg-blue-600 hover:bg-blue-700 text-white rounded-full p-3 shadow-lg flex items-center justify-center transition-all duration-200"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Chat interface */}
      {isOpen && (
        <div className="fixed bottom-20 right-4 w-80 h-96 bg-slate-800 rounded-lg shadow-xl flex flex-col overflow-hidden border border-slate-700">
          {/* Chat header */}
          <div className="px-4 py-3 bg-slate-900 border-b border-slate-700 flex justify-between items-center">
            <h3 className="text-white font-medium">Meeting Chat</h3>
            <button onClick={toggleChat} className="text-slate-400 hover:text-white">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Messages container */}
          <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-900/50">
            {messages.length === 0 ? (
              <div className="text-center text-slate-500 py-8">No messages yet. Start the conversation!</div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`max-w-[85%] ${
                    msg.socketId === socket.id
                      ? "ml-auto bg-blue-600 text-white rounded-tl-lg rounded-bl-lg rounded-tr-lg"
                      : "mr-auto bg-slate-700 text-white rounded-tr-lg rounded-br-lg rounded-tl-lg"
                  } px-3 py-2 break-words`}
                >
                  {msg.socketId !== socket.id && (
                    <div className="font-medium text-xs mb-1" style={{ color: getUserColor(msg.sender) }}>
                      {msg.sender} • {msg.senderRole}
                    </div>
                  )}
                  <p>{msg.text}</p>
                  <div className="text-right text-xs opacity-70 mt-1">{formatMessageTime(msg.timestamp)}</div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Message input */}
          <form onSubmit={handleSubmit} className="p-3 bg-slate-900 border-t border-slate-700 flex">
            <input
              type="text"
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 bg-slate-800 border border-slate-700 rounded-l-md px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={!messageInput.trim()}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white rounded-r-md px-4 transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                />
              </svg>
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

export default ChatInterface;
