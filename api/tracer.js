// Loaded before anything else (node --require ./tracer.js) so dd-trace can
// patch http/express. Sends spans to the local Datadog Agent on :8126.
require('dd-trace').init({
  service: process.env.DD_SERVICE || 'depot-api',
  env: process.env.DD_ENV || 'local',
  version: process.env.DD_VERSION || 'dev',
  logInjection: true,
});
