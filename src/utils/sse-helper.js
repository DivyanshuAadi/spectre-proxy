/**
 * Server-Sent Events Formatting Utilities
 * Single-line data payloads only — the dashboard's SSE parser splits on '\n'
 * and JSON.parses each `data:` line.
 */

/** Response headers for an SSE stream (no buffering anywhere in the chain). */
export const SSE_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
};

/** Format one SSE frame. */
export function sseEvent(data, eventName = 'message') {
  return `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** Write one SSE frame to a response, ignoring disconnects mid-write. */
export function sseWrite(res, data, eventName = 'message') {
  if (res.writableEnded || res.destroyed) return false;
  res.write(sseEvent(data, eventName));
  return true;
}
