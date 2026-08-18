const path = require("node:path");

const root = __dirname;
const frontendPort = String(process.env.APP_PORT || 3100);
const graphhopperRegion =
  process.env.GRAPHHOPPER_REGION === "greater-mekong"
    ? "greater-mekong"
    : "cambodia";
const graphhopperDataFile =
  process.env.GRAPHHOPPER_DATA_FILE ||
  (graphhopperRegion === "greater-mekong"
    ? "maps/greater-mekong-latest.osm.pbf"
    : "maps/cambodia-latest.osm.pbf");
const graphhopperCache =
  process.env.GRAPHHOPPER_CACHE ||
  (graphhopperRegion === "greater-mekong"
    ? "maps/graphhopper-cache-greater-mekong"
    : "maps/graphhopper-cache");
const graphhopperMinHeap =
  process.env.GRAPHHOPPER_XMS ||
  (graphhopperRegion === "greater-mekong" ? "4g" : "2g");
const graphhopperMaxHeap =
  process.env.GRAPHHOPPER_XMX ||
  (graphhopperRegion === "greater-mekong" ? "8g" : "2g");

module.exports = {
  apps: [
    {
      name: "smartroute-graphhopper",
      cwd: path.join(root, "backend"),
      script: "/usr/bin/java",
      args: [
        "-XX:TieredStopAtLevel=1",
        `-Xms${graphhopperMinHeap}`,
        `-Xmx${graphhopperMaxHeap}`,
        `-Ddw.graphhopper.datareader.file=${graphhopperDataFile}`,
        `-Ddw.graphhopper.graph.location=${graphhopperCache}`,
        "-jar",
        path.join(root, "backend", "graphhopper", "graphhopper-web-11.0.jar"),
        "server",
        path.join(root, "backend", "graphhopper", "config.yml"),
      ],
      interpreter: "none",
      exec_mode: "fork",
      autorestart: true,
      restart_delay: 5000,
      min_uptime: 10000,
      kill_timeout: 30000,
      max_memory_restart:
        process.env.GRAPHHOPPER_MAX_MEMORY_RESTART ||
        (graphhopperRegion === "greater-mekong" ? "8500M" : "2500M"),
      time: true,
    },
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
        FASTAPI_URL: "http://127.0.0.1:8000",
      },
    },
  ],
};
