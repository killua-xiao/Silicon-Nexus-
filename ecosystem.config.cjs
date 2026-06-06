module.exports = {
  apps: [
    {
      name: "silicon-nexus",
      script: "npx",
      args: "tsx server.ts",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
        NEXUS_API_KEY: "silinex.xyz"
      },
      error_file: "./logs/err.log",
      out_file: "./logs/out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss"
    }
  ]
};
