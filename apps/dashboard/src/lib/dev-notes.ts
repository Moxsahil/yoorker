/**
 * Notes for whoever is building the dashboard: "Sample data" and "Live API" tags, which numbers
 * are made up, which sprint brings what, and the demo-venue loader. On in `pnpm dev`, and in a
 * build made with VITE_DEV_NOTES=true (staging); left out of every other build. Delete it, and
 * every use, once each screen reads the API.
 */
export const DEV_NOTES = import.meta.env.DEV || import.meta.env.VITE_DEV_NOTES === "true";
