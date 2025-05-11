module.exports = {
  apps: [
    {
      name: "juee_copy-node-backend",
      script: "back-end/server.js",
      env: {
        NODE_ENV: "production",
      },
      watch: false,
      instances: 1,
      exec_mode: "fork",
    },
    {
      name: "juee_copy-python-backend",
      script: "python-backend/simple_backend.py",
      interpreter: "python3",
      watch: false,
      instances: 1,
      exec_mode: "fork",
    },
  ],
};
