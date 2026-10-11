# Third Place

**Turn shared spaces into meaningful connections, through the assistant you already use.**

Third Place is a cafe-community prototype: an assistant-agnostic connection API
and a web demo that help people discover others with shared interests and
compatible activities. Gemini interprets a person's request and explains
potential matches; PostgreSQL-backed rules handle eligibility, opt-in, and
mutual consent. An introduction becomes a connection only after the other
person accepts.

For cafes, the idea is to make their existing space a place for communities,
conversation, and small gatherings, not just transactions.

## Live prototype

**[Open Third Place](https://third-place-648263923127.asia-south2.run.app)**

1. Choose **Try the fictional demo** to explore as Riya.
2. Ask **"I want to discuss AI and startups over coffee now."** Review the
   interpreted intent, then choose **Find my people**.
3. Ask Samir for an introduction, review the message, and send it. Choose
   **Switch to Samir to respond**, then accept or decline.
4. Reload the page. The introduction and connection state are saved in
   PostgreSQL, not simulated in browser storage.

You can also ask for a small group, switch fictional identities, change
discovery consent, or create a scoped API token under **For assistants**.
The deployment uses real Gemini 3.8 Flash, Cloud SQL for PostgreSQL 17, and
Cloud Run. Availability depends on the hackathon cloud project remaining active.

## Submission demo

- [Watch or download the 59.5-second concept video](video/output/third-place-teaser.mp4)
- [Video poster](video/output/third-place-poster.png)
- [Captions](video/output/third-place-teaser.srt)
- [Video source and production notes](video/README.md)

The video is an original illustrated concept demo with fictional profiles and
a scripted assistant interface. It is **not live application footage** or an
official integration with an existing assistant.

## What is in this repository

- A React and TypeScript web interface for describing an activity, reviewing
  intent and matches, requesting introductions, and accepting or declining them.
- A Node.js API with an OpenAPI description and an example external assistant
  client. The API boundary is designed to work across assistants.
- Server-side Gemini integration for structured intent interpretation and
  explanations grounded in candidate records.
- A PostgreSQL schema and persistence layer for profiles, interests, cafes,
  gatherings, consent, sessions, introductions, and connections.
- Fictional demo identities, explicit opt-in controls, actor-bound assistant
  tokens, and separate request and acceptance steps.
- A Dockerfile and Google Cloud SQL connector integration for the live
  Google Cloud Run deployment, with its database password in Secret Manager.

**Status:** A deployed hackathon prototype, not a production social network or
production identity system. The live demo performs real Gemini requests and
stores discovery, consent, introductions, and connections in PostgreSQL.
All seeded profiles, cafes, availability, and gatherings are fictional and
do not represent real people currently present.

## Architecture

```text
Web demo or external assistant
              |
      Third Place HTTP API
         /           \
  Gemini intent     PostgreSQL
  and explanations  discovery, consent, connections
```

Gemini does not grant consent or automatically send introductions. The caller
must explicitly confirm intent and request an introduction; the recipient must
separately accept it. Matching uses cafe-level context, not precise GPS.

## Run locally

Requires Node.js 22 or newer, a real PostgreSQL database, and Google credentials
authorized to use an available Gemini model. There is no in-memory database or
canned AI fallback.

```powershell
npm ci
Copy-Item .env.example .env
```

Fill in the ignored `.env` file with your own database configuration and
server-side Google credentials, project, and location. For Cloud SQL, use the
`INSTANCE_CONNECTION_NAME` and `DB_*` variables instead of `DATABASE_URL`.
Choose an accessible model with `npm run models`, then set `GEMINI_MODEL`.
Do not publish `.env`, credentials, or authentication state.

```powershell
npm run build
npm start
```

Open `http://localhost:8080`. The server applies the schema on startup when
`MIGRATE_ON_START=true`; use a dedicated development database.

For development, run `npm run dev` and `npm run dev:web` in separate terminals.

## Run the checks

```powershell
npm run check
npm test
$env:TEST_BASE_URL = 'https://third-place-648263923127.asia-south2.run.app'
npm run test:e2e
```

The API tests use a real configured PostgreSQL database and an explicitly
labeled AI test double to exercise consent, identity isolation, expiration,
and group capacity. They create isolated fictional worlds and clean up their
own data. Without database configuration, the database suite reports skipped.
The browser test uses the real Gemini-backed application and verifies accepted
and declined requests after reload, including the mobile layout. On Windows it
uses installed Microsoft Edge; on other platforms it uses Playwright Chromium.

## API entry points

The running server exposes its API description at `/openapi.json`.

| Endpoint | Purpose |
| --- | --- |
| `GET /api/health` | Check application and PostgreSQL readiness |
| `POST /api/v1/demo/session` | Start an isolated fictional demo |
| `POST /api/v1/intents` | Interpret a request with Gemini |
| `POST /api/v1/discoveries` | Discover eligible matches after intent confirmation |
| `POST /api/v1/introductions` | Explicitly request an introduction |
| `POST /api/v1/introductions/{id}/respond` | Accept or decline as the recipient |
| `PATCH /api/v1/me/consent` | Change opt-in preferences |
| `POST /api/v1/assistant-tokens` | Create an actor-bound assistant token |

See [the assistant client example](examples/assistant-client.mjs) and
[the database schema](database/schema.sql) for the integration boundary and
persistence model. External assistant support is an API capability, not a claim
of shipped integrations with named assistant products.
