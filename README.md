# MuseFlow Studio

A personal AI story-to-film workspace: shape a raw idea (or a cast of
characters you already have) into scenes, generate key frames, animate them
into motion clips, and assemble a rough cut — all in one pipeline.

## Stack

- **Next.js** (App Router) + React, deployed as a standard Next.js app
- **Tailwind CSS v4** for styling
- **Supabase** (Postgres + Storage) for project/scene/character persistence
  and generated media
- **OpenAI** (bring your own API key) for scene mapping and frame generation
- **Higgsfield** (bring your own API key) for image-to-video motion generation

## Pipeline

1. **Cast** — build reusable characters (upload a reference photo, or
   describe them and generate one) that persist across every project.
2. **Story spark** — write or dictate a raw idea.
3. **Scene map** — ChatGPT breaks the idea into scenes, weaving in any
   characters you've attached to the project.
4. **Frames** — generate a key image per scene, conditioned on a character's
   reference image when one is attached.
5. **Motion** — animate each frame into a video clip via Higgsfield.
6. **Edit room** — a rough-cut viewer and timeline over the finished clips.

Generated frames and clips are uploaded to Supabase Storage (public bucket
`museflow-media`) and referenced by URL, so nothing is lost on refresh.

## Local development

```bash
npm install
npm run dev
```

Open http://localhost:3000, then connect your own OpenAI and/or Higgsfield
API keys from the app's connections panel (⌁ icon in the top bar). Keys are
kept in `sessionStorage` only — never sent to Supabase or saved in a project.

## Deployment

This is a standard Next.js app — it deploys on Netlify (or any Next.js host)
with zero extra configuration beyond `netlify.toml` already in this repo.
Pushing to the connected branch triggers an automatic build and deploy.

## Database

Schema and storage bucket live in the `museflow-studio` Supabase project.
The project URL and anon key are safe-to-embed constants in
`app/lib/supabase.ts` — no environment variables are required to run this
app. Row-level security policies grant the anon key open access to the
`projects`, `scenes`, and `characters` tables and the `museflow-media`
bucket, matching this app's current no-login, single-user trust model.
