import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Tracing must be enabled for agent monitoring to work
  tracesSampleRate: 1.0,

  // Add data like inputs and responses to/from LLMs and tools
  sendDefaultPii: true,

  debug: false,
});
