# Nextflow
https://nextflow-auxs.vercel.app/ 

Nextflow is a multi-tool AI workspace built with Next.js, Clerk, Prisma, and Gemini-backed generation flows. The app includes separate workspaces for image generation, video generation, enhancer, Nano Banana Pro, video lipsync, and motion transfer.

## Main Features

- Image generation workspace with Gemini image flow
- Video generation workspace with persisted video history
- Enhancer workspace with asset-aware enhancement flow
- Nano Banana Pro workspace with separate API route
- Video Lipsync workspace with separate API route
- Motion Transfer workspace with separate API route
- Shared per-user session history in the sidebar

## Session System

The app now behaves closer to ChatGPT-style sessions:

- Clicking `New Session` starts a blank draft session in the UI
- A database session is not created immediately
- The real session is created on the first successful generate action
- The new session is then stored in sidebar history automatically
- The session title is derived from the first user prompt or generation request
- If the active session is deleted, the app returns to a blank draft state instead of auto-opening another old session
- The app no longer auto-selects the latest old session when session history reloads

This keeps session history cleaner and avoids empty `New Session` records with no real content.

## Session Titles

Session titles are generated centrally in `server/services/session.service.ts`.

Title rules:

- whitespace is collapsed
- invalid control and reserved characters are stripped
- empty input falls back to `New Session`
- long titles are trimmed to a safe length

Examples:

- Image prompt: `A cinematic rainy street in Tokyo at night`
- Stored title: `A cinematic rainy street in Tokyo at night`

- Motion transfer prompt summary: `Transfer uploaded motion onto dancer portrait. Match initial pose of video.`
- Stored title: `Transfer uploaded motion onto dancer portrait. Match...`

## Session History Storage

Session history is stored per authenticated user.

Each session can contain:

- chat messages
- image generations
- video generations

The sidebar session list shows:

- session title
- updated time ordering
- latest message preview
- preview thumbnail from the most recent image or video

## API Routes

### Shared Session Routes

- `GET /api/sessions`
- `POST /api/sessions`
- `GET /api/sessions/[sessionId]`
- `DELETE /api/sessions/[sessionId]`

### Tool Generation Routes

- `POST /api/generate`
- `POST /api/video/generate`
- `POST /api/enhance/generate`
- `POST /api/nano-banana/generate`
- `POST /api/video-lipsync/generate`
- `POST /api/motion-transfer/generate`

## Important Files

### Session Core

- `server/services/session.service.ts`
- `server/models/session.model.ts`
- `server/controllers/session.controller.ts`
- `server/routes/session.route.ts`

### Sidebar + Session UX

- `app/page.tsx`

### Tool Workspaces

- `app/workflow/image-workspace.tsx`
- `app/workflow/video-workspace.tsx`
- `app/workflow/enhancer-workspace.tsx`
- `app/workflow/nano-banana-workspace.tsx`
- `app/workflow/video-lipsync-workspace.tsx`
- `app/workflow/motion-transfer-workspace.tsx`

## Current Backend Notes

- Image generation uses the Gemini flow already wired in the repo
- Some video-like tools still use the project's current sample-video persistence pattern instead of true production video inference
- Session history and titles still work correctly for those tools because they all write through the shared session models

## Development

Install dependencies:

```bash
npm install
```

Run development server:

```bash
npm run dev
```

Run lint:

```bash
npm run lint
```

Run type-check:

```bash
npx tsc --noEmit
```

## What Changed In This Session Update

- `New Session` now creates a draft state instead of an immediate empty DB record
- active session selection no longer silently falls back to the newest old session
- deleting the active session returns the user to a blank draft state
- session titles are normalized and trimmed centrally
- video workspace history is cleared properly when no session is active

## Verification

The session update was verified with:

- `cmd /c npx tsc --noEmit`
- `npm run lint`

Lint currently passes with existing `img` warnings only.
