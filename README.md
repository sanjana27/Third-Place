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
- A Dockerfile and Google Cloud SQL connector integration for the intended
  Google Cloud Run deployment.

**Status:** This is an in-progress hackathon prototype. The application source
and concept video are available here. A public live application and a complete
deployed end-to-end demonstration are not yet available. All seeded profiles,
cafes, availability, and gatherings are fictional.

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

## API entry points

The running server exposes its API description at `/openapi.json`.

| Endpoint | Purpose |
| --- | --- |
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
