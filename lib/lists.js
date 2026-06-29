/**
 * Downloads and parses blocklist/allowlist filter files.
 */

// ─── Download ─────────────────────────────────────────────────────────────────

/**
 * Downloads all URLs and returns the combined raw text.
 */
async function fetchAll(urls) {
  const chunks = [];
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      chunks.push(await res.text());
    } catch (err) {
      console.warn(`  Failed to download ${url}: ${err.message}`);
    }
  }
  return chunks.join("\n");
}

export async function downloadLists(allowlistUrls, blocklistUrls) {
  const [allowlistRaw, blocklistRaw] = await Promise.all([
    fetchAll(allowlistUrls),
    fetchAll(blocklistUrls),
  ]);
  return { allowlistRaw, blocklistRaw };
}

// ─── Parsing ──────────────────────────────────────────────────────────────────

const DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

function isValidDomain(value) {
  return DOMAIN_RE.test(value);
}

function isComment(line) {
  return line.startsWith("#") || line.startsWith("!") || line.startsWith("//") || line.startsWith("/*");
}

/**
 * Strips hosts-file prefixes, adblock syntax, and wildcards to extract a plain domain.
 */
function normalizeDomain(line, isAllowlist = false) {
  let s = isAllowlist ? line.replace(/^@@\|\|/, "") : line;
  s = s
    .replace(/^(?:0\.0\.0\.0|127\.0\.0\.1|::1?)\s+/, "") // hosts format
    .replace(/^\|\|/, "")    // adblock ||domain^
    .replace(/\^.*$/, "")    // strip ^ and everything after
    .replace(/^\*\./, "")    // wildcard prefix
    .trim();
  return s;
}

/**
 * Parses blocklist + allowlist raw text and returns a deduplicated array of
 * domains to block, with parent-domain collapsing and allowlist filtering.
 */
export function parseDomains(blocklistRaw, allowlistRaw, limit = 300_000) {
  // Build allowlist set
  const allowlist = new Set();
  for (const line of allowlistRaw.split("\n")) {
    const s = line.trim();
    if (!s || isComment(s)) continue;
    const domain = normalizeDomain(s, true);
    if (isValidDomain(domain)) allowlist.add(domain);
  }

  // Parse blocklist
  const blocked = new Set();
  const result = [];

  for (const line of blocklistRaw.split("\n")) {
    if (result.length >= limit) break;

    const s = line.trim();
    if (!s || isComment(s)) continue;

    const domain = normalizeDomain(s);
    if (!isValidDomain(domain)) continue;
    if (blocked.has(domain)) continue;

    // Skip if any parent domain is allowlisted or already blocked
    const parts = domain.split(".");
    let skip = false;
    for (let i = 1; i < parts.length - 1; i++) {
      const parent = parts.slice(i).join(".");
      if (allowlist.has(parent)) { skip = true; break; }
      if (blocked.has(parent)) { skip = true; break; }
    }
    if (skip) continue;
    if (allowlist.has(domain)) continue;

    blocked.add(domain);
    result.push(domain);
  }

  return result;
}
