/**
 * SSRF Protection Utility
 *
 * Validates URLs to prevent Server-Side Request Forgery attacks.
 * Blocks requests to private/internal IPs, loopback, link-local,
 * and non-HTTP(S) schemes before the server makes outbound requests.
 */

import dns from 'dns';
import { promisify } from 'util';

const lookup = promisify(dns.lookup);

// Only allow these URL schemes for external fetches
const ALLOWED_SCHEMES = new Set(['http:', 'https:']);

// Hostnames that should always be blocked regardless of DNS resolution
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'ip6-localhost',
  'ip6-loopback',
  'broadcasthost',
]);

/**
 * Checks whether an IPv4 address falls in a private/reserved range.
 */
function isPrivateIPv4(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => p < 0 || p > 255 || !Number.isInteger(p))) {
    return false;
  }
  const [a, b, c] = parts;

  return (
    a === 10 ||                            // 10.0.0.0/8
    (a === 172 && b >= 16 && b <= 31) ||   // 172.16.0.0/12
    (a === 192 && b === 168) ||            // 192.168.0.0/16
    a === 127 ||                           // 127.0.0.0/8 loopback
    (a === 169 && b === 254) ||            // 169.254.0.0/16 link-local
    a === 0 ||                             // 0.0.0.0/8
    (a === 100 && b >= 64 && b <= 127) ||  // 100.64.0.0/10 shared address
    a >= 224                               // 224+ multicast / reserved
  );
}

/**
 * Checks whether an IPv6 address is private/reserved.
 */
function isPrivateIPv6(ip) {
  const lower = ip.toLowerCase().replace(/^\[|\]$/g, '');
  return (
    lower === '::1' ||
    lower.startsWith('fc') ||
    lower.startsWith('fd') ||
    lower.startsWith('fe80') ||
    lower.startsWith('::ffff:127.') ||
    lower === '::'
  );
}

/**
 * Returns true if the given IP address is private/reserved.
 */
function isPrivateIP(ip) {
  if (ip.includes(':')) return isPrivateIPv6(ip);
  return isPrivateIPv4(ip);
}

/**
 * Validates a URL for safe outbound fetching.
 *
 * - Only allows http: and https: schemes
 * - Blocks known private hostnames
 * - Resolves DNS and rejects private IPs (SSRF protection)
 *
 * @param {string|URL} urlInput - URL string or URL object to validate
 * @returns {Promise<{ safe: boolean, reason?: string }>}
 */
export async function validateOutboundUrl(urlInput) {
  let url;
  try {
    url = typeof urlInput === 'string' ? new URL(urlInput) : urlInput;
  } catch {
    return { safe: false, reason: 'invalid_url' };
  }

  if (!ALLOWED_SCHEMES.has(url.protocol)) {
    return { safe: false, reason: `disallowed_scheme:${url.protocol}` };
  }

  const hostname = url.hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { safe: false, reason: `blocked_hostname:${hostname}` };
  }

  // If hostname looks like a raw IP, check it directly
  if (/^[\d.]+$/.test(hostname) || /^[0-9a-f:]+$/i.test(hostname)) {
    if (isPrivateIP(hostname)) {
      return { safe: false, reason: `private_ip:${hostname}` };
    }
    return { safe: true };
  }

  // Resolve DNS and check the resulting IP
  try {
    const { address } = await lookup(hostname, { family: 4 }).catch(() =>
      lookup(hostname, { family: 6 })
    );
    if (isPrivateIP(address)) {
      return { safe: false, reason: `resolved_private_ip:${address}` };
    }
  } catch {
    // DNS resolution failed (e.g., domain doesn't exist or network issue).
    // Allow the request — the actual fetch will fail with a connection error,
    // which is safe. We only block confirmed private IPs.
  }

  return { safe: true };
}
