# DayOne100 Tools

Tools for student entrepreneurs at Team Academy Amsterdam, live at **https://tools.dayone100.nl**.

| Tool | Address | What it does |
| --- | --- | --- |
| Idea Check | `/ideacheck/` | Score business ideas, test hypotheses, talk to the AI Business Coach. Log in to save, or "Try it without an account": guest work stays only in that browser tab (sessionStorage) and the AI coach is off |
| Teacher view | `/ideacheck/teacher.html` | Every student's progress, class codes, CSV export, delete all student data |
| Purpose Finder | `/purpose/` | Values, strengths, interests and market, combined into a sweet spot that can be sent to Idea Check. No login: everything is stored in the browser only. Strengths feedback works by link: the student sends an `?ask=` link, the friend gets a `?fb=` reply link with the answers inside, and the student opens or pastes it on their own device. Nothing goes to Supabase, and the teacher view shows no Purpose Finder progress |
| Lemon Rush | `/lemonrush/` | 10-day lemonade stand mini game about funnels, pricing, supply bets and upgrades. No login, nothing stored except the best score in the browser |
| 55 Model Mixer | `/modelmixer/` | Business model pattern game: pick a market, draw two of 55 pattern cards (after the St. Gallen Business Model Navigator), build a model and check break-even. Learn tab with all 55 cards and a quiz. No login, answers stay in the browser |
| Profit Planner | `/profit/` | Three money calculators: yearly goal to sales per working day, break-even customers, and unit economics (contribution, CAC, LTV, LTV:CAC, payback). Tabs pass numbers to each other. No login, numbers stay in the browser |
| Offer Builder | `/offer/` | Value equation (dream outcome, likelihood, time, effort) with improvement tips, an offer stack of problems and solutions with value-to-price ratio, and a one-sentence offer with guarantee. No login, browser only |
| Channel Picker | `/channels/` | Seven questions rank warm outreach, content, cold outreach and paid ads, then a 30-day plan with a starter message and an outreach log with reply rate. No login, browser only |
| Growth Board | `/growth/` | Growth experiments scored on impact, confidence and ease, max three running, results and weekly check-ins. Works without login on the device; logged in with the Idea Check account it saves to Supabase and the teacher can read every board. Needs `supabase/growth.sql` run once |
| Press Release First | `/pressrelease/` | Amazon Working Backwards PR/FAQ: customer, headline, one-page press release, quotes (the customer quote is marked as imagined), customer and internal FAQ, and a list of what must be true with a test for each. Live preview and 11 review checks. Print, copy or download as Markdown. No login, browser only |
| Canvas Builder | `/canvas/` | Business Model Canvas in nine guided blocks (customer first, money last), live canvas, money check (revenue minus costs per month), eight canvas checks, riskiest assumptions with a test each. Download as Word (.docx, via the bundled `canvas/docx.umd.js`) or Markdown, copy or print. No login, browser only |
| Prompt Coach | `/prompt/` | RHODES prompt checker and builder (Role, Objective, Details, Examples, Sense check), one colour per part. Smart word rules tag each sentence (task, about you, audience, tone, format, content rule, example, sense check) with feedback: vague words, unclear "them", a/an, missing count, channel and audience mismatch. Optional AI check through the `coach` function for students logged in with their Idea Check account, which writes an improved prompt for the builder. Warns about personal data and blocks sending it to the AI. Copy or open in Claude or ChatGPT |

## How it fits together

- **GitHub Pages** hosts the pages from this repository. Every change to `main` goes live within a few minutes.
- **Supabase** (EU, Frankfurt) holds the logins, the class codes and each student's work. Students only see their own work. The teacher sees everything.
- **Claude API** answers the AI coach, through the `coach` function in Supabase. The API key lives only in Supabase's secrets.

## Files

| File | What it is |
| --- | --- |
| `config.js` | The Supabase Project URL and anon key. Both are public by design |
| `ideacheck/index.html` | The Idea Check tool with login and cloud saving |
| `ideacheck/teacher.html` | The teacher view |
| `supabase/schema.sql` | Tables, access rules, class-code check, delete function. Run once |
| `supabase/growth.sql` | The Growth Board table and its access rules, for an existing setup. Run once |
| `ui.css` | Shared look for Offer Builder, Channel Picker and Growth Board |
| `supabase/functions/coach/index.ts` | The AI function. Deploy as `coach` |
| `.github/workflows/keep-awake.yml` | Pings Supabase every 3 days so the free plan does not pause |
| `CNAME` | The custom domain for GitHub Pages |

## Setup, once

### 1. Supabase

1. **SQL Editor:** paste all of `supabase/schema.sql` and click Run.
2. **Project Settings > API:** copy the Project URL and the anon public key into `config.js` (or send them to Claude).
3. **Authentication > Providers:** keep Email on. Turn off "Confirm email" for the pilot. The built-in mail only sends a few emails an hour.
4. **Authentication > URL Configuration:** set Site URL to `https://tools.dayone100.nl/ideacheck/`.
5. **Edge Functions > Secrets:** add `ANTHROPIC_API_KEY` with your Claude API key. Optional: `DAILY_LIMIT` (default 40 AI calls per student per day) and `ANTHROPIC_MODEL` (default `claude-haiku-5-5`).
6. **Edge Functions:** create a function named `coach`, paste `supabase/functions/coach/index.ts`, and deploy.

### 2. GitHub Pages and the subdomain

1. **Repository Settings > Pages:** Source "Deploy from a branch", branch `main`, folder `/ (root)`.
2. **Custom domain:** `tools.dayone100.nl` (already in the `CNAME` file).
3. **At your domain registrar:** add a DNS record `CNAME`, name `tools`, pointing to `<your-github-username>.github.io`.
4. When the check turns green, tick **Enforce HTTPS**.

### 3. Make yourself teacher

1. Open `https://tools.dayone100.nl/ideacheck/`, choose Sign up, and use class code `PILOT2026`.
2. In Supabase SQL Editor, run, with your own email:

   ```sql
   update public.profiles set role = 'teacher' where email = 'you@dayone100.nl';
   ```

3. Log out and in again. A "Teacher view" button appears. Create the real class codes there and close `PILOT2026`.

## Every school year

- Create new class codes in the teacher view and close the old ones.
- At the end of the year, use **Delete all student data** in the teacher view.

## Privacy

Stored per student: first name, email, class code, their Idea Check work and their Growth Board (when logged in). Purpose Finder, Idea Check in guest mode and the other tools store nothing on a server: answers stay in the student's browser. No grades. Data sits in Supabase's EU (Frankfurt) region and is deleted at the end of each school year.

## Not on the overview page

| Page | Path | What it is |
|---|---|---|
| The Builder's Journey | `/journey/` | Workshop 9 recap of Building with No-Code (0205EE): eight clickable stops that light up once recapped, the real slides per model, a quick check, a teach-back challenge with a 2-minute timer, reflections saved in the browser, and the red thread at the end. Slide images in `journey/img/` |
