const config = {
  development: {
    nodeApiUrl: "http://localhost:3004",
    pythonApiUrl: "http://localhost:8004",
    wsUrl: "ws://localhost:3004",
    socketUrl: "http://localhost:3004",
    mode: "development",
  },
  production: {
    nodeApiUrl: "https://meetings.aiiventure.com",
    pythonApiUrl: "https://meetings.aiiventure.com/api/python",
    wsUrl: "wss://meetings.aiiventure.com",
    socketUrl: "https://meetings.aiiventure.com",
    mode: "production",
  },
};

// Get current environment settings
const currentEnv = import.meta.env.MODE || "development";
export default config[currentEnv];
