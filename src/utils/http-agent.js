/**
 * Shared Persistent HTTP/HTTPS Agents
 * Reuses TCP and TLS connections to upstream Omniroute to eliminate handshake latency.
 * Uses LIFO scheduling (Node default) to maximize socket reuse and prevent stale socket accumulation.
 */

import http from 'node:http';
import https from 'node:https';

export const httpAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 30_000,
  maxSockets: 64,
  maxFreeSockets: 16,
  scheduling: 'lifo',
});

export const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 30_000,
  maxSockets: 64,
  maxFreeSockets: 16,
  scheduling: 'lifo',
});

/**
 * Get the appropriate persistent agent based on protocol.
 * @param {boolean} isHttps
 * @returns {http.Agent | https.Agent}
 */
export function getAgent(isHttps) {
  return isHttps ? httpsAgent : httpAgent;
}

/**
 * Configure TCP_NODELAY (disable Nagle's algorithm) as soon as the socket is assigned to the request.
 * @param {import('node:http').ClientRequest} req
 */
export function attachSocketNoDelay(req) {
  req.on('socket', (socket) => {
    if (socket.connecting) {
      socket.once('connect', () => socket.setNoDelay(true));
    } else {
      socket.setNoDelay(true);
    }
  });
}
