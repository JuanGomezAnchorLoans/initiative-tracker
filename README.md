# Project Board

A Trello-style board (5 project columns, growable) backed live by two Notion
databases. Every edit on the site — renaming a project, adding a subtask,
dragging a card to another column, changing a status — writes straight to
Notion. The page also polls every 20 seconds, so edits made directly inside
Notion show up on the site too.

Two databases already exist in your Notion workspace, created for this:

- **Trello Board – Projects** — https://app.notion.com/p/6a4020da46454c8d8deaaae9dd148af5
- **Trello Board – Subtasks** — https://app.notion.com/p/373713dcf4424fa0a1232458203b936c

(5 starter project rows — "Project 1"–"Project 5" — are already in there; rename
or delete them from the site once it's live.)

## 1. Create a Notion integration

1. Go to **notion.so/my-integrations** → **New integration**.
2. Give it a name (e.g. "Project Board"), pick your workspace, and create it.
3. Copy the **Internal Integration Secret** — this is your `NOTION_TOKEN`.
4. Open each of the two databases above in Notion → **···** menu (top right)
   → **Connections** → add your new integration to both. Without this step
   the API calls will fail with a 404, even with a valid token.

## 2. Deploy to Vercel

1. Push this folder to a GitHub repo (or drag-and-drop deploy via the Vercel
   dashboard / `vercel` CLI directly from this folder).
2. In Vercel, import the project. No build settings are needed — it's a
   static site plus a few serverless functions in `/api`.
3. In **Project Settings → Environment Variables**, add:

   | Key | Value |
   |---|---|
   | `NOTION_TOKEN` | the secret from step 1 |
   | `NOTION_PROJECTS_DB_ID` | `6a4020da46454c8d8deaaae9dd148af5` |
   | `NOTION_SUBTASKS_DB_ID` | `373713dcf4424fa0a1232458203b936c` |
   | `BOARD_ACCESS_CODE` | optional — see below |

4. Deploy. Your board is live at the assigned `*.vercel.app` URL.

## 3. (Recommended) Lock it with an access code

The moment this is on Vercel, the URL is public — anyone with the link could
edit your Notion data. Set `BOARD_ACCESS_CODE` to any string you choose and
the site will ask for that code once before it loads or accepts edits (it's
stored in the visitor's browser after that, not a full login system — good
enough for a small team, not for anything sensitive). Leave it unset to skip
this entirely.

## How it's structured

```
index.html, styles.css, app.js   → the board itself (no build step)
api/board.js                     → GET: fetches all projects + subtasks
api/projects.js                  → POST: create a project (column)
api/projects/[id].js             → PATCH / DELETE a project
api/subtasks.js                  → POST: create a subtask
api/subtasks/[id].js             → PATCH / DELETE a subtask (incl. moving
                                    it to another project or reordering)
api/lib/notion.js                → shared Notion API calls + property mapping
```

The API routes are the only thing that ever see your `NOTION_TOKEN` — it
never reaches the browser.

## Local development

```
npm i -g vercel
vercel dev
```

Copy `.env.example` to `.env` and fill in `NOTION_TOKEN` first.

## Known limits

- Deleting a project archives (not permanently deletes) it and its subtasks
  in Notion — recoverable from Notion's trash for 30 days.
- Two people editing the same field at the exact same moment: last write
  wins, same as Notion itself.
- Owner is a free-text name, not a real Notion person — simplest option
  since board visitors won't all be Notion workspace members.
