# AVANI+ Email Server

Gmail SMTP sender for the User Request System. This runs on Render (plain Node)
because Cloudflare Workers cannot open raw TCP sockets, which Gmail SMTP needs.

```
Worker (hotel-user-request-system)  --HTTPS-->  this server  --SMTP-->  Gmail
```

## Endpoints

| Method | Path          | Auth                    | Purpose              |
| ------ | ------------- | ----------------------- | -------------------- |
| GET    | `/`           | none                    | Health check         |
| POST   | `/send-email` | `X-Email-Token` header  | Send one email       |

`POST /send-email` body:

```json
{
  "to": "approver@example.com",
  "subject": "Approval Required",
  "html": "<p>...</p>",
  "attachments": [
    { "filename": "Request-REQ1.html", "content": "<base64>", "contentType": "text/html; charset=utf-8" }
  ]
}
```

`attachments` is optional. `content` must be base64.

## Environment variables

| Name                 | Required | Notes                                                |
| -------------------- | -------- | ---------------------------------------------------- |
| `GMAIL_USER`         | yes      | Sender Gmail address                                 |
| `GMAIL_APP_PASSWORD` | yes      | Google **App Password**, not the account password     |
| `EMAIL_API_TOKEN`    | yes      | Shared secret; requests without it are rejected (401) |
| `FROM_NAME`          | no       | Display name, defaults to `AVANI+ User Request System` |

Without `EMAIL_API_TOKEN` the server rejects every request — this endpoint can
send mail through our Gmail account, so it must not be open to the internet.

## Deploy to Render

1. Push this repo to GitHub.
2. In Render: **New → Web Service**, connect the repo.
3. Settings:
   - Root Directory: `email-server`
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Instance Type: Free
4. Add the three environment variables above.
5. Deploy, then note the URL, e.g. `https://avani-email-server.onrender.com`.

## Point the Worker at it

```bash
cd ..
npx wrangler secret put EMAIL_SERVICE_URL   # https://<your-service>.onrender.com/send-email
npx wrangler secret put EMAIL_API_TOKEN     # same value as on Render
npx wrangler deploy
```

## Local run

```bash
npm install
cp .env.example .env    # fill in real values
node --env-file=.env server.js
```

## Free tier note

Render's free plan sleeps a service after ~15 minutes idle; the next request
takes roughly 30–60s while it wakes. Emails still arrive, but the API call that
triggers them is slow on a cold start.
