<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules
- App screens live under `src/routes/_authenticated/` with the shell (header, tabs, modals) in its `route.tsx`; `/` redirects to `/overview`. Why: all household data is private per account.
- Valuation, loan amortization and SIP projection are pure functions in `src/lib/{portfolio,finance,sip}.ts` with tests in `src/test/`. Why: money rules must be testable without the UI.
- NAV refresh and SIP unit auto-adds run in the `syncPortfolio` server function (mfapi.in AMFI mirror) on app load; client reads tables directly under RLS. Why: one idempotent writer for derived installments.
- CAS PDFs are parsed to text in the browser (pdfjs) and only the text goes to the AI gateway. Why: the PDF file never leaves the device.
- New accounts get the starting portfolio from the `seed_household` signup trigger. Why: first screen must show data without client-side seeding.
