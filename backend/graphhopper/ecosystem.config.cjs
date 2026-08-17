const path = require("node:path");

const serviceDirectory = __dirname;

module.exports = {
  apps: [
    {
      name: "smartroute-graphhopper",
      cwd: serviceDirectory,
      script: path.join(serviceDirectory, "start.sh"),
      interpreter: "bash",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false,
      min_uptime: "30s",
      max_restarts: 10,
      restart_delay: 5000,
      kill_timeout: 30000,
      env: {
        GRAPHHOPPER_VERSION: "11.0",
        JAVA_OPTS: "-Xms1g -Xmx4g",
      },
    },
  ],
};
