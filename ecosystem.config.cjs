const path = require("node:path");

const root = __dirname;
const frontendPort = String(process.env.APP_PORT || 3100);

module.exports = {
  apps: [
    {
      name: "smartroute-backend",
      cwd: path.join(root, "backend"),
      script: path.join(root, "backend", ".venv", "bin", "python"),
      args: "-m main",
      interpreter: "none",
      autorestart: true,
      restart_delay: 3000,
      kill_timeout: 15000,
      time: true,
      env: {
        APP_HOST: "127.0.0.1",
        APP_PORT: "8000",
        APP_RELOAD: "false",
        PYTHONUNBUFFERED: "1",
      },
    },
    {
      name: "smartroute-frontend",
      cwd: path.join(root, "frontend"),
      script: path.join(root, "frontend", "node_modules", "next", "dist", "bin", "next"),
      args: "start -H 0.0.0.0",
      interpreter: "node",
      autorestart: true,
      restart_delay: 3000,
      kill_timeout: 10000,
      time: true,
      env: {
        NODE_ENV: "production",
        PORT: frontendPort,
        APP_NAME: process.env.APP_NAME || "PsarAI Platform. (Cambodia)",
        APP_DESCRIPTION:
          process.env.APP_DESCRIPTION || "PsarAI - Your AI Travel Companion",
        FASTAPI_URL: "http://127.0.0.1:8000",
      },
    },
  ],
};
