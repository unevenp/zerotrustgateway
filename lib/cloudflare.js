import { CF_API_TOKEN, CF_ACCOUNT_ID, LIST_CHUNK_SIZE, BLOCK_PAGE_ENABLED } from "./config.js";

const BASE = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/gateway`;
const RATE_LIMIT_COOLDOWN_MS = 2 * 60 * 1000;
const RULE_NAME = "CGPS Filter Lists";

// ─── HTTP ────────────────────────────────────────────────────────────────────

async function cfFetch(path, options = {}) {
  const url = `${BASE}${path}`;
  let attempts = 0;

  while (true) {
    const res = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CF_API_TOKEN}`,
        ...options.headers,
      },
    });

    if (res.status === 429) {
      console.warn(`Rate limited — waiting ${RATE_LIMIT_COOLDOWN_MS / 60000} min...`);
      await sleep(RATE_LIMIT_COOLDOWN_MS);
      continue;
    }

    if (!res.ok) {
      if (++attempts >= 5) throw new Error(`Cloudflare API error ${res.status}: ${url}`);
      console.warn(`Request failed (${res.status}), retrying... (${attempts}/5)`);
      await sleep(2000 * attempts);
      continue;
    }

    return res.json();
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Lists ───────────────────────────────────────────────────────────────────

export const getLists = () => cfFetch("/lists");

const getListItems = (id) =>
  cfFetch(`/lists/${id}/items?per_page=${LIST_CHUNK_SIZE}`);

const createList = (name, items) =>
  cfFetch("/lists", {
    method: "POST",
    body: JSON.stringify({ name, type: "DOMAIN", items }),
  });

const patchList = (id, patch) =>
  cfFetch(`/lists/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });

const deleteList = (id) => cfFetch(`/lists/${id}`, { method: "DELETE" });

export async function deleteAllLists(lists) {
  for (const { id, name } of lists) {
    await deleteList(id);
    console.log(`  Deleted: ${name}`);
  }
}

/**
 * Syncs `domains` to Cloudflare Gateway lists named "CGPS List - Chunk N".
 * Diffs against existing lists so only changes are sent to the API.
 */
export async function syncLists(domains) {
  const now = new Date().toISOString();
  const wanted = new Set(domains);

  // Fetch existing CGPS lists
  const { result: allLists } = await getLists();
  const cgpsLists = allLists.filter(({ name }) => name.startsWith("CGPS List"));

  // Fetch items from each list
  const itemsByList = {};
  for (const list of cgpsLists) {
    const { result: items } = await getListItems(list.id);
    itemsByList[list.id] = items.map((i) => i.value);
  }

  // Map domain → listId for all existing entries
  const existingDomains = Object.fromEntries(
    Object.entries(itemsByList).flatMap(([id, doms]) => doms.map((d) => [d, id]))
  );

  const toRemove = Object.entries(existingDomains)
    .filter(([d]) => !wanted.has(d))
    .reduce((acc, [d, id]) => {
      (acc[id] ??= []).push(d);
      return acc;
    }, {});

  const toAdd = domains.filter((d) => !existingDomains[d]);

  console.log(`  ${toAdd.length} to add, ${Object.values(toRemove).flat().length} to remove`);

  // Build patches — fill gaps from removals with new entries first
  const patches = {};
  for (const [listId, removals] of Object.entries(toRemove)) {
    const capacity = LIST_CHUNK_SIZE - (itemsByList[listId].length - removals.length);
    const append = toAdd.splice(0, capacity).map((d) => ({ value: d, description: now }));
    patches[listId] = { remove: removals, append };
  }

  // Fill remaining space in unpatched lists
  for (const list of cgpsLists.filter(({ id }) => !patches[id])) {
    const space = LIST_CHUNK_SIZE - itemsByList[list.id].length;
    if (space > 0 && toAdd.length > 0) {
      patches[list.id] = { append: toAdd.splice(0, space).map((d) => ({ value: d, description: now })) };
    }
  }

  // Apply patches
  for (const [listId, patch] of Object.entries(patches)) {
    const name = cgpsLists.find((l) => l.id === listId)?.name;
    console.log(`  Patching "${name}" (+${patch.append?.length ?? 0} / -${patch.remove?.length ?? 0})`);
    await patchList(listId, patch);
  }

  // Create new lists for any remaining domains
  if (toAdd.length > 0) {
    const nextChunk =
      Math.max(0, ...cgpsLists.map((l) => parseInt(l.name.replace("CGPS List - Chunk ", "")) || 0)) + 1;
    for (let i = 0, chunk = nextChunk; i < toAdd.length; i += LIST_CHUNK_SIZE, chunk++) {
      const items = toAdd.slice(i, i + LIST_CHUNK_SIZE).map((d) => ({ value: d, description: now }));
      const name = `CGPS List - Chunk ${chunk}`;
      await createList(name, items);
      console.log(`  Created "${name}" (${items.length} domains)`);
    }
  }
}

// ─── Rules ───────────────────────────────────────────────────────────────────

export const getRules = () => cfFetch("/rules");

export const deleteRule = (id) => cfFetch(`/rules/${id}`, { method: "DELETE" });

/**
 * Creates or updates the CGPS block rule referencing the given lists.
 */
export async function upsertRule(lists) {
  const traffic = lists.map(({ id }) => `any(dns.domains[*] in $${id})`).join(" or ");

  const body = {
    name: RULE_NAME,
    description: "Managed by CGPS. Do not rename this rule.",
    enabled: true,
    action: "block",
    filters: ["dns"],
    traffic,
    rule_settings: {
      block_page_enabled: BLOCK_PAGE_ENABLED,
      block_reason: "Blocked by CGPS.",
    },
  };

  const { result: existingRules } = await getRules();
  const existing = existingRules.find(({ name }) => name === RULE_NAME);

  if (existing) {
    await cfFetch(`/rules/${existing.id}`, { method: "PUT", body: JSON.stringify(body) });
    console.log("  Updated existing block rule.");
  } else {
    await cfFetch("/rules", { method: "POST", body: JSON.stringify(body) });
    console.log("  Created block rule.");
  }
}
