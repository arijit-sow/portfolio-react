// Simple centralized logger for the app
// Exports: info, warn, error, debug
// Sends logs to console and optionally to a remote endpoint if VITE_LOG_ENDPOINT is set.
const LOG_ENDPOINT = import.meta.env.VITE_LOG_ENDPOINT || null;

function timestamp() {
  return new Date().toISOString();
}

async function sendToServer(payload) {
  if (!LOG_ENDPOINT) return;
  try {
    const body = JSON.stringify(payload);
    if (navigator && navigator.sendBeacon) {
      navigator.sendBeacon(LOG_ENDPOINT, body);
    } else {
      // fire-and-forget
      fetch(LOG_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }).catch(() => {});
    }
  } catch (e) {
    // swallow - logging must not crash the app
    // eslint-disable-next-line no-console
    console.warn('Logger failed to send log', e);
  }
}

function format(level, args) {
  const meta = { ts: timestamp(), level };
  const message = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
  return { message, ...meta };
}

const logger = {
  info: (...args) => {
    // eslint-disable-next-line no-console
    console.info('[INFO]', ...args);
    const payload = format('info', args);
    sendToServer(payload);
  },
  warn: (...args) => {
    // eslint-disable-next-line no-console
    console.warn('[WARN]', ...args);
    const payload = format('warn', args);
    sendToServer(payload);
  },
  error: (...args) => {
    // eslint-disable-next-line no-console
    console.error('[ERROR]', ...args);
    const payload = format('error', args);
    sendToServer(payload);
  },
  debug: (...args) => {
    // eslint-disable-next-line no-console
    console.debug('[DEBUG]', ...args);
    const payload = format('debug', args);
    sendToServer(payload);
  }
};

export default logger;
