// Railway and other container platforms may provide HOSTNAME as the container ID.
// Bind to all interfaces so the platform's edge proxy can reach the app.
process.env.HOSTNAME = "0.0.0.0";

await import("../.next/standalone/server.js");
