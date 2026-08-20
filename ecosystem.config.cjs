const path = require("node:path");

const root = __dirname;
const frontendPort = String(process.env.APP_PORT || 3100);
const region = "indochina";

let graphhopperDataFile = "maps/cambodia-latest.osm.pbf";
let graphhopperCache = "maps/graph-cache";
let graphhopperMinHeap = "2g";
let graphhopperMaxHeap = "2g";

if (region === "indochina") {
  graphhopperDataFile = "maps/indochina-latest.osm.pbf";
  graphhopperCache = "maps/graph-cache-indochina";
  graphhopperMinHeap = "4g";
  graphhopperMaxHeap = "8g";
}

// {
//   name: "smartroute-graph",
//   cwd: path.join(root, "backend"),
//   script: "/usr/bin/java",
//   args: [
//     "-XX:TieredStopAtLevel=1",
//     `-Xms${graphhopperMinHeap}`,
//     `-Xmx${graphhopperMaxHeap}`,
//     `-Ddw.graphhopper.datareader.file=${graphhopperDataFile}`,
//     `-Ddw.graphhopper.graph.location=${graphhopperCache}`,
//     "-jar",
//     path.join(root, "backend", "graphhopper", "graphhopper-web-11.0.jar"),
//     "server",
//     path.join(root, "backend", "graphhopper", "config.yml"),
//   ],
//   interpreter: "none",
//   exec_mode: "fork",
//   autorestart: true,
//   restart_delay: 5000,
//   min_uptime: 10000,
//   kill_timeout: 30000,
//   max_memory_restart: process.env.GRAPHHOPPER_MAX_MEMORY_RESTART || (region === "indochina" ? "8500M" : "2500M"),
//   time: true,
// },
module.exports = {
  apps: [
    {
      name: "smart-backend",
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
        APP_PORT: "8100",
        APP_RELOAD: "false",
        PYTHONUNBUFFERED: "1",
      },
    },
    {
      name: "smart-nbc-rates",
      cwd: path.join(root, "backend"),
      script: path.join(root, "backend", ".venv", "bin", "python"),
      args: "-m scripts.fetch_nbc_exchange_rates",
      interpreter: "none",
      // Runs once immediately on `pm2 start`, then again every day at 01:00
      // Phnom Penh time via cron_restart. autorestart stays off so a normal
      // exit (success or failure) doesn't get retried before the next cron tick.
      autorestart: false,
      cron_restart: "0 1 * * *",
      kill_timeout: 15000,
      time: true,
      env: {
        TZ: "Asia/Phnom_Penh",
        PYTHONUNBUFFERED: "1",
      },
    },
    {
      name: "smart-frontend",
      cwd: path.join(root, "frontend"),
      script: path.join(
        root,
        "frontend",
        "node_modules",
        "next",
        "dist",
        "bin",
        "next",
      ),
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
        FASTAPI_URL: "http://127.0.0.1:8100",
      },
    },
  ],
};
