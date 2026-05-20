# FourFive CRM — Deployment Guide

## What this is
AI-powered founder intelligence CRM. Scrapes Reddit, IndieHackers, ProductHunt daily.
Sends Telegram digests at 8 AM and 2 PM IST. Claude-powered AI analyst built in.

---

## Step 1 — Push to GitHub

```bash
cd fourfive-crm
git init
git add .
git commit -m "init: fourfive crm"
# Create a new repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/fourfive-crm.git
git push -u origin main
```

---

## Step 2 — Deploy to Vercel

1. Go to vercel.com → New Project
2. Import your GitHub repo
3. Framework: Next.js (auto-detected)
4. Click **Environment Variables** and add these one by one:

| Key | Value |
|-----|-------|
| `ANTHROPIC_API_KEY` | your new Anthropic key |
| `TELEGRAM_BOT_TOKEN` | your Telegram bot token |
| `TELEGRAM_CHAT_ID` | your Telegram chat ID |

5. Click **Deploy**

---

## Step 3 — Verify cron jobs

After deploy, go to:
Vercel Dashboard → Your Project → Settings → Crons

You should see 3 cron jobs:
- `30 2 * * *` → 8:00 AM IST digest
- `30 8 * * *` → 2:00 PM IST digest  
- `0 2 * * *` → 8:00 AM IST scrape

---

## Step 4 — Test Telegram

Once deployed, open your live URL + `/api/digest` in browser.
Check Telegram — you should receive the first digest within seconds.

---

## Step 5 — Your live CRM

Your CRM will be live at:
`https://fourfive-crm.vercel.app`

Bookmark it. Use it every morning.

---

## Environment Variables Reference

```
ANTHROPIC_API_KEY=sk-ant-...        # From platform.anthropic.com
TELEGRAM_BOT_TOKEN=XXXXXXXXX:AAA...  # From @BotFather
TELEGRAM_CHAT_ID=XXXXXXXXX           # From api.telegram.org/bot<TOKEN>/getUpdates
```

---

## Local development (optional)

Create `.env.local` in project root:
```
ANTHROPIC_API_KEY=your_key
TELEGRAM_BOT_TOKEN=your_token
TELEGRAM_CHAT_ID=your_chat_id
```

Then run:
```bash
npm install
npm run dev
```

Open http://localhost:3000
