# Smart Mentor — Front-End Product Demo

A static, responsive website for **Smart Mentor**, an AI-powered college success and career development platform concept for U.S. college students. It includes a public landing page and a fully interactive student dashboard demo.

> **Important:** This version contains **no AI and no backend**. Personalized plans and interview feedback are produced by deterministic, rule-based JavaScript, and all data is stored in the browser's `localStorage`. The interface labels this clearly wherever it matters.

---

## Files

| File | Purpose |
|---|---|
| `index.html` | Landing page: nav, hero, value, features, how it works, skill tracks, dashboard preview, example use cases, pricing, FAQ, footer, onboarding wizard |
| `dashboard.html` | Interactive student dashboard (9 views, hash-routed) |
| `checkout.html` | Upgrade to Plus page → sends students to Stripe's secure payment page |
| `login.html` | Log in / create account page, plus "Explore the demo account" |
| `info.html` | About, Contact, Privacy Policy and Terms of Service **templates** (linked from the footer) |
| `styles.css` | Complete design system (CSS variables) and all responsive styles |
| `script.js` | All interactions, sample content, demo state, and rule-based logic |
| `favicon.svg` | Brand icon |
| `google-sheet-script.gs` | Paste into Google Apps Script to receive sign-ups in a Google Sheet |

## Run it locally

**Option A — open directly:** double-click `index.html`. Works in Chrome, Edge, and Firefox.

**Option B — recommended, use a local server** (avoids browser restrictions on `file://` pages):

```bash
cd smart-mentor
python3 -m http.server 8000
# then open http://localhost:8000
```

Or in VS Code, install the **Live Server** extension → right-click `index.html` → *Open with Live Server*.

An internet connection is needed for the Inter font (Google Fonts) and the Lucide icons (unpkg CDN). Without it, the site still works using system fonts, just without icons.

## What's functional

**Landing page**
- Sticky header, accessible mobile menu (Esc closes it)
- Keyboard-accessible skill-track tabs (arrow keys, Home/End)
- FAQ accordion
- 5-step onboarding wizard: validation, Back/Continue without losing answers, draft auto-saved, deterministic plan generated from answers, saved to `localStorage`, then opens the dashboard
- `index.html#start` opens the wizard directly

**Log in & accounts (browser-only)**
- **Log In** opens `login.html`. Students can create an account (first name + email) and get their own empty workspace, log back in later with the same email, or explore the sample demo account (Alex).
- Each account's data is stored separately in this browser. The dashboard sends anyone who isn't signed in to the login page.
- Finishing onboarding while signed out asks the student to create an account, then saves the plan to it.
- Log out is in the sidebar and in Settings.
- Passwords are stored only as a salted SHA-256 hash, never as plain text. Still, everything lives in one browser, so this is not bank-grade security, and accounts don't sync across devices — that needs a backend (see below).

**Dashboard (`dashboard.html#overview`, `#planner`, `#goals`, `#career`, `#skills`, `#portfolio`, `#resume`, `#interview`, `#settings`)**
- Overview: daily progress ring, remaining tasks, today's action plan with checkboxes, weekly chart, goals, skill progress, deadlines, career roadmap (computed from your real progress), achievements
- Study Planner: week view with previous/next week, add (validated), complete, delete tasks; "+" on any day pre-fills the date
- Goals: add with category and target date, slider progress, mark complete/reopen, delete, filters
- My Major & Career: 8 majors with example careers, skills, projects, activities ("add to today"), checkable next steps, "set as goal"
- Skill Builder: 5 tracks × 4 challenges with instructions and expected outcomes; complete, undo, save to portfolio
- Projects & Portfolio: add, edit, delete, skill tags, portfolio preview dialog
- Resume Builder: live formatted preview, import portfolio projects, print / save as PDF via the browser
- Interview Practice: 4 categories × 5 questions, reveal, answer, rule-based self-review checklist (clearly labeled)
- Settings: edit profile, retake onboarding, reset to sample data, or start with an empty workspace

Everything persists across refreshes in `localStorage` (key `smartMentor.demo.v1`).

## What would need a backend or real AI

| Capability | What's needed |
|---|---|
| Secure accounts with passwords, password reset, syncing across devices | Authentication (e.g., Supabase, Firebase, Auth0) + database |
| AI-personalized daily plans and challenges | Server-side calls to an LLM API (never put API keys in front-end code) |
| AI resume review and interview feedback | Same — server endpoint + prompt design + human-review safeguards |
| Payments for Plus | Stripe (or similar) Checkout + webhooks |
| Public portfolio pages | Hosting + user-generated pages |
| Calendar import, reminders, email | Integrations (Google Calendar, email service), scheduled jobs |
| Analytics | Privacy-respecting analytics with a consent banner |

## Customization guide

**Colors, spacing, fonts** — edit the variables at the top of `styles.css` (`--navy`, `--primary`, `--purple`, `--radius-*`, `--shadow-*`, etc.).

**Pricing** — change `CONFIG.pricing.plusMonthly` at the top of `script.js`; every `[data-price-plus]` element updates automatically.

**Content** — all sample content lives in section 3 of `script.js`:
- `MAJORS` — majors, careers, skills, projects, activities, next steps
- `TRACKS` — skill-building challenges (add a track and it appears automatically)
- `INTERVIEW` — question categories, tips, and relevance keywords
- `seedState()` — the "Alex" demo account (tasks, goals, portfolio, achievements)
- `generatePlan()` — the rules that build the onboarding plan

**Legal and contact** — replace every highlighted placeholder in `info.html`, and have a qualified attorney review the Privacy Policy and Terms before launch.

**Logo** — the compass mark is an inline SVG in each HTML file and in `favicon.svg`.

**Resetting the demo** — Settings → *Reset to sample data*, or clear site data in your browser.

## Accessibility & responsiveness

- Semantic landmarks, skip link, labeled form controls, visible focus states
- Native `<dialog>` modals (focus handling and Esc to close)
- `aria-pressed`, `aria-expanded`, `aria-current`, progressbar roles, live regions for toasts
- Respects `prefers-reduced-motion`
- Tested at 1440px, 800px, and 375px with no horizontal overflow; dashboard sidebar becomes a drawer below 1024px

## Deploying

It's a static site — drag the folder into Netlify Drop, or push it to GitHub Pages or Vercel. No build step.


## Turn on real payments (Stripe Payment Link — no server needed)

The **Upgrade to Plus** buttons go to `checkout.html`. Until you connect Stripe, that page explains payments aren't connected and the button is disabled. Smart Mentor never collects card numbers itself.

1. Create a free account at **stripe.com** and finish the business verification Stripe asks for. You'll need your LLC or sole-proprietor details and a bank account.
2. In the Stripe Dashboard, go to **Product catalog → Add product**: name it "Smart Mentor Plus", choose **Recurring**, **Monthly**, **$9.99**.
3. Go to **Payment Links → New**, choose that product, then open **After payment → Don't show confirmation page → Redirect to your website** and enter:
   `https://YOUR-SITE/checkout.html?status=success&session_id={CHECKOUT_SESSION_ID}`
   (Stripe replaces `{CHECKOUT_SESSION_ID}` with the real ID, which is logged to your Google Sheet so you can match each upgrade to a payment in Stripe.)
4. Copy the link (it looks like `https://buy.stripe.com/...`) and paste it into `script.js`:
   ```js
   payments: { stripePaymentLink: 'https://buy.stripe.com/your-link' },
   ```
5. Test first with Stripe's **Test mode** link and the test card `4242 4242 4242 4242`, then switch to the live link.
6. Customers manage or cancel their subscription from the link in their Stripe receipt. You can also turn on Stripe's **Customer portal**.

**Limitation to know:** without a server, the site trusts the `?status=success` return to switch the account to Plus. Someone who knows that URL could unlock Plus without paying. That's acceptable while every feature is available on both plans. Once Plus has paid-only features, add a backend (for example Supabase plus a Stripe webhook) so the plan is set only after Stripe confirms payment.


## See your users' data (Google Sheet → Excel)

Each student's workspace (tasks, goals, resume) stays on their own device. The records you need as the owner — who signed up, their onboarding answers, and who upgraded — can be sent to a Google Sheet that you own. Passwords are never sent.

1. Create a new Google Sheet (sheets.new) and name it "Smart Mentor Users".
2. Click **Extensions → Apps Script**, delete the sample code, paste everything from `google-sheet-script.gs`, and click **Save**.
3. Click **Deploy → New deployment**, then the gear icon → **Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
   Click **Deploy**, approve the Google permissions prompt, and copy the **Web app URL** (it ends in `/exec`).
4. Paste that URL into `script.js`:
   ```js
   dataCollection: { googleSheetUrl: 'https://script.google.com/macros/s/XXXX/exec' },
   ```
5. Create a test account on your site. Within a few seconds, tabs named **Sign-ups**, **Logins**, **Profiles**, and **Upgrades** appear in the sheet.
6. To get Excel: **File → Download → Microsoft Excel (.xlsx)**.

Notes:
- The privacy policy in `info.html` already describes this collection. Keep it accurate if you change what's sent.
- Anyone who finds the Web App URL could post junk rows. That's fine at this stage. A real backend (Supabase or Firebase) is the long-term fix, and it also gives cross-device accounts and password reset.

## Sign-in behavior

- Signed-out visitors who open any dashboard or checkout link are sent to the login page before anything is shown.
- When signed in, the public pages show "Hi, Name", **My Dashboard**, and **Log out**.
- Log out (sidebar, Settings, or the public nav) ends the session immediately. Using the browser's Back button afterwards returns to the login page.
- Sessions expire: without "Keep me signed in", when the browser closes (24 hours at most); with it, after 30 days.

## Publish on GitHub Pages

1. Create a free GitHub account → **New repository** (for example `smart-mentor`), Public.
2. Click **uploading an existing file**, drag in every file from this folder (not the folder itself), and click **Commit changes**.
3. Go to **Settings → Pages** → Source: **Deploy from a branch** → Branch: `main`, folder `/ (root)` → **Save**.
4. After about a minute, your site is live at `https://YOUR-USERNAME.github.io/smart-mentor/`.
5. Use that address for the Stripe redirect URL (step 3 under payments).
6. To update the site later, upload the changed files to the repository again.
