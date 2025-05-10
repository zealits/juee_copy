module.exports = {
  apps: [
    {
      name: "node-backend",
      script: "back-end/server.js",
      env: {
        NODE_ENV: "production",
      },
      watch: false,
      instances: 1,
      exec_mode: "fork",
    },
    {
      name: "python-backend",
      script: "python-backend/main.py",
      interpreter: "python3",
      watch: false,
      instances: 1,
      exec_mode: "fork",
    },
  ],
};
