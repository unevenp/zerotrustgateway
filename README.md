# Cloudflare Gateway Ad Blocker

Block ads and trackers at the DNS level using [Cloudflare Zero Trust Gateway](https://developers.cloudflare.com/cloudflare-one/policies/gateway/) — free, no device config needed beyond changing your DNS server.

Works with Cloudflare's free tier (up to 300,000 blocked domains).

## How it works

1. Downloads domain blocklists from the internet
2. Parses and deduplicates them, filtering out any allowlisted domains
3. Uploads them to Cloudflare Gateway as "Lists"
4. Creates a Gateway DNS policy that blocks all listed domains

## Setup

### 1. Create a Cloudflare API token

Go to [Cloudflare Dashboard → My Profile → API Tokens](https://dash.cloudflare.com/profile/api-tokens) and create a token with:

- **Zero Trust: Edit** permission
- Scoped to your account

### 2. Configure

```bash
cp .env.example .env
# Fill in CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID
```

### 3. Set Cloudflare Gateway as your DNS

In Cloudflare Zero Trust Dashboard → Settings → Gateway → DNS Locations, create a location and use the provided DNS addresses on your router or device.

### 4. Run

```bash
npm install
npm start
```

## Usage

| Command | Description |
|---|---|
| `npm start` | Download lists and sync to Cloudflare |
| `npm run dry` | Preview changes without touching Cloudflare |
| `npm run delete` | Remove all CGPS lists and rules from Cloudflare |

## Custom filter lists

Set `BLOCKLIST_URLS` and/or `ALLOWLIST_URLS` in your `.env` file (one URL per line):

```env
BLOCKLIST_URLS=https://example.com/blocklist.txt
  https://example.com/another.txt
```

Leave blank to use the built-in defaults ([OISD small](https://small.oisd.nl/) + [AdAway](https://adaway.org/hosts.txt)).

## Automation with GitHub Actions

Create a workflow to auto-update weekly:

```yaml
name: Update blocklists
on:
  schedule:
    - cron: "0 3 * * 1"  # Every Monday at 3am
  workflow_dispatch:

jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm install && npm start
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

Add your credentials as repository secrets under Settings → Secrets.
