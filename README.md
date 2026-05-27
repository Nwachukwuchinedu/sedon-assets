# Sedon Assets

Image hosting repository for **Sedon Services** — stores product, category, avatar, and CMS images served via jsDelivr CDN.

## Directory Structure

```
.
├── .github/workflows/
│   └── process-images.yml   — AVIF conversion workflow
├── images/
│   ├── products/            — Product images
│   ├── categories/          — Category images
│   ├── avatars/             — User avatar images
│   └── cms/                 — CMS content images
├── staging/                 — JSON triggers for AVIF conversion
├── scripts/
│   └── process-images.js    — Sharp-based AVIF conversion script
└── README.md
```

## How It Works

### 1. Upload via API (recommended)

Images are uploaded through the Sedon Services admin panel. Each upload:

1. Stores the raw image in `images/{folder}/{uuid}.{ext}`
2. Creates a JSON trigger in `staging/{folder}/{uuid}.json`
3. Returns a CDN URL for immediate use

### 2. AVIF Conversion (automatic)

When a JSON trigger is pushed to `staging/`, the GitHub Actions workflow:

1. Runs `scripts/process-images.js` using Sharp
2. Converts non-AVIF images to AVIF format (target ~300KB, binary-search quality)
3. Keeps the original file (AVIF inputs are left untouched)
4. Removes the staging JSON trigger
5. Commits and pushes changes
6. Notifies the Sedon VPS webhook with URL mappings

The webhook then updates all database records to reference the AVIF URLs.

### 3. CDN Delivery

All images are served via **jsDelivr CDN**:

```
https://cdn.jsdelivr.net/gh/Nwachukwuchinedu/sedon-assets@main/images/{folder}/{uuid}.{ext}
```

## Uploading Manually

You can push images directly to `images/{folder}/` without using the API:

- **Non-AVIF files** (JPEG, PNG, WEBP, GIF, TIFF) — will be converted to AVIF automatically on next push to `staging/`
- **AVIF files** — passed through as-is, no conversion applied
- **No JSON trigger needed** for direct manual uploads (but AVIF conversion won't run unless a trigger exists)

### Triggering AVIF conversion manually

To trigger conversion for a manually uploaded image, create a JSON trigger file:

```json
{
  "folder": "products",
  "stem": "<uuid>",
  "ext": "jpg"
}
```

Push this to `staging/products/<uuid>.json` and the workflow will process it.

## Repository Secrets

Configured in **Settings → Secrets and variables → Actions**:

| Secret | Purpose |
|--------|---------|
| `WEBHOOK_SECRET` | Shared secret for webhook authentication |
| `SEDON_WEBHOOK_URL` | HTTPS endpoint on the Sedon VPS for URL mapping updates |

## Local Development

### Prerequisites

- Node.js 20+
- A GitHub token with repo access

### Setup

Install dependencies and run the pipeline setup:

```bash
npm install
npx tsx scripts/setup-asset-pipeline.ts
```

## Notes

- Images are stored permanently in this repo; no automated cleanup runs
- Stale images from deleted/replaced products can be cleaned via the Sedon admin panel (Settings → Cloud Image Asset Manager)
- The `images/` directory is committed as part of the repo — cloning includes all assets
