import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig(({ mode }) => {
  const env = {
    development: {
      nodeApiUrl: "http://localhost:3004",
      pythonApiUrl: "http://localhost:8004",
      wsUrl: "ws://localhost:3004",
      socketUrl: "http://localhost:3004",
    },
    production: {
      nodeApiUrl: "https://meetings.aiiventure.com",
      pythonApiUrl: "https://api.meetings.aiiventure.com",
      wsUrl: "wss://meetings.aiiventure.com",
      socketUrl: "https://meetings.aiiventure.com",
    },
  };

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    define: {
      "process.env": {
        VITE_APP_MODE: JSON.stringify(mode),
        VITE_NODE_API_URL: JSON.stringify(env[mode].nodeApiUrl),
        VITE_PYTHON_API_URL: JSON.stringify(env[mode].pythonApiUrl),
        VITE_WS_URL: JSON.stringify(env[mode].wsUrl),
        VITE_SOCKET_URL: JSON.stringify(env[mode].socketUrl),
      },
    },
  };
});
