/*!
 * Smart Mentor — front-end demo logic (vanilla JavaScript, no build step)
 *
 * IMPORTANT: Nothing in this file calls an AI model or a server.
 * "Personalized" plans and interview feedback come from deterministic,
 * rule-based JavaScript. All data is stored in the browser's localStorage.
 *
 * Sections
 *   1. Config
 *   2. Utilities
 *   3. Content data (majors, skill tracks, interview questions)
 *   4. Demo state & storage
 *   5. Shared UI (icons, toasts, dialogs, tabs)
 *   6. Landing page
 *   7. Onboarding wizard
 *   8. Dashboard (router + one renderer per view)
 *   9. Info page + boot
 */
(function () {
  'use strict';

  /* =========================================================
     1. CONFIG — edit these to customize the demo
     ========================================================= */
  const CONFIG = {
    storageKey: 'smartMentor.demo.v1',
    draftKey: 'smartMentor.onboardingDraft.v1',
    pricing: { plusMonthly: 9.99 }, // Proposed introductory price in USD
    payments: {
      // Paste your Stripe Payment Link here (Stripe Dashboard → Payment Links), e.g.
      // 'https://buy.stripe.com/abc123'. Leave empty and checkout explains that payments
      // aren't connected yet. See README → "Turn on real payments".
      stripePaymentLink: '',
    },
    dataCollection: {
      // Paste your Google Apps Script Web App URL here to receive sign-ups, onboarding
      // answers, and upgrades in a Google Sheet (download it as Excel anytime).
      // e.g. 'https://script.google.com/macros/s/AKfy.../exec'. See README → "See your users' data".
      googleSheetUrl: '',
    },
  };

  /* =========================================================
     2. UTILITIES
     ========================================================= */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => 'id' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  const pad = (n) => String(n).padStart(2, '0');
  const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseISO = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
  const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const todayISO = () => toISO(today());
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const isoOffset = (n) => toISO(addDays(today(), n));
  const isValidISO = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s)) && !isNaN(parseISO(s).getTime());
  const fmtDate = (s, opts = { month: 'short', day: 'numeric' }) => parseISO(s).toLocaleDateString('en-US', opts);
  const daysUntil = (s) => Math.round((parseISO(s) - today()) / 86400000);
  const startOfWeek = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }; // Monday
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const wordCount = (t) => (String(t).trim().match(/\S+/g) || []).length;

  /** Pure-JS SHA-256, used only when the browser's crypto.subtle isn't available. */
  function sha256js(str) {
    const s = unescape(encodeURIComponent(str));
    const K = []; const H = [];
    const isPrime = (n) => { for (let f = 2; f * f <= n; f++) if (n % f === 0) return false; return true; };
    const frac = (x) => ((x - Math.floor(x)) * 4294967296) | 0;
    for (let p = 2, i = 0; i < 64; p++) { if (isPrime(p)) { if (i < 8) H[i] = frac(Math.pow(p, 1 / 2)); K[i++] = frac(Math.pow(p, 1 / 3)); } }
    const total = (((s.length + 8) >> 6) + 1) * 16;
    const words = new Array(total).fill(0);
    for (let i = 0; i < s.length; i++) words[i >> 2] |= s.charCodeAt(i) << ((3 - (i % 4)) * 8);
    words[s.length >> 2] |= 0x80 << ((3 - (s.length % 4)) * 8);
    words[total - 1] = s.length * 8;
    const rotr = (x, n) => (x >>> n) | (x << (32 - n));
    let h = H.slice();
    for (let j = 0; j < total; j += 16) {
      const w = words.slice(j, j + 16);
      let [a, b, c, d, e, f, g, hh] = h;
      for (let i = 0; i < 64; i++) {
        if (i >= 16) {
          const w15 = w[i - 15]; const w2 = w[i - 2];
          w[i] = (w[i - 16] + (rotr(w15, 7) ^ rotr(w15, 18) ^ (w15 >>> 3)) + w[i - 7] + (rotr(w2, 17) ^ rotr(w2, 19) ^ (w2 >>> 10))) | 0;
        }
        const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
        const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      h = [a, b, c, d, e, f, g, hh].map((v, i) => (v + h[i]) | 0);
    }
    return h.map((v) => ('00000000' + (v >>> 0).toString(16)).slice(-8)).join('');
  }

  /** Salted SHA-256 hash so the password itself is never stored. */
  async function hashPassword(password, salt) {
    const input = salt + ':' + password;
    try {
      if (window.crypto && window.crypto.subtle) {
        const buf = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
        return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
      }
    } catch (e) { /* fall back below */ }
    return sha256js(input);
  }
  const newSalt = () => Array.from({ length: 4 }, () => Math.random().toString(36).slice(2, 10)).join('');
  const passwordProblem = (pw) => !pw ? 'Create a password.' : pw.length < 8 ? 'Use at least 8 characters.' : !/[A-Za-z]/.test(pw) || !/\d/.test(pw) ? 'Include at least one letter and one number.' : '';

  function relDay(s) {
    const n = daysUntil(s);
    if (n === 0) return 'Today';
    if (n === 1) return 'Tomorrow';
    if (n === -1) return 'Yesterday';
    if (n < 0) return `${Math.abs(n)} days ago`;
    if (n < 7) return parseISO(s).toLocaleDateString('en-US', { weekday: 'short' });
    return fmtDate(s);
  }

  function greeting() {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  }

  function formatPrice(n) { return '$' + Number(n).toFixed(2).replace(/\.00$/, ''); }

  /* =========================================================
     3. CONTENT DATA — sample content, safe to edit
     ========================================================= */
  const TASK_CATEGORIES = { 'Study': 'blue', 'Assignment': 'amber', 'Exam Prep': 'red', 'Skill Building': 'purple', 'Career': 'green', 'Wellness': 'teal' };
  const GOAL_CATEGORIES = { Academic: 'blue', Career: 'green', Skills: 'purple', Wellness: 'teal', Personal: 'amber' };
  const FOCUS_LABELS = { academic: 'Academic success', major: 'Choosing a major', skills: 'Building practical skills', career: 'Resume & interview prep', overall: 'Overall college & career success' };
  const SKILL_OPTIONS = ['JavaScript', 'Python', 'HTML/CSS', 'Git', 'SQL', 'Excel', 'Data Analysis', 'Research', 'Writing', 'Presentation', 'Design', 'Marketing', 'Financial Modeling', 'Project Management', 'Teamwork', 'Problem Solving'];

  const MAJORS = {
    'Computer Science': {
      icon: 'code-2', blurb: 'Design software, solve problems with code, and build tools people use every day.',
      careers: [
        { title: 'Software Developer', note: 'Builds and maintains applications and services.' },
        { title: 'Web Developer', note: 'Creates websites and web apps, front end or back end.' },
        { title: 'Data Analyst', note: 'Turns data into answers using SQL, Python, and charts.' },
        { title: 'IT Support Specialist', note: 'Keeps systems, devices, and users running smoothly.' },
      ],
      skills: ['Programming fundamentals', 'Data structures & algorithms', 'Version control (Git)', 'Databases & SQL', 'Debugging & testing', 'Technical communication'],
      projects: ['A personal portfolio website', 'A study-tracker or class-schedule app', 'A data dashboard built from a public dataset'],
      activities: ['Solve one programming challenge', "Read and annotate someone else's code", 'Write a README for a past class project'],
      nextSteps: ['Choose one language to go deep on this semester', 'Publish one project to a public repository', 'Visit your career center to learn internship timelines'],
    },
    'Business Administration': {
      icon: 'briefcase', blurb: 'Learn how organizations run, make decisions, and create value.',
      careers: [
        { title: 'Business Analyst', note: 'Studies processes and data to recommend improvements.' },
        { title: 'Operations Coordinator', note: 'Keeps day-to-day operations organized and efficient.' },
        { title: 'Project Coordinator', note: 'Tracks timelines, budgets, and team tasks.' },
        { title: 'Sales or Account Associate', note: 'Builds client relationships and grows revenue.' },
      ],
      skills: ['Spreadsheet analysis', 'Business writing', 'Presentations', 'Project management basics', 'Financial literacy', 'Teamwork & leadership'],
      projects: ['A SWOT analysis of a local business', 'A budget model for a student organization', 'A process-improvement proposal for a campus service'],
      activities: ['Summarize one business news story in three sentences', 'Practice a two-minute pitch', 'Rebuild a class spreadsheet with formulas'],
      nextSteps: ['Join a business or entrepreneurship club', 'Take a role with planning or budget responsibility', 'Ask a professor about case competitions'],
    },
    'Marketing': {
      icon: 'megaphone', blurb: 'Understand people, craft messages, and measure what works.',
      careers: [
        { title: 'Marketing Coordinator', note: 'Supports campaigns from planning to launch.' },
        { title: 'Social Media Specialist', note: 'Creates and manages content across platforms.' },
        { title: 'Content Strategist', note: 'Plans what to publish, where, and why.' },
        { title: 'Market Research Analyst', note: 'Studies customers and competitors with data.' },
      ],
      skills: ['Audience research', 'Copywriting', 'Campaign planning', 'Analytics basics', 'Design fundamentals', 'Brand storytelling'],
      projects: ['A campaign plan for a campus event', 'A content calendar for a student organization', 'A competitor analysis of two brands'],
      activities: ['Critique one ad you saw today', 'Write three headlines for the same product', "Track a social account's posts for a week"],
      nextSteps: ['Offer to run social media for a club', 'Build a small portfolio of sample content', "Learn one analytics tool's basics"],
    },
    'Finance': {
      icon: 'line-chart', blurb: 'Analyze numbers, manage risk, and help people and companies make money decisions.',
      careers: [
        { title: 'Financial Analyst', note: 'Builds models and reports that guide decisions.' },
        { title: 'Client Associate', note: 'Supports advisors and clients at banks or wealth firms.' },
        { title: 'Accounting Associate', note: 'Records, reconciles, and reports financial activity.' },
        { title: 'Risk or Compliance Analyst', note: 'Helps organizations follow rules and manage risk.' },
      ],
      skills: ['Excel modeling', 'Financial statement analysis', 'Accounting fundamentals', 'Valuation basics', 'Attention to detail', 'Clear reporting'],
      projects: ['A summary of a public company\'s financial statements', 'A personal budgeting model', 'A ratio comparison of two competitors'],
      activities: ["Read one company's earnings summary", 'Rebuild a formula-driven model from scratch', 'Explain one financial term in plain English'],
      nextSteps: ['Join a finance or investment club', 'Practice spreadsheet shortcuts weekly', 'Research which certifications matter for your target role'],
    },
    'Psychology': {
      icon: 'brain', blurb: 'Study how people think, feel, and behave — and apply it to real problems.',
      careers: [
        { title: 'Research Assistant', note: 'Supports studies with data collection and analysis.' },
        { title: 'Human Resources Coordinator', note: 'Helps with hiring, onboarding, and employee programs.' },
        { title: 'Case Manager', note: 'Connects clients with services in social-service settings.' },
        { title: 'UX Researcher', note: 'Studies how people use products to improve them.' },
      ],
      skills: ['Research methods', 'Statistics', 'Interviewing & active listening', 'APA-style writing', 'Data interpretation', 'Research ethics'],
      projects: ['A literature summary on a topic you care about', 'A small survey with an analyzed results summary', 'A user-interview report for a campus app'],
      activities: ["Summarize one study's method and findings", 'Practice reflective listening in a conversation', 'Make one chart from survey data'],
      nextSteps: ['Ask a professor about research assistant openings', 'If graduate school interests you, review requirements early', 'Volunteer in a setting related to your interests'],
    },
    'Nursing': {
      icon: 'heart-pulse', blurb: 'Prepare to provide skilled, compassionate patient care.',
      careers: [
        { title: 'Registered Nurse (after licensure)', note: 'Provides and coordinates patient care.' },
        { title: 'Clinical Research Coordinator', note: 'Manages day-to-day operations of clinical studies.' },
        { title: 'Public Health Educator', note: 'Teaches communities about health and prevention.' },
        { title: 'Care Coordinator', note: 'Helps patients navigate treatment and services.' },
      ],
      skills: ['Clinical reasoning', 'Patient communication', 'Care documentation', 'Medical terminology', 'Time management under pressure', 'Interprofessional teamwork'],
      projects: ['A patient-education handout on a common topic', 'A study guide for a difficult course unit', 'A reflection log from clinical rotations'],
      activities: ['Review one care concept with flashcards', 'Practice explaining a procedure in plain language', 'Write a short reflection after a clinical day'],
      nextSteps: ["Follow your program's licensure exam timeline", 'Seek volunteer or work experience in a care setting', 'Ask clinical instructors for specific feedback'],
    },
    'Engineering': {
      icon: 'cog', blurb: 'Apply math and science to design, build, and improve systems.',
      careers: [
        { title: 'Design Engineer', note: 'Develops products and components from concept to spec.' },
        { title: 'Process Engineer', note: 'Improves how things are manufactured or produced.' },
        { title: 'Quality Engineer', note: 'Makes sure products meet standards and requirements.' },
        { title: 'Test Engineer', note: 'Plans and runs tests to validate designs.' },
      ],
      skills: ['Math & physics foundations', 'CAD', 'Technical problem solving', 'Data analysis', 'Project documentation', 'Team design work'],
      projects: ['A small design project with documented requirements', 'A data analysis of a lab experiment', 'A process map that improves a simple workflow'],
      activities: ['Solve one applied problem from your course', 'Sketch and annotate a product teardown', 'Write a one-page design rationale'],
      nextSteps: ['Join a project team such as robotics or design-build', 'Learn one CAD or analysis tool well', 'Ask whether your school offers co-op programs'],
    },
    'Biology': {
      icon: 'microscope', blurb: 'Explore living systems through observation, experiments, and data.',
      careers: [
        { title: 'Laboratory Technician', note: 'Runs experiments and maintains lab equipment.' },
        { title: 'Research Assistant', note: 'Supports academic or industry research projects.' },
        { title: 'Environmental Technician', note: 'Collects and analyzes field samples.' },
        { title: 'Health-related roles (with further training)', note: 'Many health careers build on a biology foundation.' },
      ],
      skills: ['Lab techniques', 'Scientific writing', 'Data analysis', 'Experimental design', 'Attention to detail', 'Literature review'],
      projects: ['A lab report rewritten for a general audience', 'A data chart from a public dataset', 'A literature review summary on one topic'],
      activities: ['Summarize one journal article abstract', 'Practice one statistics concept', 'Draw a diagram explaining a biological process'],
      nextSteps: ['Ask about undergraduate research opportunities', 'Compare lab, field, and health career paths', "Keep a record of techniques you've practiced"],
    },
  };
  const MAJOR_LIST = Object.keys(MAJORS);
  const MAJOR_TRACK = { 'Computer Science': 'cs', 'Engineering': 'cs', 'Business Administration': 'business', 'Marketing': 'marketing', 'Finance': 'finance', 'Psychology': 'research', 'Nursing': 'research', 'Biology': 'research' };

  const TRACKS = {
    cs: {
      name: 'Computer Science', icon: 'code-2',
      challenges: [
        { id: 'cs-1', title: 'Build a to-do list in plain JavaScript', category: 'Web Development', difficulty: 'Beginner', minutes: 45,
          steps: ['Create an HTML page with a text input and an Add button.', 'Add each new task to a list when the button is clicked.', 'Let users remove a task with a delete button.', 'Save the list to localStorage so it survives a refresh.'],
          outcome: 'A small working app you can publish and describe in your portfolio.' },
        { id: 'cs-2', title: 'Solve three array challenges', category: 'Problem Solving', difficulty: 'Beginner', minutes: 30,
          steps: ['Reverse an array without using a built-in reverse function.', 'Find the second-largest number in an array.', 'Remove duplicates while keeping the original order.', 'Write one sentence describing the time complexity of each solution.'],
          outcome: 'Practice explaining your reasoning — a core technical-interview skill.' },
        { id: 'cs-3', title: 'Learn the Git basics', category: 'Version Control', difficulty: 'Beginner', minutes: 25,
          steps: ['Create a repository and make your first commit.', 'Create a branch, change a file, and commit again.', 'Merge the branch back into main.', 'Write a clear README that explains the project.'],
          outcome: 'A repository history that shows you work the way software teams do.' },
        { id: 'cs-4', title: 'Plan a portfolio project', category: 'Project Planning', difficulty: 'Intermediate', minutes: 40,
          steps: ['Pick a problem that a student you know actually has.', 'List three core features and two stretch features.', 'Sketch the main screens on paper.', 'Break the build into five tasks of under an hour each.'],
          outcome: 'A scoped project plan you can start building this week.' },
      ],
    },
    business: {
      name: 'Business', icon: 'briefcase',
      challenges: [
        { id: 'bus-1', title: 'Analyze a company you use every week', category: 'Business Analysis', difficulty: 'Beginner', minutes: 35,
          steps: ['Choose a public company whose product you use.', 'Identify its customers, main products, and how it makes money.', 'Write a SWOT analysis with two points in each box.', 'Summarize your view of the company in five sentences.'],
          outcome: 'A one-page company brief you can reference in interviews.' },
        { id: 'bus-2', title: 'Build a simple budget model', category: 'Spreadsheets', difficulty: 'Beginner', minutes: 40,
          steps: ['Create columns for month, revenue, costs, and profit.', 'Use formulas instead of typed totals.', 'Add an input cell for monthly growth rate.', 'Chart profit over 12 months.'],
          outcome: 'A spreadsheet that updates automatically when assumptions change.' },
        { id: 'bus-3', title: 'Practice a three-minute presentation', category: 'Communication', difficulty: 'Intermediate', minutes: 30,
          steps: ['Pick a topic from one of your classes.', 'Outline an opening, three key points, and a close.', 'Record yourself presenting once.', 'Note two things to improve and record a second take.'],
          outcome: 'A noticeably stronger second take — and a habit you can repeat.' },
        { id: 'bus-4', title: 'Write a mini business case', category: 'Strategy', difficulty: 'Intermediate', minutes: 45,
          steps: ['Define a problem a campus business or club faces.', 'Propose two possible solutions.', 'Compare their costs, benefits, and risks in a table.', 'Recommend one option and explain your reasoning.'],
          outcome: 'A short case study that shows structured thinking.' },
      ],
    },
    marketing: {
      name: 'Marketing', icon: 'megaphone',
      challenges: [
        { id: 'mkt-1', title: 'Define a target audience', category: 'Market Research', difficulty: 'Beginner', minutes: 30,
          steps: ['Pick a product or a campus event.', 'Write two audience personas with goals and frustrations.', 'List where each persona spends time online.', 'Note which message would matter most to each.'],
          outcome: 'Two personas you can reuse in a campaign plan.' },
        { id: 'mkt-2', title: 'Design a mini campaign', category: 'Campaign Strategy', difficulty: 'Intermediate', minutes: 45,
          steps: ['Set one measurable goal, such as event sign-ups.', 'Choose two channels and explain why.', 'Draft a two-week timeline.', 'Write the key message in one sentence.'],
          outcome: 'A one-page campaign plan for your portfolio.' },
        { id: 'mkt-3', title: 'Create three social posts', category: 'Content Creation', difficulty: 'Beginner', minutes: 30,
          steps: ['Write captions for three posts with different angles.', 'Describe or sketch the visual for each.', 'Add a clear call to action.', 'Adapt one post for a second platform.'],
          outcome: 'Sample content that shows your writing range.' },
        { id: 'mkt-4', title: 'Measure campaign performance', category: 'Analytics', difficulty: 'Intermediate', minutes: 35,
          steps: ['Use these sample numbers: 12,000 impressions, 480 clicks, 36 sign-ups.', 'Calculate the click-through rate and the conversion rate.', 'Identify the weakest stage of the funnel.', 'Propose one test to improve it.'],
          outcome: 'Practice turning numbers into a recommendation.' },
      ],
    },
    finance: {
      name: 'Finance', icon: 'line-chart',
      challenges: [
        { id: 'fin-1', title: 'Spreadsheet modeling basics', category: 'Financial Modeling', difficulty: 'Beginner', minutes: 35,
          steps: ['Build a savings projection with inputs for monthly deposit and interest rate.', 'Use absolute references for the input cells.', 'Add a scenario table for three different rates.', 'Check one month\'s result by hand.'],
          outcome: 'A clean, input-driven model — the foundation of financial modeling.' },
        { id: 'fin-2', title: 'Read an income statement', category: 'Financial Analysis', difficulty: 'Beginner', minutes: 30,
          steps: ["Open a public company's annual report.", 'Find revenue, gross profit, operating income, and net income.', 'Calculate gross margin and net margin.', 'Write what changed compared with the prior year.'],
          outcome: 'A margin summary you can explain in an interview.' },
        { id: 'fin-3', title: "Compare two companies' ratios", category: 'Financial Analysis', difficulty: 'Intermediate', minutes: 45,
          steps: ['Pick two companies in the same industry.', 'Calculate current ratio, debt-to-equity, and net margin for each.', 'Put the results side by side in a table.', 'Write which looks financially stronger and why.'],
          outcome: 'A comparison table that shows analytical judgment.' },
        { id: 'fin-4', title: 'Build a sample company analysis', category: 'Valuation', difficulty: 'Intermediate', minutes: 60,
          steps: ["Summarize the company's business in one paragraph.", 'Chart a three-year revenue trend.', 'List the three biggest risks.', 'Write a short view of the company with your assumptions clearly labeled.'],
          outcome: 'A portfolio-ready analysis — clearly labeled as a learning exercise, not investment advice.' },
      ],
    },
    research: {
      name: 'Research & Science', icon: 'flask-conical',
      challenges: [
        { id: 'rs-1', title: 'Summarize a peer-reviewed article', category: 'Research Literacy', difficulty: 'Beginner', minutes: 35,
          steps: ["Find a short article in your library's database on a topic from class.", 'Identify the research question, method, and main finding.', 'Write a 150-word plain-language summary.', 'Note one limitation the authors mention.'],
          outcome: 'A summary that shows you can read and explain research.' },
        { id: 'rs-2', title: 'Turn data into a clear chart', category: 'Data Analysis', difficulty: 'Beginner', minutes: 30,
          steps: ['Use a small dataset from class or a public source.', 'Choose the chart type that fits your question.', 'Label axes, units, and the title clearly.', 'Write two sentences explaining what the chart shows.'],
          outcome: 'A clear, honest chart you can include in reports.' },
        { id: 'rs-3', title: 'Write a structured lab-style summary', category: 'Scientific Writing', difficulty: 'Intermediate', minutes: 45,
          steps: ['Pick a recent lab or experiment.', 'Write purpose, method, results, and discussion on one page.', 'Keep results separate from interpretation.', 'Ask a classmate to check it for clarity.'],
          outcome: 'A writing sample that demonstrates scientific communication.' },
        { id: 'rs-4', title: 'Present findings in two minutes', category: 'Communication', difficulty: 'Intermediate', minutes: 25,
          steps: ['Choose one finding you have summarized.', 'Outline the context, the finding, and why it matters.', 'Record yourself presenting it.', "Cut anything that doesn't support the main point."],
          outcome: 'A concise explanation you can reuse in interviews.' },
      ],
    },
  };
  const ALL_CHALLENGES = Object.values(TRACKS).flatMap((t) => t.challenges);
  const findChallenge = (id) => ALL_CHALLENGES.find((c) => c.id === id);

  const INTERVIEW = {
    behavioral: { label: 'Behavioral', icon: 'users', items: [
      { id: 'b1', q: 'Tell me about a time you worked on a team and faced a disagreement.', tip: 'Use STAR: Situation, Task, Action, Result. Focus on what you did.', keys: ['team', 'disagree', 'conflict', 'listen', 'compromise', 'group', 'resolve'] },
      { id: 'b2', q: 'Describe a time you missed a deadline or made a mistake. What did you do?', tip: 'Own the mistake briefly, then spend most of your answer on how you fixed it.', keys: ['mistake', 'deadline', 'late', 'fix', 'responsib', 'learn'] },
      { id: 'b3', q: 'Tell me about a goal you set and how you achieved it.', tip: 'Show the plan and the steps, not just the result.', keys: ['goal', 'plan', 'step', 'achiev', 'progress'] },
      { id: 'b4', q: 'Give an example of a time you had to learn something quickly.', tip: 'Mention the resources you used and how you checked your understanding.', keys: ['learn', 'quick', 'new', 'practice', 'resource'] },
      { id: 'b5', q: 'Describe a situation where you showed leadership without a formal title.', tip: 'Leadership can be organizing, helping, or taking initiative.', keys: ['lead', 'initiative', 'organiz', 'team', 'help'] },
    ] },
    internship: { label: 'Internship', icon: 'briefcase', items: [
      { id: 'i1', q: 'Why are you interested in this internship?', tip: 'Connect the role to your goals and to something specific about the organization.', keys: ['interest', 'intern', 'company', 'learn', 'skill', 'role'] },
      { id: 'i2', q: 'What do you hope to learn from this experience?', tip: 'Name one or two concrete skills and why they matter to your path.', keys: ['learn', 'skill', 'experience', 'grow', 'goal'] },
      { id: 'i3', q: "Tell me about a class project you're proud of.", tip: 'Describe your specific role, a challenge, and the result.', keys: ['project', 'class', 'built', 'team', 'result'] },
      { id: 'i4', q: 'How do you balance coursework with other responsibilities?', tip: 'Describe your actual system — planner, priorities, weekly review.', keys: ['balance', 'schedule', 'priorit', 'time', 'plan'] },
      { id: 'i5', q: 'What skills would you bring to our team?', tip: 'Pick two skills and back each with a quick example.', keys: ['skill', 'team', 'strength', 'experience', 'example'] },
    ] },
    technical: { label: 'Technical', icon: 'cpu', items: [
      { id: 't1', q: "Walk me through how you would approach a problem you've never seen before.", tip: 'Clarify, break it down, try a simple version, then test and refine.', keys: ['problem', 'step', 'research', 'break', 'test'] },
      { id: 't2', q: 'Explain a technical concept from your major to someone outside your field.', tip: 'Use an everyday analogy and avoid jargon.', keys: ['explain', 'concept', 'example', 'simple', 'like'] },
      { id: 't3', q: 'Describe a project where you made a technical decision. What were the trade-offs?', tip: 'Name the options you considered and why you chose one.', keys: ['decision', 'trade', 'chose', 'option', 'because'] },
      { id: 't4', q: 'How do you check your work for errors before submitting it?', tip: 'Describe a repeatable process, not just "I double-check."', keys: ['check', 'review', 'test', 'error', 'verif'] },
      { id: 't5', q: 'Which tools or software are you most comfortable with, and how have you used them?', tip: 'Tie each tool to a real task or project.', keys: ['tool', 'software', 'used', 'project', 'experience'] },
    ] },
    general: { label: 'General career', icon: 'message-square', items: [
      { id: 'g1', q: 'Tell me about yourself.', tip: 'Present, past, future: what you study now, relevant experience, what you want next.', keys: ['major', 'interest', 'experience', 'goal', 'current', 'student'] },
      { id: 'g2', q: 'Where do you see yourself in three to five years?', tip: 'Show direction and growth without over-promising.', keys: ['year', 'goal', 'grow', 'career', 'skill'] },
      { id: 'g3', q: 'What is your greatest strength?', tip: 'Choose one strength and prove it with an example.', keys: ['strength', 'example', 'team', 'help'] },
      { id: 'g4', q: 'What is an area you are working to improve?', tip: "Pick something real, and show what you're doing about it.", keys: ['improv', 'working', 'weak', 'progress', 'learn'] },
      { id: 'g5', q: 'Do you have any questions for us?', tip: 'Ask about the team, what success looks like, or how interns learn.', keys: ['question', 'team', 'role', 'success', 'learn'] },
    ] },
  };

  /* =========================================================
     4. DEMO STATE & STORAGE
     ========================================================= */
  function emptyResume() {
    return { fullName: '', headline: '', email: '', phone: '', location: '', link: '', education: '', skills: '', projects: '', experience: '', activities: '' };
  }

  function seedState() {
    const t = (offset, title, category, minutes, done, desc) => ({ id: uid(), title, desc: desc || '', category, date: isoOffset(offset), minutes, done: !!done, source: 'sample' });
    return {
      version: 1,
      profile: { name: 'Alex', level: 'Undergraduate (4-year)', major: 'Computer Science', year: 'Sophomore', careerGoal: 'Software Developer', careerUnsure: false, minutes: 45, focus: 'overall', plan: 'free', onboarded: false },
      tasks: [
        t(0, 'Review Data Structures lecture notes', 'Study', 30, true, 'Focus on linked lists and stacks.'),
        t(0, 'Finish CS 201 problem set #4', 'Assignment', 45, false, 'Problems 3–6 on linked lists.'),
        t(0, 'Daily challenge: Learn the Git basics', 'Skill Building', 25, false, 'Open Skill Builder for step-by-step instructions.'),
        t(0, 'Update resume skills section', 'Career', 15, false, 'Add Git and JavaScript.'),
        t(0, 'Walk between classes — no phone', 'Wellness', 20, true),
        t(1, 'Start Calculus II exam review', 'Exam Prep', 60, false, 'Practice problems from chapters 6–7.'),
        t(2, 'Drop-in resume review at the career center', 'Career', 30, false),
        t(4, 'Calculus II midterm practice exam', 'Exam Prep', 90, false),
        t(6, 'Submit English 102 essay draft', 'Assignment', 40, false),
        t(-1, 'Read chapter 7 for Intro to Psychology', 'Study', 40, true),
        t(-2, 'Practice two interview questions', 'Career', 20, true),
        t(-2, 'Solve three array challenges', 'Skill Building', 30, true),
      ],
      goals: [
        { id: uid(), title: 'Raise my Calculus II grade to a B+', category: 'Academic', target: isoOffset(45), progress: 55, done: false },
        { id: uid(), title: 'Complete 10 skill challenges', category: 'Skills', target: isoOffset(30), progress: 20, done: false },
        { id: uid(), title: 'Apply to 5 summer internships', category: 'Career', target: isoOffset(60), progress: 40, done: false },
        { id: uid(), title: 'Build a personal portfolio website', category: 'Career', target: isoOffset(40), progress: 30, done: false },
        { id: uid(), title: 'Set up a weekly study schedule', category: 'Academic', target: isoOffset(-6), progress: 100, done: true },
      ],
      skills: { track: 'cs', completed: ['cs-2'], saved: [] },
      portfolio: [
        { id: uid(), name: 'Campus Study Room Finder', desc: 'Built a small web page that lists open study rooms by building, using HTML, CSS, and JavaScript. Learned how to structure data and filter it on the page.', skills: ['JavaScript', 'HTML/CSS', 'Git'], date: isoOffset(-20) },
      ],
      resume: emptyResume(),
      interview: { category: 'behavioral', positions: { behavioral: 0, internship: 0, technical: 0, general: 0 }, practiced: 2, answers: {} },
      career: { selectedMajor: 'Computer Science', stepsDone: {} },
      achievements: [
        { id: uid(), text: 'Completed challenge: Solve three array challenges', icon: 'award', date: isoOffset(-2) },
        { id: uid(), text: 'Goal completed: Set up a weekly study schedule', icon: 'target', date: isoOffset(-6) },
        { id: uid(), text: 'Added portfolio project: Campus Study Room Finder', icon: 'folder-open', date: isoOffset(-20) },
      ],
    };
  }

  function mergeDefaults(s) {
    const d = seedState();
    const arr = (v, fallback) => (Array.isArray(v) ? v : fallback);
    return {
      version: 1,
      profile: Object.assign({}, d.profile, s.profile),
      tasks: arr(s.tasks, d.tasks),
      goals: arr(s.goals, d.goals),
      skills: Object.assign({}, d.skills, s.skills, { completed: arr(s.skills && s.skills.completed, []), saved: arr(s.skills && s.skills.saved, []) }),
      portfolio: arr(s.portfolio, d.portfolio),
      resume: Object.assign(emptyResume(), s.resume),
      interview: Object.assign({}, d.interview, s.interview, { positions: Object.assign({}, d.interview.positions, s.interview && s.interview.positions), answers: Object.assign({}, s.interview && s.interview.answers) }),
      career: Object.assign({}, d.career, s.career),
      achievements: arr(s.achievements, d.achievements),
    };
  }

  /** A fresh, empty workspace for a newly created account. */
  function blankState(name) {
    const s = seedState();
    Object.assign(s.profile, { name: name || '', level: '', major: '', year: '', careerGoal: '', careerUnsure: true, minutes: 30, focus: 'overall', onboarded: false });
    s.tasks = []; s.goals = []; s.portfolio = []; s.achievements = [];
    s.skills = { track: 'cs', completed: [], saved: [] };
    s.interview.practiced = 0;
    return s;
  }

  /* ---------- Demo sign-in (browser-only) ----------
     There is no server, so "accounts" are a name + email saved in this
     browser's localStorage, and no password is used. Real, secure accounts
     need a backend (see README). Each account gets its own workspace. */
  const Auth = {
    sessionKey: 'smartMentor.session.v1',
    accountsKey: 'smartMentor.accounts.v1',
    pendingKey: 'smartMentor.pendingPlan.v1',
    stores() { const out = []; try { out.push(sessionStorage); } catch (e) { /* blocked */ } try { out.push(localStorage); } catch (e) { /* blocked */ } return out; },
    /** Returns the signed-in account id, or '' if signed out or the session expired. */
    get() {
      for (const store of this.stores()) {
        try {
          const raw = store.getItem(this.sessionKey);
          if (!raw) continue;
          let sess = null;
          try { sess = JSON.parse(raw); } catch (e) { sess = null; }
          if (sess && sess.id && sess.exp > Date.now()) return sess.id;
          store.removeItem(this.sessionKey); // expired or old format → signed out
        } catch (e) { /* ignore */ }
      }
      return '';
    },
    /** remember = true keeps you signed in on this device for 30 days; otherwise until the browser closes. */
    set(id, remember) {
      this.endSession();
      const sess = JSON.stringify({ id, exp: Date.now() + (remember ? 30 : 1) * 86400000 });
      try { (remember ? localStorage : sessionStorage).setItem(this.sessionKey, sess); } catch (e) { /* ignore */ }
    },
    endSession() { this.stores().forEach((st) => { try { st.removeItem(this.sessionKey); } catch (e) { /* ignore */ } }); },
    /** Full log out: ends the session and removes unsaved onboarding answers from this device. */
    clear() {
      this.endSession();
      try { localStorage.removeItem(CONFIG.draftKey); localStorage.removeItem(this.pendingKey); } catch (e) { /* ignore */ }
    },
    isDemo() { return this.get() === 'demo'; },
    accounts() { try { return JSON.parse(localStorage.getItem(this.accountsKey) || '{}') || {}; } catch (e) { return {}; } },
    saveAccounts(a) { try { localStorage.setItem(this.accountsKey, JSON.stringify(a)); } catch (e) { /* ignore */ } },
    current() { const id = this.get(); if (!id) return null; return id === 'demo' ? { name: 'Alex', email: '', demo: true } : this.accounts()[id] || null; },
    dataKey() { const id = this.get(); return !id || id === 'demo' ? CONFIG.storageKey : 'smartMentor.user.' + id; },
  };

  /** Sends a small record (never passwords) to your Google Sheet, if one is configured. */
  function sendToSheet(type, data) {
    const url = (CONFIG.dataCollection.googleSheetUrl || '').trim();
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url)) return;
    try {
      fetch(url, {
        method: 'POST', mode: 'no-cors', keepalive: true,
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(Object.assign({ type, sentAt: new Date().toISOString() }, data)),
      }).catch(() => { /* offline or blocked — the site keeps working */ });
    } catch (e) { /* ignore */ }
  }

  /** Makes the public pages reflect whether someone is signed in. */
  function syncNavForAuth() {
    const acct = Auth.current();
    if (!acct) {
      // Signed out: every link into the app goes to the login page first
      $$('a[href^="dashboard.html"]').forEach((a) => {
        const view = (a.getAttribute('href').split('#')[1] || '');
        a.setAttribute('href', 'login.html' + (VIEWS[view] ? `?next=${view}` : ''));
      });
      $$('a[href="checkout.html"]').forEach((a) => a.setAttribute('href', 'login.html?next=checkout'));
      return;
    }
    const first = (acct.name || 'You').split(' ')[0];
    const html = `
      <span class="nav-user"><span class="avatar avatar-sm" aria-hidden="true">${esc(first.charAt(0).toUpperCase())}</span>${acct.demo ? 'Demo account' : 'Hi, ' + esc(first)}</span>
      <button class="btn btn-ghost" type="button" data-nav-logout>Log out</button>
      <a class="btn btn-primary" href="dashboard.html">My Dashboard</a>`;
    $$('.nav-actions:not(.co-nav)').forEach((el) => { el.innerHTML = html; });
    $$('.mobile-menu-actions').forEach((el) => {
      el.innerHTML = `<a class="btn btn-primary btn-block" href="dashboard.html">My Dashboard</a><button class="btn btn-secondary btn-block" type="button" data-nav-logout>Log out</button>`;
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('[data-nav-logout]')) return;
      Auth.clear();
      window.location.href = 'index.html';
    });
  }

  const Store = {
    state: null,
    load() {
      try {
        const raw = localStorage.getItem(Auth.dataKey());
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.version === 1) { this.state = mergeDefaults(parsed); return this.state; }
        }
      } catch (e) { /* fall through to a fresh state */ }
      this.state = this.fresh();
      this.save();
      return this.state;
    },
    fresh() {
      if (!Auth.get() || Auth.isDemo()) return seedState();
      const acct = Auth.current();
      return blankState(acct ? acct.name : '');
    },
    save() {
      try { localStorage.setItem(Auth.dataKey(), JSON.stringify(this.state)); }
      catch (e) { toast('Could not save — browser storage is unavailable.', 'error'); }
    },
    reset() {
      const name = this.state && this.state.profile.name;
      this.state = this.fresh();
      if (!Auth.isDemo() && name) this.state.profile.name = name;
      this.save();
    },
  };

  function addAchievement(text, icon) {
    const s = Store.state;
    s.achievements.unshift({ id: uid(), text, icon: icon || 'award', date: todayISO() });
    s.achievements = s.achievements.slice(0, 20);
  }

  /* =========================================================
     5. SHARED UI
     ========================================================= */
  function refreshIcons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      try { window.lucide.createIcons(); } catch (e) { /* icons are decorative */ }
    }
  }

  function toast(message, type) {
    const region = $('#toasts');
    if (!region) return;
    const kind = type || 'success';
    const icon = kind === 'error' ? 'alert-circle' : kind === 'info' ? 'info' : 'check-circle-2';
    const el = document.createElement('div');
    el.className = `toast toast-${kind}`;
    el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    el.innerHTML = `<i data-lucide="${icon}" aria-hidden="true"></i><span>${esc(message)}</span>`;
    region.appendChild(el);
    refreshIcons();
    setTimeout(() => { el.classList.add('leaving'); setTimeout(() => el.remove(), 250); }, 3200);
  }

  function openDialog(d) {
    if (!d || d.open) return;
    if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
    document.body.classList.add('modal-open');
  }
  function closeDialog(d) {
    if (!d) return;
    if (typeof d.close === 'function' && d.open) d.close(); else d.removeAttribute('open');
    document.body.classList.remove('modal-open');
  }
  function initDialogs() {
    $$('dialog').forEach((d) => {
      d.addEventListener('click', (e) => { if (e.target === d) closeDialog(d); });
      d.addEventListener('close', () => document.body.classList.remove('modal-open'));
    });
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-close-dialog]');
      if (btn) closeDialog(btn.closest('dialog'));
    });
  }

  function initTabs(tablist) {
    if (!tablist) return;
    const tabs = $$('[role="tab"]', tablist);
    const select = (tab) => {
      tabs.forEach((t) => {
        const on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        const panel = document.getElementById(t.getAttribute('aria-controls'));
        if (panel) panel.hidden = !on;
      });
    };
    tablist.addEventListener('click', (e) => { const t = e.target.closest('[role="tab"]'); if (t) select(t); });
    tablist.addEventListener('keydown', (e) => {
      const i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      const map = { ArrowRight: (i + 1) % tabs.length, ArrowLeft: (i - 1 + tabs.length) % tabs.length, Home: 0, End: tabs.length - 1 };
      if (e.key in map) { e.preventDefault(); select(tabs[map[e.key]]); tabs[map[e.key]].focus(); }
    });
  }

  /** Show or clear a validation message under a field. Returns true when valid. */
  function setError(input, msg) {
    const field = input.closest('.field') || input.parentElement;
    const id = 'err-' + (input.id || input.name);
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('p');
      el.id = id;
      el.className = 'field-error';
      field.appendChild(el);
    }
    el.textContent = msg || '';
    el.hidden = !msg;
    if (msg) { input.setAttribute('aria-invalid', 'true'); input.setAttribute('aria-describedby', id); }
    else { input.removeAttribute('aria-invalid'); input.removeAttribute('aria-describedby'); }
    return !msg;
  }

  function badge(text, color) { return `<span class="badge badge-${color || 'gray'}">${esc(text)}</span>`; }

  function progressBar(pct, label, size) {
    const p = clamp(Math.round(pct), 0, 100);
    return `<div class="progress ${size ? 'progress-' + size : ''}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p}" aria-label="${esc(label || 'Progress')}"><span style="width:${p}%"></span></div>`;
  }

  function emptyState(icon, title, text, actionHtml) {
    return `<div class="empty-state"><span class="empty-icon"><i data-lucide="${icon}" aria-hidden="true"></i></span><p class="empty-title">${esc(title)}</p><p class="empty-text">${esc(text)}</p>${actionHtml || ''}</div>`;
  }

  function initYear() { $$('[data-year]').forEach((el) => { el.textContent = String(new Date().getFullYear()); }); }

  /* =========================================================
     6. LANDING PAGE
     ========================================================= */
  function initLanding() {
    syncNavForAuth();
    // Sticky header shadow
    const header = $('#site-header');
    const onScroll = () => header && header.classList.toggle('scrolled', window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    // Mobile menu
    const toggle = $('#nav-toggle');
    const menu = $('#mobile-menu');
    const setMenu = (open) => {
      if (!toggle || !menu) return;
      menu.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      toggle.innerHTML = `<i data-lucide="${open ? 'x' : 'menu'}" aria-hidden="true"></i>`;
      refreshIcons();
    };
    if (toggle) toggle.addEventListener('click', () => setMenu(menu.hidden));
    if (menu) menu.addEventListener('click', (e) => { if (e.target.closest('a, button')) setMenu(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menu && !menu.hidden) { setMenu(false); toggle.focus(); } });
    window.addEventListener('resize', () => { if (window.innerWidth > 960 && menu && !menu.hidden) setMenu(false); });

    // FAQ accordion
    $$('.faq-q').forEach((btn) => {
      btn.addEventListener('click', () => {
        const open = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', String(!open));
        const panel = document.getElementById(btn.getAttribute('aria-controls'));
        if (panel) panel.hidden = open;
      });
    });

    initTabs($('#track-tabs'));

    // Configurable price
    $$('[data-price-plus]').forEach((el) => { el.textContent = formatPrice(CONFIG.pricing.plusMonthly); });

    Onboarding.init();
    if (location.hash === '#start') Onboarding.open();
  }

  /* =========================================================
     7. ONBOARDING WIZARD
     ========================================================= */
  /** Deterministic, rule-based plan generator. No AI involved. */
  function generatePlan(a) {
    const minutes = Number(a.minutes) || 30;
    const durations = { 15: [15], 30: [15, 15], 45: [20, 15, 10], 60: [20, 15, 15, 10] }[minutes] || [15, 15];
    const info = MAJORS[a.major];
    const track = TRACKS[MAJOR_TRACK[a.major] || 'business'];
    const ch = track.challenges[0];
    const goal = a.careerUnsure || !a.careerGoal ? '' : a.careerGoal;

    const pool = {
      academic: { title: 'Focused study block', desc: `Study your most challenging ${info ? a.major + ' ' : ''}course with notifications off, then summarize it in three bullet points.`, category: 'Study' },
      deadlines: { title: "Map this week's deadlines", desc: 'List everything due in the next seven days and add each item to your planner.', category: 'Assignment' },
      recall: { title: 'Active recall review', desc: 'Close your notes, write down what you remember from your last lecture, then fill the gaps.', category: 'Exam Prep' },
      explore: info
        ? { title: `Explore careers in ${a.major}`, desc: 'Open My Major & Career and note two career directions that interest you and why.', category: 'Career' }
        : { title: "Compare two majors you're curious about", desc: 'Look at example careers and skills for each, then note which excites you more.', category: 'Career' },
      reflect: { title: 'Write down what energizes you', desc: 'List three classes, activities, or tasks you enjoyed this year and what they have in common.', category: 'Wellness' },
      skill: { title: `Daily challenge: ${ch.title}`, desc: ch.steps[0], category: 'Skill Building' },
      practice: { title: info ? info.activities[0] : 'Practice one transferable skill', desc: 'A short hands-on exercise that turns coursework into something you can do.', category: 'Skill Building' },
      resume: { title: 'Update one resume section', desc: goal ? `Rewrite one bullet so it highlights a skill relevant to ${goal}.` : 'Add one recent class project or activity with a clear result.', category: 'Career' },
      interview: { title: 'Practice one interview question out loud', desc: 'Answer a behavioral question using Situation, Task, Action, Result.', category: 'Career' },
      research: { title: goal ? `Research one ${goal} internship listing` : 'Research one internship listing', desc: 'Note the top three skills it asks for and compare them with your own.', category: 'Career' },
    };
    const orders = {
      academic: ['academic', 'deadlines', 'recall', 'skill'],
      major: ['explore', 'reflect', 'practice', 'academic'],
      skills: ['skill', 'practice', 'academic', 'resume'],
      career: ['resume', 'interview', 'research', 'skill'],
      overall: ['academic', 'skill', 'resume', 'explore'],
    };
    let order = (orders[a.focus] || orders.overall).slice();
    const n = durations.length;
    if (!goal && n >= 2 && !order.slice(0, n).includes('explore')) order.splice(n - 1, 0, 'explore');
    return durations.map((m, i) => Object.assign({}, pool[order[i]], { minutes: m }));
  }

  const Onboarding = {
    step: 1,
    total: 5,
    dialog: null,
    form: null,

    init() {
      this.dialog = $('#onboarding');
      this.form = $('#ob-form');
      if (!this.dialog || !this.form) return;

      const majorSel = $('#ob-major');
      majorSel.insertAdjacentHTML('beforeend', MAJOR_LIST.map((m) => `<option>${esc(m)}</option>`).join('') + '<option>Undecided</option><option>Other</option>');

      document.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-open-onboarding]');
        if (btn) { e.preventDefault(); this.open(btn.dataset.plan); }
      });
      $('#ob-next').addEventListener('click', () => this.next());
      $('#ob-back').addEventListener('click', () => this.go(this.step - 1));
      this.form.addEventListener('submit', (e) => { e.preventDefault(); this.next(); });
      this.form.addEventListener('change', (e) => {
        if (e.target.name === 'major') this.updateSuggestions();
        if (e.target.id === 'ob-unsure') this.syncUnsure();
        this.clearError(e.target.name);
        this.saveDraft();
      });
      this.form.addEventListener('input', (e) => { this.clearError(e.target.name); this.saveDraft(); });
      $('#ob-goal-suggestions').addEventListener('click', (e) => {
        const b = e.target.closest('[data-suggest]');
        if (!b) return;
        $('#ob-goal').value = b.dataset.suggest;
        $('#ob-unsure').checked = false;
        this.syncUnsure();
        this.clearError('careerGoal');
        this.saveDraft();
      });
      // Enter in a text field advances instead of submitting a page
      this.form.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox' && e.target.type !== 'radio') { e.preventDefault(); this.next(); }
      });
    },

    open(plan) {
      this.restoreDraft();
      if (plan) this.form.elements.plan.value = plan;
      this.updateSuggestions();
      this.syncUnsure();
      this.go(this.step && this.step <= this.total ? this.step : 1, true);
      openDialog(this.dialog);
      refreshIcons();
    },

    values() {
      const f = this.form.elements;
      const radio = (name) => { const el = this.form.querySelector(`input[name="${name}"]:checked`); return el ? el.value : ''; };
      return {
        focus: radio('focus'),
        name: f.name.value.trim(),
        level: f.level.value,
        major: f.major.value,
        year: f.year.value,
        careerGoal: f.careerGoal.value.trim(),
        careerUnsure: f.careerUnsure.checked,
        minutes: radio('minutes'),
        plan: f.plan.value || 'free',
      };
    },

    saveDraft() {
      try { localStorage.setItem(CONFIG.draftKey, JSON.stringify(Object.assign(this.values(), { step: this.step }))); } catch (e) { /* ignore */ }
    },

    restoreDraft() {
      let d = null;
      try { d = JSON.parse(localStorage.getItem(CONFIG.draftKey) || 'null'); } catch (e) { d = null; }
      if (!d) return;
      const f = this.form.elements;
      const setRadio = (name, v) => { const el = this.form.querySelector(`input[name="${name}"][value="${v}"]`); if (el) el.checked = true; };
      setRadio('focus', d.focus);
      setRadio('minutes', d.minutes);
      f.name.value = d.name || '';
      f.level.value = d.level || '';
      f.major.value = d.major || '';
      f.year.value = d.year || '';
      f.careerGoal.value = d.careerGoal || '';
      f.careerUnsure.checked = !!d.careerUnsure;
      f.plan.value = d.plan || 'free';
      this.step = clamp(Number(d.step) || 1, 1, this.total);
    },

    updateSuggestions() {
      const major = this.form.elements.major.value;
      const careers = MAJORS[major] ? MAJORS[major].careers.map((c) => c.title) : ['Business Analyst', 'Data Analyst', 'Project Coordinator', 'Marketing Coordinator'];
      $('#ob-goal-list').innerHTML = careers.map((c) => `<option value="${esc(c)}">`).join('');
      $('#ob-goal-suggestions').innerHTML = careers.map((c) => `<button type="button" class="chip" data-suggest="${esc(c)}">${esc(c)}</button>`).join('');
    },

    syncUnsure() {
      const unsure = $('#ob-unsure').checked;
      const goal = $('#ob-goal');
      goal.disabled = unsure;
      if (unsure) goal.value = '';
      $$('#ob-goal-suggestions .chip').forEach((b) => { b.disabled = unsure; });
    },

    showError(name, msg) {
      const el = this.form.querySelector(`[data-error="${name}"]`);
      if (el) { el.textContent = msg; el.hidden = false; }
    },
    clearError(name) {
      const el = name && this.form.querySelector(`[data-error="${name}"]`);
      if (el) { el.textContent = ''; el.hidden = true; }
    },

    validate(step) {
      const v = this.values();
      let ok = true;
      const req = (cond, name, msg) => { if (!cond) { this.showError(name, msg); ok = false; } };
      if (step === 1) req(v.focus, 'focus', 'Choose one area to focus on.');
      if (step === 2) {
        req(v.level, 'level', 'Select your education level.');
        req(v.major, 'major', 'Select a major or area of interest — "Undecided" is fine.');
        req(v.year, 'year', 'Select your academic year.');
      }
      if (step === 3) req(v.careerGoal || v.careerUnsure, 'careerGoal', 'Enter a career direction, or check "I\'m not sure yet."');
      if (step === 4) req(v.minutes, 'minutes', 'Choose how much time you have each day.');
      if (!ok) {
        const first = this.form.querySelector(`.wizard-panel[data-step="${step}"] .field-error:not([hidden])`);
        if (first) {
          const panel = first.closest('.wizard-panel');
          const target = panel.querySelector('input:not([type="hidden"]):not(:disabled), select');
          if (target) target.focus();
        }
      }
      return ok;
    },

    next() {
      if (this.step < this.total) {
        if (!this.validate(this.step)) return;
        this.go(this.step + 1);
      } else {
        this.finish();
      }
    },

    go(step, silent) {
      this.step = clamp(step, 1, this.total);
      $$('.wizard-panel', this.form).forEach((p) => { p.hidden = Number(p.dataset.step) !== this.step; });
      $$('[data-step-indicator]', this.form).forEach((li) => {
        const n = Number(li.dataset.stepIndicator);
        li.classList.toggle('active', n === this.step);
        li.classList.toggle('done', n < this.step);
      });
      $('#ob-count').textContent = `Step ${this.step} of ${this.total}`;
      $('#ob-back').disabled = this.step === 1;
      $('#ob-next').innerHTML = this.step === this.total ? 'Open My Dashboard <i data-lucide="arrow-right" aria-hidden="true"></i>' : 'Continue';
      if (this.step === this.total) this.renderPlan();
      this.saveDraft();
      refreshIcons();
      if (!silent) {
        const heading = this.form.querySelector(`.wizard-panel[data-step="${this.step}"] h3`);
        if (heading) { heading.tabIndex = -1; heading.focus(); }
      }
    },

    renderPlan() {
      const v = this.values();
      const plan = generatePlan(v);
      const total = plan.reduce((a, t) => a + t.minutes, 0);
      const goalText = v.careerUnsure || !v.careerGoal ? 'Exploring options' : v.careerGoal;
      $('#ob-plan').innerHTML = `
        <div class="plan-summary">
          <span><i data-lucide="target" aria-hidden="true"></i> ${esc(FOCUS_LABELS[v.focus] || 'Balanced plan')}</span>
          <span><i data-lucide="graduation-cap" aria-hidden="true"></i> ${esc(v.major)} · ${esc(v.year)}</span>
          <span><i data-lucide="compass" aria-hidden="true"></i> ${esc(goalText)}</span>
          <span><i data-lucide="clock" aria-hidden="true"></i> ${total} min today</span>
        </div>
        <ol class="plan-list">
          ${plan.map((t, i) => `
            <li>
              <span class="plan-num">${i + 1}</span>
              <div>
                <p class="plan-title">${esc(t.title)}</p>
                <p class="plan-desc">${esc(t.desc)}</p>
              </div>
              <div class="plan-meta">${badge(t.category, TASK_CATEGORIES[t.category])}<span><i data-lucide="clock" aria-hidden="true"></i> ${t.minutes} min</span></div>
            </li>`).join('')}
        </ol>
        ${v.plan === 'plus' ? '<p class="callout callout-info"><i data-lucide="info" aria-hidden="true"></i> You picked Smart Mentor Plus. You can upgrade anytime from Settings → Plan.</p>' : ''}
        <p class="callout"><i data-lucide="flask-conical" aria-hidden="true"></i> Demo plan generated by predefined rules from your answers — not by AI. Use <strong>Back</strong> to edit any answer.</p>`;
    },

    finish() {
      for (let s = 1; s < this.total; s++) { if (!this.validate(s)) { this.go(s); return; } }
      const v = this.values();
      this.step = 1;
      this.saveDraft();
      if (!Auth.get()) {
        // Not signed in yet: keep the plan and ask the student to create an account first
        try { localStorage.setItem(Auth.pendingKey, JSON.stringify(v)); } catch (e) { /* ignore */ }
        window.location.href = 'login.html?mode=signup&from=plan';
        return;
      }
      applyOnboarding(v);
      window.location.href = 'dashboard.html#overview';
    },
  };

  /** Saves onboarding answers to the signed-in workspace and adds today's plan. */
  function applyOnboarding(v) {
    Store.load();
    const st = Store.state;
    const t = todayISO();
    Object.assign(st.profile, {
      name: v.name || st.profile.name,
      level: v.level, major: v.major, year: v.year,
      careerGoal: v.careerUnsure ? '' : v.careerGoal,
      careerUnsure: v.careerUnsure,
      minutes: Number(v.minutes), focus: v.focus, onboarded: true, // plan only changes after checkout
    });
    if (MAJORS[v.major]) {
      st.career.selectedMajor = v.major;
      st.skills.track = MAJOR_TRACK[v.major];
    }
    // Replace today's sample/previous plan tasks with the new plan; keep tasks the student added
    st.tasks = st.tasks.filter((x) => !((x.source === 'plan' || x.source === 'sample') && x.date === t));
    generatePlan(v).forEach((p) => st.tasks.push({ id: uid(), title: p.title, desc: p.desc, category: p.category, date: t, minutes: p.minutes, done: false, source: 'plan' }));
    addAchievement('Built your personalized success plan', 'sparkles');
    Store.save();
    const acct = Auth.current();
    if (acct && !acct.demo) {
      sendToSheet('profile', { name: st.profile.name, email: acct.email, level: v.level, major: v.major, year: v.year, careerGoal: v.careerUnsure ? 'Not sure yet' : v.careerGoal, minutes: Number(v.minutes), focus: FOCUS_LABELS[v.focus] || v.focus });
    }
  }

  /* =========================================================
     7b. LOGIN PAGE (demo sign-in, browser-only)
     ========================================================= */
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function initLogin() {
    const params = new URLSearchParams(location.search);
    const nextParam = params.get('next');
    const next = nextParam === 'checkout' ? 'checkout' : VIEWS[nextParam] ? nextParam : 'overview';
    let pending = null;
    try { pending = JSON.parse(localStorage.getItem(Auth.pendingKey) || 'null'); } catch (e) { pending = null; }

    initTabs($('#auth-tabs'));
    if (params.get('mode') === 'signup') $('#tab-signup').click();
    if (pending && params.get('from') === 'plan') $('#plan-waiting').hidden = false;
    if (next === 'checkout') $('#checkout-waiting').hidden = false;

    // Already signed in?
    const acct = Auth.current();
    if (acct) {
      $('#signed-in').hidden = false;
      $('#signed-in-name').textContent = acct.demo ? 'the demo account (Alex)' : `${acct.name} (${acct.email})`;
    }
    $('#continue-session').addEventListener('click', () => finishAuth());
    $('#switch-account').addEventListener('click', () => { Auth.clear(); $('#signed-in').hidden = true; toast('Logged out', 'info'); });

    // Show / hide password
    $$('[data-toggle-password]').forEach((btn) => btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.togglePassword);
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.setAttribute('aria-pressed', String(show));
      btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      btn.innerHTML = `<i data-lucide="${show ? 'eye-off' : 'eye'}" aria-hidden="true"></i>`;
      refreshIcons();
    }));

    $('#forgot-password').addEventListener('click', () => {
      $('#forgot-help').hidden = !$('#forgot-help').hidden;
    });

    function finishAuth() {
      Store.load();
      let p = null;
      try { p = JSON.parse(localStorage.getItem(Auth.pendingKey) || 'null'); } catch (e) { p = null; }
      if (p) { applyOnboarding(p); try { localStorage.removeItem(Auth.pendingKey); } catch (e) { /* ignore */ } }
      if (next === 'checkout') { window.location.href = 'checkout.html'; return; }
      window.location.href = 'dashboard.html#' + (p ? 'overview' : next);
    }

    const busy = (form, on) => { const b = form.querySelector('button[type=submit]'); b.disabled = on; };

    $('#login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const email = f.email.value.trim().toLowerCase();
      const pw = f.password.value;
      let ok = setError(f.email, !EMAIL_RE.test(email) ? 'Enter a valid email address.' : '');
      ok = setError(f.password, !pw ? 'Enter your password.' : '') && ok;
      if (!ok) { const bad = f.querySelector('[aria-invalid="true"]'); if (bad) bad.focus(); return; }
      const accounts = Auth.accounts();
      const acc = accounts[email];
      if (!acc) {
        setError(f.email, "We couldn't find an account with that email on this browser. Create one in the other tab.");
        f.email.focus();
        return;
      }
      busy(f, true);
      if (!acc.hash) {
        // Account made before passwords existed: the first password used becomes its password
        if (!setError(f.password, passwordProblem(pw))) { busy(f, false); f.password.focus(); return; }
        acc.salt = newSalt();
        acc.hash = await hashPassword(pw, acc.salt);
        Auth.saveAccounts(accounts);
      } else if ((await hashPassword(pw, acc.salt)) !== acc.hash) {
        busy(f, false);
        setError(f.password, 'That password is incorrect. Try again.');
        f.password.select();
        return;
      }
      Auth.set(email, f.remember.checked);
      sendToSheet('login', { name: acc.name, email });
      finishAuth();
    });

    $('#signup-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const name = f.name.value.trim();
      const email = f.email.value.trim().toLowerCase();
      const pw = f.password.value;
      const accounts = Auth.accounts();
      let ok = setError(f.name, name.length < 2 ? 'Enter your first name.' : '');
      ok = setError(f.email, !EMAIL_RE.test(email) ? 'Enter a valid email address.' : accounts[email] ? 'An account with this email already exists here — use Log in instead.' : '') && ok;
      ok = setError(f.password, passwordProblem(pw)) && ok;
      ok = setError(f.confirm, !f.confirm.value ? 'Re-enter your password.' : f.confirm.value !== pw ? "Passwords don't match." : '') && ok;
      ok = setError(f.agree, !f.agree.checked ? 'Please agree to the Terms and Privacy Policy to continue.' : '') && ok;
      if (!ok) { const bad = f.querySelector('[aria-invalid="true"]'); if (bad) bad.focus(); return; }
      busy(f, true);
      const salt = newSalt();
      accounts[email] = { name, email, created: todayISO(), salt, hash: await hashPassword(pw, salt) };
      Auth.saveAccounts(accounts);
      Auth.set(email, f.remember.checked);
      sendToSheet('signup', { name, email });
      finishAuth();
    });

    // Live password strength hint
    const pwInput = $('#signup-password');
    pwInput.addEventListener('input', () => {
      const v = pwInput.value;
      const checks = [v.length >= 8, /[A-Za-z]/.test(v), /\d/.test(v)];
      $$('#pw-rules li').forEach((li, i) => li.classList.toggle('ok', checks[i]));
    });

    $$('[data-action="use-demo"]').forEach((b) => b.addEventListener('click', () => {
      Auth.set('demo', false);
      try { localStorage.removeItem(Auth.pendingKey); } catch (e) { /* ignore */ }
      window.location.href = next === 'checkout' ? 'checkout.html' : 'dashboard.html#' + next;
    }));

    $$('#login-form input, #signup-form input').forEach((el) => el.addEventListener('input', () => { if (el.hasAttribute('aria-invalid')) setError(el, ''); }));
    $$('#signup-form input[type=checkbox]').forEach((el) => el.addEventListener('change', () => setError(el, '')));
  }

  /* =========================================================
     7c. CHECKOUT PAGE (Stripe Payment Link — no card data touches this site)
     ========================================================= */
  function initCheckout() {
    const params = new URLSearchParams(location.search);
    const status = params.get('status');
    $$('[data-price-plus]').forEach((el) => { el.textContent = formatPrice(CONFIG.pricing.plusMonthly); });

    if (!Auth.get()) {
      window.location.replace('login.html?next=checkout' + (status ? '' : ''));
      return;
    }
    Store.load();
    const acct = Auth.current();
    $('#co-account').textContent = acct && acct.demo ? 'Demo account (Alex)' : `${acct ? acct.name : ''} · ${acct ? acct.email : ''}`;

    const show = (id) => { ['#co-main', '#co-success', '#co-cancel', '#co-already'].forEach((sel) => { const el = $(sel); if (el) el.hidden = sel !== id; }); };

    if (status === 'success') {
      // NOTE: without a server we can't verify the payment — see README.
      if (Store.state.profile.plan !== 'plus') {
        Store.state.profile.plan = 'plus';
        addAchievement('Upgraded to Smart Mentor Plus', 'sparkles');
        Store.save();
        if (acct && !acct.demo) sendToSheet('upgrade', { name: acct.name, email: acct.email, plan: 'Plus (monthly)', stripeSession: params.get('session_id') || '' });
      }
      history.replaceState(null, '', 'checkout.html?status=success');
      show('#co-success');
      return;
    }
    if (status === 'cancel') show('#co-cancel');
    else if (Store.state.profile.plan === 'plus') show('#co-already');
    else show('#co-main');

    const link = (CONFIG.payments.stripePaymentLink || '').trim();
    const connected = /^https:\/\/(buy\.stripe\.com|checkout\.stripe\.com)\//.test(link);
    $('#co-not-connected').hidden = connected;
    $$('[data-action="go-pay"]').forEach((btn) => {
      btn.disabled = !connected;
      btn.addEventListener('click', () => {
        if (!connected) return;
        if (Auth.isDemo()) { toast('Create your own account before upgrading — the demo account is shared.', 'info'); return; }
        const url = new URL(link);
        if (acct && acct.email) url.searchParams.set('prefilled_email', acct.email);
        window.location.href = url.toString();
      });
    });
  }

  /* =========================================================
     8. DASHBOARD
     ========================================================= */
  const VIEWS = { overview: 'Overview', planner: 'My Study Planner', goals: 'Goals', career: 'My Major & Career', skills: 'Skill Builder', portfolio: 'Projects & Portfolio', resume: 'Resume Builder', interview: 'Interview Practice', settings: 'Settings' };
  const ui = { view: null, weekOffset: 0, goalFilter: 'active', editingProject: null, revealed: false, review: null };

  function initDashboard() {
    if (!Auth.get()) {
      const view = (location.hash || '').slice(1);
      window.location.replace('login.html' + (VIEWS[view] ? `?next=${view}` : ''));
      return;
    }
    Store.load();
    if (Auth.isDemo()) { $('#demo-banner').hidden = false; $('#demo-badge').hidden = false; }
    $('#today-label').textContent = today().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    setupSidebar();
    setupForms();
    document.addEventListener('click', onClick);
    document.addEventListener('change', onChange);
    document.addEventListener('input', onInput);
    window.addEventListener('hashchange', () => route(true));
    route(false);
  }

  function route(fromNav) {
    const key = (location.hash || '').slice(1);
    if (!VIEWS[key] && ui.view) return; // e.g. the skip link (#main) — keep current view
    const view = VIEWS[key] ? key : 'overview';
    ui.view = view;
    $$('.view').forEach((v) => { v.hidden = v.dataset.view !== view; });
    $$('[data-view-link]').forEach((a) => {
      const on = a.dataset.viewLink === view;
      a.classList.toggle('active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    $('#view-title').textContent = VIEWS[view];
    document.title = `${VIEWS[view]} · Smart Mentor Demo`;
    ui.revealed = false; ui.review = null;
    closeSidebar();
    render();
    if (fromNav) { window.scrollTo(0, 0); $('#main').focus({ preventScroll: true }); }
  }

  function render() {
    renderSidebarUser();
    const fn = { overview: renderOverview, planner: renderPlanner, goals: renderGoals, career: renderCareer, skills: renderSkills, portfolio: renderPortfolio, resume: renderResume, interview: renderInterview, settings: renderSettings }[ui.view];
    if (fn) fn();
    refreshIcons();
  }

  function save(msg, type) { Store.save(); render(); if (msg) toast(msg, type); }

  /* ---------- Sidebar ---------- */
  function setupSidebar() {
    const btn = $('#open-sidebar');
    btn.addEventListener('click', openSidebar);
    $$('[data-close-sidebar]').forEach((el) => el.addEventListener('click', closeSidebar));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('#sidebar').classList.contains('open')) { closeSidebar(); btn.focus(); } });
  }
  function openSidebar() {
    $('#sidebar').classList.add('open');
    $('.scrim').hidden = false;
    $('#open-sidebar').setAttribute('aria-expanded', 'true');
    const first = $('.sidebar-nav a.active') || $('.sidebar-nav a');
    if (first) first.focus();
  }
  function closeSidebar() {
    const sb = $('#sidebar');
    if (!sb) return;
    sb.classList.remove('open');
    $('.scrim').hidden = true;
    $('#open-sidebar').setAttribute('aria-expanded', 'false');
  }
  function renderSidebarUser() {
    const p = Store.state.profile;
    const name = p.name || 'Student';
    $('#sb-name').textContent = name;
    $('#sb-avatar').textContent = name.charAt(0).toUpperCase();
    $('#sb-meta').textContent = [p.major, p.year].filter(Boolean).join(' · ') || 'Set up your profile';
  }

  /* ---------- Static form setup ---------- */
  function setupForms() {
    $('#task-category').innerHTML = Object.keys(TASK_CATEGORIES).map((c) => `<option>${esc(c)}</option>`).join('');
    $('#goal-category').innerHTML = Object.keys(GOAL_CATEGORIES).map((c) => `<option>${esc(c)}</option>`).join('');
    $('#s-major').innerHTML = MAJOR_LIST.concat(['Undecided', 'Other']).map((m) => `<option>${esc(m)}</option>`).join('');
    $('#project-skills').innerHTML = SKILL_OPTIONS.map((s, i) => `<label class="skill-check"><input type="checkbox" value="${esc(s)}" id="ps-${i}"><span>${esc(s)}</span></label>`).join('');
    $('#task-date').value = todayISO();
    $('#goal-target').value = isoOffset(30);
    $('#project-date').value = todayISO();

    $('#goal-progress').addEventListener('input', (e) => { $('#goal-progress-out').textContent = e.target.value + '%'; });
    $('#task-form').addEventListener('submit', onTaskSubmit);
    $('#goal-form').addEventListener('submit', onGoalSubmit);
    $('#project-form').addEventListener('submit', onProjectSubmit);
    $('#settings-form').addEventListener('submit', onSettingsSubmit);
    $$('#task-form input, #goal-form input, #project-form input, #project-form textarea').forEach((el) => el.addEventListener('input', () => { if (el.hasAttribute('aria-invalid')) setError(el, ''); }));
  }

  /* ---------- Shared task row ---------- */
  function taskRow(t, opts) {
    const o = opts || {};
    const color = TASK_CATEGORIES[t.category] || 'gray';
    const cid = `chk-${o.prefix || 'a'}-${t.id}`;
    return `
      <li class="task-item ${t.done ? 'is-done' : ''} ${o.compact ? 'task-compact' : ''}">
        <input type="checkbox" class="check" id="${cid}" data-action="toggle-task" data-id="${t.id}" ${t.done ? 'checked' : ''}>
        <label for="${cid}" class="task-body">
          <span class="task-title">${esc(t.title)}</span>
          ${!o.compact && t.desc ? `<span class="task-desc">${esc(t.desc)}</span>` : ''}
          <span class="task-meta">${o.compact ? `<span class="dot dot-${color}" aria-hidden="true"></span>${esc(t.category)}` : badge(t.category, color)}<span class="meta-time"><i data-lucide="clock" aria-hidden="true"></i> ${t.minutes} min</span></span>
        </label>
        ${o.deletable ? `<button class="btn-icon btn-icon-sm btn-icon-danger" type="button" data-action="delete-task" data-id="${t.id}" aria-label="Delete task: ${esc(t.title)}"><i data-lucide="trash-2" aria-hidden="true"></i></button>` : ''}
      </li>`;
  }

  /* ---------- Overview ---------- */
  function computeRoadmap() {
    const s = Store.state;
    const r = s.resume;
    const resumeSections = ['education', 'skills', 'projects', 'experience', 'activities'].filter((k) => r[k].trim()).length;
    const steps = [
      { label: 'Build your success plan', done: s.profile.onboarded, href: 'index.html#start', meta: '' },
      { label: 'Set a career direction', done: !!s.profile.careerGoal && !s.profile.careerUnsure, href: '#career', meta: '' },
      { label: 'Complete 3 skill challenges', done: s.skills.completed.length >= 3, href: '#skills', meta: `${Math.min(s.skills.completed.length, 3)}/3` },
      { label: 'Add 2 portfolio projects', done: s.portfolio.length >= 2, href: '#portfolio', meta: `${Math.min(s.portfolio.length, 2)}/2` },
      { label: 'Draft your resume', done: !!r.fullName.trim() && resumeSections >= 2, href: '#resume', meta: '' },
      { label: 'Practice 5 interview questions', done: s.interview.practiced >= 5, href: '#interview', meta: `${Math.min(s.interview.practiced, 5)}/5` },
    ];
    const cur = steps.findIndex((x) => !x.done);
    if (cur >= 0) steps[cur].current = true;
    return steps;
  }

  function renderOverview() {
    const s = Store.state;
    const t = todayISO();
    const todays = s.tasks.filter((x) => x.date === t);
    const done = todays.filter((x) => x.done).length;
    const pct = todays.length ? Math.round((done / todays.length) * 100) : 0;
    const remaining = todays.length - done;
    const remainingMin = todays.filter((x) => !x.done).reduce((a, x) => a + Number(x.minutes || 0), 0);
    const active = s.goals.filter((g) => !g.done);
    const avgGoal = active.length ? Math.round(active.reduce((a, g) => a + g.progress, 0) / active.length) : 0;
    const focus = todays.find((x) => !x.done);
    const name = s.profile.name || 'there';
    const goal = s.profile.careerGoal && !s.profile.careerUnsure ? s.profile.careerGoal : '';

    // Week chart data
    const start = startOfWeek(today());
    const week = [...Array(7)].map((_, i) => {
      const d = toISO(addDays(start, i));
      const items = s.tasks.filter((x) => x.date === d);
      return { d, label: parseISO(d).toLocaleDateString('en-US', { weekday: 'short' }), planned: items.length, done: items.filter((x) => x.done).length };
    });
    const maxBar = Math.max(1, ...week.map((w) => w.planned));
    const weekDone = week.reduce((a, w) => a + w.done, 0);
    const weekPlanned = week.reduce((a, w) => a + w.planned, 0);

    // Deadlines
    const deadlines = s.tasks
      .filter((x) => !x.done && (x.category === 'Assignment' || x.category === 'Exam Prep') && daysUntil(x.date) >= 0 && daysUntil(x.date) <= 21)
      .map((x) => ({ title: x.title, date: x.date, kind: x.category, icon: x.category === 'Exam Prep' ? 'book-open' : 'file-text' }))
      .concat(active.filter((g) => daysUntil(g.target) >= 0 && daysUntil(g.target) <= 30).map((g) => ({ title: g.title, date: g.target, kind: 'Goal', icon: 'target' })))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 5);

    const roadmap = computeRoadmap();
    const totalCh = ALL_CHALLENGES.length;

    $('#overview-root').innerHTML = `
      <div class="welcome">
        <div>
          <p class="eyebrow">${greeting()}</p>
          <h2>Welcome back, ${esc(name)}</h2>
          <p class="muted">${todays.length ? (remaining ? `Today's focus: <strong>${esc(focus.title)}</strong>` : 'Everything on today\'s plan is done. Nice work.') : 'No tasks planned for today yet.'}</p>
        </div>
        <div class="welcome-actions">
          <a class="btn btn-primary" href="#planner"><i data-lucide="plus" aria-hidden="true"></i> Add a task</a>
          <a class="btn btn-secondary" href="#skills"><i data-lucide="hammer" aria-hidden="true"></i> Today's challenge</a>
        </div>
      </div>

      <div class="stat-grid">
        <div class="stat-card">
          <div class="ring ring-md" style="--p:${pct}" role="img" aria-label="${pct}% of today's tasks complete"><span>${pct}%</span></div>
          <div><p class="stat-label">Daily progress</p><p class="stat-value">${done} of ${todays.length}</p><p class="stat-sub">tasks completed</p></div>
        </div>
        <div class="stat-card">
          <span class="icon-tile icon-amber"><i data-lucide="list-todo" aria-hidden="true"></i></span>
          <div><p class="stat-label">Tasks remaining</p><p class="stat-value">${remaining}</p><p class="stat-sub">${remaining ? `about ${remainingMin} min left` : 'all clear today'}</p></div>
        </div>
        <div class="stat-card">
          <span class="icon-tile icon-blue"><i data-lucide="target" aria-hidden="true"></i></span>
          <div><p class="stat-label">Active goals</p><p class="stat-value">${active.length}</p><p class="stat-sub">${avgGoal}% average progress</p></div>
        </div>
        <div class="stat-card">
          <span class="icon-tile icon-purple"><i data-lucide="award" aria-hidden="true"></i></span>
          <div><p class="stat-label">Challenges done</p><p class="stat-value">${s.skills.completed.length} / ${totalCh}</p><p class="stat-sub">across ${Object.keys(TRACKS).length} tracks</p></div>
        </div>
      </div>

      <div class="dash-grid">
        <article class="card span-8">
          <div class="card-header">
            <div><h3 class="card-title">Today's Action Plan</h3><p class="card-sub">${fmtDate(t, { weekday: 'long', month: 'long', day: 'numeric' })}</p></div>
            <span class="count-pill" aria-live="polite">${done}/${todays.length} done</span>
          </div>
          ${progressBar(pct, "Today's progress")}
          ${todays.length
            ? `<ul class="task-list">${todays.map((x) => taskRow(x, { prefix: 'ov' })).join('')}</ul>`
            : emptyState('calendar-plus', 'Nothing planned for today', 'Add a task or build a success plan to get a suggested daily plan.', '<div class="empty-actions"><a class="btn btn-primary btn-sm" href="#planner">Add a task</a><a class="btn btn-secondary btn-sm" href="index.html#start">Build my plan</a></div>')}
        </article>

        <article class="card span-4 career-goal-card">
          <h3 class="card-title">Current career goal</h3>
          ${goal
            ? `<p class="goal-big"><i data-lucide="compass" aria-hidden="true"></i> ${esc(goal)}</p>`
            : '<p class="goal-big goal-big-muted"><i data-lucide="compass" aria-hidden="true"></i> Still exploring</p>'}
          <dl class="kv">
            <div><dt>Major</dt><dd>${esc(s.profile.major || '—')}</dd></div>
            <div><dt>Year</dt><dd>${esc(s.profile.year || '—')}</dd></div>
            <div><dt>Daily time</dt><dd>${s.profile.minutes} min</dd></div>
          </dl>
          <a class="btn btn-secondary btn-sm btn-block" href="#career">${goal ? 'Explore related careers' : 'Explore career directions'}</a>
        </article>

        <article class="card span-4">
          <div class="card-header"><h3 class="card-title">Weekly goals</h3><a class="link-sm" href="#goals">View all</a></div>
          ${active.length
            ? `<ul class="mini-goals">${active.slice(0, 4).map((g) => `<li><div class="mini-goal-top"><span>${esc(g.title)}</span><strong>${g.progress}%</strong></div>${progressBar(g.progress, g.title, 'sm')}</li>`).join('')}</ul>`
            : emptyState('target', 'No active goals', 'Set a goal to track progress here.', '<a class="btn btn-secondary btn-sm" href="#goals">Add a goal</a>')}
        </article>

        <article class="card span-4">
          <div class="card-header"><h3 class="card-title">This week</h3><span class="card-sub">${weekDone} of ${weekPlanned} done</span></div>
          <div class="bar-chart" role="img" aria-label="Tasks this week: ${week.map((w) => `${w.label} ${w.done} of ${w.planned} done`).join(', ')}">
            ${week.map((w) => `
              <div class="bar-col ${w.d === t ? 'is-today' : ''}">
                <div class="bar-track">
                  <div class="bar-planned" style="height:${(w.planned / maxBar) * 100}%"></div>
                  <div class="bar-done" style="height:${(w.done / maxBar) * 100}%"></div>
                </div>
                <span class="bar-label">${w.label.charAt(0)}</span>
              </div>`).join('')}
          </div>
          <div class="legend"><span><i class="legend-swatch swatch-done"></i>Done</span><span><i class="legend-swatch swatch-planned"></i>Planned</span></div>
        </article>

        <article class="card span-4">
          <div class="card-header"><h3 class="card-title">Skill development</h3><a class="link-sm" href="#skills">Open</a></div>
          <ul class="skill-bars">
            ${Object.entries(TRACKS).map(([key, tr]) => {
              const n = tr.challenges.filter((c) => s.skills.completed.includes(c.id)).length;
              return `<li><div class="mini-goal-top"><span>${esc(tr.name)}</span><span class="muted small">${n}/${tr.challenges.length}</span></div>${progressBar((n / tr.challenges.length) * 100, tr.name + ' track', 'sm')}</li>`;
            }).join('')}
          </ul>
        </article>

        <article class="card span-4">
          <div class="card-header"><h3 class="card-title">Upcoming deadlines</h3><a class="link-sm" href="#planner">Planner</a></div>
          ${deadlines.length
            ? `<ul class="deadline-list">${deadlines.map((d) => {
                const n = daysUntil(d.date);
                const color = n <= 1 ? 'red' : n <= 5 ? 'amber' : 'gray';
                return `<li><span class="deadline-icon"><i data-lucide="${d.icon}" aria-hidden="true"></i></span><div><p>${esc(d.title)}</p><span class="muted small">${esc(d.kind)}</span></div>${badge(relDay(d.date), color)}</li>`;
              }).join('')}</ul>`
            : emptyState('calendar-check', 'No upcoming deadlines', 'Assignments, exams, and goal dates will appear here.')}
        </article>

        <article class="card span-4">
          <h3 class="card-title">Career roadmap</h3>
          <ol class="roadmap">
            ${roadmap.map((r) => `<li class="${r.done ? 'done' : ''} ${r.current ? 'current' : ''}"><span class="road-dot" aria-hidden="true">${r.done ? '<i data-lucide="check"></i>' : ''}</span><a href="${r.href}">${esc(r.label)}</a>${r.meta && !r.done ? `<span class="muted small">${r.meta}</span>` : ''}<span class="sr-only">${r.done ? '(complete)' : r.current ? '(current step)' : ''}</span></li>`).join('')}
          </ol>
        </article>

        <article class="card span-4">
          <h3 class="card-title">Recent achievements</h3>
          ${s.achievements.length
            ? `<ul class="achieve-list">${s.achievements.slice(0, 5).map((a) => `<li><span class="achieve-icon"><i data-lucide="${esc(a.icon)}" aria-hidden="true"></i></span><div><p>${esc(a.text)}</p><span class="muted small">${relDay(a.date)}</span></div></li>`).join('')}</ul>`
            : emptyState('award', 'No achievements yet', 'Complete tasks, goals, and challenges to see them here.')}
        </article>
      </div>`;
  }

  /* ---------- Planner ---------- */
  function renderPlanner() {
    const s = Store.state;
    const start = addDays(startOfWeek(today()), ui.weekOffset * 7);
    const days = [...Array(7)].map((_, i) => toISO(addDays(start, i)));
    const end = days[6];
    $('#week-label').textContent = `${fmtDate(days[0])} – ${fmtDate(end, { month: 'short', day: 'numeric', year: 'numeric' })}`;
    const weekTasks = s.tasks.filter((x) => x.date >= days[0] && x.date <= end);
    const mins = weekTasks.reduce((a, x) => a + Number(x.minutes || 0), 0);
    $('#week-summary').textContent = weekTasks.length
      ? `${plural(weekTasks.length, 'task')} · ${weekTasks.filter((x) => x.done).length} done · ${Math.floor(mins / 60)}h ${mins % 60}m planned`
      : 'No tasks this week yet';
    const t = todayISO();
    $('#week-grid').innerHTML = days.map((d) => {
      const items = s.tasks.filter((x) => x.date === d).sort((a, b) => Number(a.done) - Number(b.done));
      const dt = parseISO(d);
      const long = dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
      return `
        <section class="day-col ${d === t ? 'is-today' : ''} ${d < t ? 'is-past' : ''}" aria-label="${esc(long)}">
          <header class="day-head">
            <div><span class="day-name">${dt.toLocaleDateString('en-US', { weekday: 'short' })}</span><span class="day-date">${dt.getDate()}</span>${d === t ? '<span class="today-pill">Today</span>' : ''}</div>
            <button class="btn-icon btn-icon-sm" type="button" data-action="add-on-day" data-date="${d}" aria-label="Add a task on ${esc(long)}"><i data-lucide="plus" aria-hidden="true"></i></button>
          </header>
          ${items.length
            ? `<ul class="task-list task-list-compact">${items.map((x) => taskRow(x, { prefix: 'pl', compact: true, deletable: true })).join('')}</ul>`
            : '<p class="day-empty">No tasks</p>'}
        </section>`;
    }).join('');
  }

  function onTaskSubmit(e) {
    e.preventDefault();
    const f = e.target;
    const title = f.title.value.trim();
    const date = f.date.value;
    const minutes = Number(f.minutes.value);
    let ok = true;
    ok = setError(f.title, !title ? 'Enter a task title.' : title.length < 3 ? 'Use at least 3 characters.' : '') && ok;
    ok = setError(f.date, !isValidISO(date) ? 'Choose a valid date.' : '') && ok;
    ok = setError(f.minutes, !Number.isInteger(minutes) || minutes < 5 || minutes > 480 ? 'Enter a whole number from 5 to 480.' : '') && ok;
    if (!TASK_CATEGORIES[f.category.value]) ok = false;
    if (!ok) { const bad = f.querySelector('[aria-invalid="true"]'); if (bad) bad.focus(); return; }
    Store.state.tasks.push({ id: uid(), title, desc: f.desc.value.trim(), category: f.category.value, date, minutes, done: false });
    // Jump the planner to the week containing the new task
    ui.weekOffset = Math.round((startOfWeek(parseISO(date)) - startOfWeek(today())) / (7 * 86400000));
    f.title.value = ''; f.desc.value = '';
    save(`Task added for ${fmtDate(date, { weekday: 'short', month: 'short', day: 'numeric' })}`);
    f.title.focus();
  }

  /* ---------- Goals ---------- */
  function renderGoals() {
    const s = Store.state;
    const list = s.goals.filter((g) => ui.goalFilter === 'all' || (ui.goalFilter === 'done' ? g.done : !g.done))
      .sort((a, b) => Number(a.done) - Number(b.done) || a.target.localeCompare(b.target));
    $$('#goal-filters button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === ui.goalFilter)));
    const doneCount = s.goals.filter((g) => g.done).length;
    $('#goal-summary').textContent = `${plural(s.goals.length - doneCount, 'active goal')} · ${doneCount} completed`;
    if (!list.length) {
      $('#goal-list').innerHTML = `<li>${emptyState('target', ui.goalFilter === 'done' ? 'No completed goals yet' : 'No goals here yet', ui.goalFilter === 'done' ? 'Goals you complete will show up here.' : 'Add a goal on the left to start tracking progress.')}</li>`;
      return;
    }
    $('#goal-list').innerHTML = list.map((g) => {
      const n = daysUntil(g.target);
      const when = g.done ? 'Completed' : n < 0 ? `${Math.abs(n)} days overdue` : n === 0 ? 'Due today' : `${plural(n, 'day')} left`;
      return `
        <li class="goal-item card ${g.done ? 'is-done' : ''}">
          <div class="goal-top">
            <div>
              ${badge(g.category, GOAL_CATEGORIES[g.category])}
              <h3 class="goal-title">${esc(g.title)}</h3>
              <p class="goal-due ${!g.done && n < 0 ? 'overdue' : ''}"><i data-lucide="calendar" aria-hidden="true"></i> Target ${fmtDate(g.target, { month: 'short', day: 'numeric', year: 'numeric' })} · ${when}</p>
            </div>
            <div class="goal-actions">
              <button class="btn btn-sm ${g.done ? 'btn-secondary' : 'btn-success'}" type="button" data-action="toggle-goal" data-id="${g.id}">${g.done ? '<i data-lucide="rotate-ccw" aria-hidden="true"></i> Reopen' : '<i data-lucide="check" aria-hidden="true"></i> Mark complete'}</button>
              <button class="btn-icon btn-icon-sm btn-icon-danger" type="button" data-action="delete-goal" data-id="${g.id}" aria-label="Delete goal: ${esc(g.title)}"><i data-lucide="trash-2" aria-hidden="true"></i></button>
            </div>
          </div>
          <div class="goal-progress">${progressBar(g.progress, g.title + ' progress')}<span class="goal-pct" data-pct-for="${g.id}">${g.progress}%</span></div>
          ${g.done ? '' : `<label class="range-row"><span>Update progress</span><input type="range" min="0" max="100" step="5" value="${g.progress}" data-action="goal-progress" data-id="${g.id}" aria-label="Progress for ${esc(g.title)}"></label>`}
        </li>`;
    }).join('');
  }

  function onGoalSubmit(e) {
    e.preventDefault();
    const f = e.target;
    const title = f.title.value.trim();
    const target = f.target.value;
    let ok = setError(f.title, !title ? 'Describe your goal.' : title.length < 3 ? 'Use at least 3 characters.' : '');
    ok = setError(f.target, !isValidISO(target) ? 'Choose a target date.' : daysUntil(target) < 0 ? 'Pick today or a future date.' : '') && ok;
    if (!ok) { const bad = f.querySelector('[aria-invalid="true"]'); if (bad) bad.focus(); return; }
    const progress = clamp(Number(f.progress.value) || 0, 0, 100);
    Store.state.goals.push({ id: uid(), title, category: f.category.value, target, progress, done: progress >= 100 });
    f.title.value = ''; f.progress.value = 0; $('#goal-progress-out').textContent = '0%';
    ui.goalFilter = progress >= 100 ? 'done' : 'active';
    save('Goal added');
  }

  /* ---------- Career ---------- */
  function renderCareer() {
    const s = Store.state;
    const sel = MAJORS[s.career.selectedMajor] ? s.career.selectedMajor : 'Computer Science';
    const m = MAJORS[sel];
    $('#major-picker').innerHTML = MAJOR_LIST.map((name) => `<button type="button" class="chip chip-lg" data-action="select-major" data-major="${esc(name)}" aria-pressed="${name === sel}"><i data-lucide="${MAJORS[name].icon}" aria-hidden="true"></i> ${esc(name)}</button>`).join('');
    const isMine = s.profile.major === sel;
    const goal = s.profile.careerGoal;
    $('#career-panel').innerHTML = `
      <div class="career-hero card">
        <span class="icon-tile icon-lg icon-indigo"><i data-lucide="${m.icon}" aria-hidden="true"></i></span>
        <div class="career-hero-text"><h3>${esc(sel)}</h3><p>${esc(m.blurb)}</p></div>
        ${isMine ? '<span class="badge badge-green"><i data-lucide="check" aria-hidden="true"></i> Your major</span>' : `<button class="btn btn-secondary btn-sm" type="button" data-action="set-major" data-major="${esc(sel)}">Set as my major</button>`}
      </div>
      <div class="career-grid">
        <article class="card span-2">
          <h3 class="card-title"><i data-lucide="briefcase" aria-hidden="true"></i> Example career directions</h3>
          <div class="career-list">
            ${m.careers.map((c) => `
              <div class="career-item ${goal === c.title ? 'is-goal' : ''}">
                <div><p class="career-name">${esc(c.title)}</p><p class="muted small">${esc(c.note)}</p></div>
                ${goal === c.title ? '<span class="badge badge-purple">Your goal</span>' : `<button class="btn btn-ghost btn-sm" type="button" data-action="set-career-goal" data-goal="${esc(c.title)}">Set as goal</button>`}
              </div>`).join('')}
          </div>
        </article>
        <article class="card">
          <h3 class="card-title"><i data-lucide="sparkles" aria-hidden="true"></i> Relevant practical skills</h3>
          <div class="chip-wrap">${m.skills.map((x) => `<span class="chip chip-static">${esc(x)}</span>`).join('')}</div>
        </article>
        <article class="card">
          <h3 class="card-title"><i data-lucide="folder-open" aria-hidden="true"></i> Example projects</h3>
          <ul class="bullet-list">${m.projects.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
        </article>
        <article class="card">
          <h3 class="card-title"><i data-lucide="lightbulb" aria-hidden="true"></i> Suggested learning activities</h3>
          <ul class="activity-list">${m.activities.map((x) => `<li><span>${esc(x)}</span><button class="btn btn-ghost btn-sm" type="button" data-action="add-activity" data-title="${esc(x)}" aria-label="Add to today's plan: ${esc(x)}"><i data-lucide="plus" aria-hidden="true"></i> Today</button></li>`).join('')}</ul>
        </article>
        <article class="card">
          <h3 class="card-title"><i data-lucide="footprints" aria-hidden="true"></i> Potential next steps</h3>
          <ul class="step-checks">${m.nextSteps.map((x, i) => {
            const key = `${sel}::${i}`;
            return `<li><label class="check-row"><input type="checkbox" class="check" data-action="career-step" data-key="${esc(key)}" ${s.career.stepsDone[key] ? 'checked' : ''}><span>${esc(x)}</span></label></li>`;
          }).join('')}</ul>
        </article>
      </div>
      <p class="callout"><i data-lucide="info" aria-hidden="true"></i> Career directions are educational examples, not guarantees of employment. Requirements vary by employer and region — check with your academic advisor and career center.</p>`;
  }

  /* ---------- Skills ---------- */
  function renderSkills() {
    const s = Store.state;
    const key = TRACKS[s.skills.track] ? s.skills.track : 'cs';
    const tr = TRACKS[key];
    $('#track-picker').innerHTML = Object.entries(TRACKS).map(([k, t]) => `<button type="button" class="chip chip-lg" data-action="select-track" data-track="${k}" aria-pressed="${k === key}"><i data-lucide="${t.icon}" aria-hidden="true"></i> ${esc(t.name)}</button>`).join('');
    const n = tr.challenges.filter((c) => s.skills.completed.includes(c.id)).length;
    const mins = tr.challenges.filter((c) => s.skills.completed.includes(c.id)).reduce((a, c) => a + c.minutes, 0);
    $('#skills-summary').innerHTML = `
      <div class="card skills-summary">
        <div class="ring ring-md" style="--p:${Math.round((n / tr.challenges.length) * 100)}" role="img" aria-label="${n} of ${tr.challenges.length} challenges complete"><span>${n}/${tr.challenges.length}</span></div>
        <div class="skills-summary-text">
          <h3>${esc(tr.name)} track</h3>
          <p class="muted">${n} completed · ${mins} minutes of practice · ${s.skills.completed.length} completed across all tracks</p>
        </div>
        <p class="callout callout-compact"><i data-lucide="info" aria-hidden="true"></i> Demo library. The full product is designed to adapt challenges to your major, skill level, time, and goals.</p>
      </div>`;
    $('#challenge-list').innerHTML = tr.challenges.map((c) => {
      const done = s.skills.completed.includes(c.id);
      const saved = s.skills.saved.includes(c.id);
      return `
        <article class="challenge card ${done ? 'is-done' : ''}">
          <div class="challenge-top">
            <div class="badge-row">${badge(c.category, 'blue')}${badge(c.difficulty, c.difficulty === 'Beginner' ? 'green' : 'amber')}<span class="meta-time"><i data-lucide="clock" aria-hidden="true"></i> ${c.minutes} min</span></div>
            ${done ? '<span class="badge badge-green"><i data-lucide="check" aria-hidden="true"></i> Completed</span>' : ''}
          </div>
          <h3 class="challenge-title">${esc(c.title)}</h3>
          <details class="challenge-details" ${done ? '' : 'open'}>
            <summary>Instructions &amp; expected outcome</summary>
            <ol class="steps-list">${c.steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
            <div class="outcome"><i data-lucide="award" aria-hidden="true"></i><div><strong>Expected outcome</strong><p>${esc(c.outcome)}</p></div></div>
          </details>
          <div class="challenge-foot">
            ${done
              ? `<button class="btn btn-ghost btn-sm" type="button" data-action="uncomplete-challenge" data-id="${c.id}">Mark incomplete</button>
                 ${saved ? '<span class="saved-note"><i data-lucide="folder-check" aria-hidden="true"></i> Saved to portfolio</span>' : `<button class="btn btn-secondary btn-sm" type="button" data-action="save-challenge" data-id="${c.id}"><i data-lucide="folder-plus" aria-hidden="true"></i> Save to portfolio</button>`}`
              : `<button class="btn btn-primary btn-sm" type="button" data-action="complete-challenge" data-id="${c.id}"><i data-lucide="check" aria-hidden="true"></i> Mark complete</button>`}
          </div>
        </article>`;
    }).join('');
  }

  /* ---------- Portfolio ---------- */
  function renderPortfolio() {
    const s = Store.state;
    const list = s.portfolio.slice().sort((a, b) => b.date.localeCompare(a.date));
    $('#project-list').innerHTML = list.length
      ? list.map((p) => `
        <article class="project-card card">
          <div class="project-top">
            <span class="icon-tile icon-indigo"><i data-lucide="folder-open" aria-hidden="true"></i></span>
            <div class="project-actions">
              <button class="btn-icon btn-icon-sm" type="button" data-action="edit-project" data-id="${p.id}" aria-label="Edit project: ${esc(p.name)}"><i data-lucide="pencil" aria-hidden="true"></i></button>
              <button class="btn-icon btn-icon-sm btn-icon-danger" type="button" data-action="delete-project" data-id="${p.id}" aria-label="Delete project: ${esc(p.name)}"><i data-lucide="trash-2" aria-hidden="true"></i></button>
            </div>
          </div>
          <h3 class="project-name">${esc(p.name)}</h3>
          <p class="project-date"><i data-lucide="calendar-check" aria-hidden="true"></i> Completed ${fmtDate(p.date, { month: 'short', day: 'numeric', year: 'numeric' })}</p>
          <p class="project-desc">${esc(p.desc)}</p>
          ${p.skills.length ? `<div class="chip-wrap">${p.skills.map((x) => `<span class="chip chip-static chip-sm">${esc(x)}</span>`).join('')}</div>` : ''}
        </article>`).join('')
      : `<div class="card">${emptyState('folder-plus', 'Your portfolio is empty', 'Add a class project, or complete a skill challenge and save it here.', '<a class="btn btn-secondary btn-sm" href="#skills">Find a challenge</a>')}</div>`;
  }

  function fillProjectForm(p) {
    const f = $('#project-form');
    f.name.value = p ? p.name : '';
    f.desc.value = p ? p.desc : '';
    f.date.value = p ? p.date : todayISO();
    const skills = p ? p.skills : [];
    $$('#project-skills input').forEach((cb) => { cb.checked = skills.includes(cb.value); });
    f.other.value = skills.filter((x) => !SKILL_OPTIONS.includes(x)).join(', ');
    $('#project-form-title').innerHTML = p ? '<i data-lucide="pencil" aria-hidden="true"></i> Edit project' : '<i data-lucide="folder-plus" aria-hidden="true"></i> Add a project';
    $('#project-submit').innerHTML = p ? '<i data-lucide="save" aria-hidden="true"></i> Save changes' : '<i data-lucide="plus" aria-hidden="true"></i> Add project';
    $('#project-cancel').hidden = !p;
    $$('#project-form [aria-invalid]').forEach((el) => setError(el, ''));
    refreshIcons();
  }

  function onProjectSubmit(e) {
    e.preventDefault();
    const f = e.target;
    const name = f.name.value.trim();
    const desc = f.desc.value.trim();
    const date = f.date.value;
    let ok = setError(f.name, !name ? 'Give your project a name.' : '');
    ok = setError(f.desc, desc.length < 20 ? 'Add a short description (at least 20 characters).' : '') && ok;
    ok = setError(f.date, !isValidISO(date) ? 'Choose a completion date.' : '') && ok;
    if (!ok) { const bad = f.querySelector('[aria-invalid="true"]'); if (bad) bad.focus(); return; }
    const skills = $$('#project-skills input:checked').map((cb) => cb.value)
      .concat(f.other.value.split(',').map((x) => x.trim()).filter(Boolean))
      .filter((x, i, a) => a.indexOf(x) === i).slice(0, 12);
    const s = Store.state;
    if (ui.editingProject) {
      const p = s.portfolio.find((x) => x.id === ui.editingProject);
      if (p) Object.assign(p, { name, desc, date, skills });
      ui.editingProject = null;
      fillProjectForm(null);
      save('Project updated');
    } else {
      s.portfolio.push({ id: uid(), name, desc, skills, date });
      addAchievement(`Added portfolio project: ${name}`, 'folder-open');
      fillProjectForm(null);
      save('Project added to your portfolio');
    }
  }

  function renderPortfolioPreview() {
    const s = Store.state;
    const r = s.resume;
    const name = r.fullName.trim() || s.profile.name || 'Your Name';
    const headline = r.headline.trim() || [s.profile.major ? `${s.profile.major} student` : 'Student', s.profile.careerGoal ? `aspiring ${s.profile.careerGoal}` : ''].filter(Boolean).join(' · ');
    const skills = [...new Set(s.portfolio.flatMap((p) => p.skills))];
    $('#portfolio-preview').innerHTML = `
      <div class="pf">
        <header class="pf-head">
          <div class="pf-avatar" aria-hidden="true">${esc(name.charAt(0).toUpperCase())}</div>
          <div><h3>${esc(name)}</h3><p>${esc(headline)}</p></div>
        </header>
        ${skills.length ? `<div class="pf-section"><h4>Skills</h4><div class="chip-wrap">${skills.map((x) => `<span class="chip chip-static">${esc(x)}</span>`).join('')}</div></div>` : ''}
        <div class="pf-section">
          <h4>Projects</h4>
          ${s.portfolio.length
            ? `<div class="pf-grid">${s.portfolio.slice().sort((a, b) => b.date.localeCompare(a.date)).map((p) => `
                <article class="pf-card"><p class="pf-date">${fmtDate(p.date, { month: 'long', year: 'numeric' })}</p><h5>${esc(p.name)}</h5><p>${esc(p.desc)}</p>${p.skills.length ? `<p class="pf-skills">${p.skills.map(esc).join(' · ')}</p>` : ''}</article>`).join('')}</div>`
            : '<p class="muted">Add projects to see them in your portfolio.</p>'}
        </div>
        <p class="muted small pf-note">Preview only. Publishing a public portfolio page would require hosting and accounts in a future version.</p>
      </div>`;
  }

  /* ---------- Resume ---------- */
  function parseBlocks(text) {
    return String(text || '').split(/\n\s*\n/).map((b) => b.split('\n').map((l) => l.trim()).filter(Boolean)).filter((b) => b.length);
  }

  function renderResume() {
    const r = Store.state.resume;
    $$('[data-resume]').forEach((el) => { if (document.activeElement !== el) el.value = r[el.dataset.resume] || ''; });
    renderResumePaper();
  }

  function renderResumePaper() {
    const r = Store.state.resume;
    const contact = [r.email, r.phone, r.location, r.link].map((x) => x.trim()).filter(Boolean);
    const section = (title, key, hint) => {
      const blocks = parseBlocks(r[key]);
      if (!blocks.length) return `<section class="r-section r-empty"><h3>${title}</h3><p class="ph">${hint}</p></section>`;
      return `<section class="r-section"><h3>${title}</h3>${blocks.map((b) => `
        <div class="r-entry"><p class="r-entry-title">${esc(b[0])}</p>${b.length > 1 ? `<ul>${b.slice(1).map((l) => `<li>${esc(l.replace(/^[-•*]\s*/, ''))}</li>`).join('')}</ul>` : ''}</div>`).join('')}</section>`;
    };
    const skills = r.skills.split(',').map((x) => x.trim()).filter(Boolean);
    $('#resume-paper').innerHTML = `
      <header class="r-head">
        <h2 class="${r.fullName.trim() ? '' : 'ph'}">${esc(r.fullName.trim() || 'Your Name')}</h2>
        <p class="r-headline ${r.headline.trim() ? '' : 'ph'}">${esc(r.headline.trim() || 'Professional headline')}</p>
        <p class="r-contact ${contact.length ? '' : 'ph'}">${contact.length ? contact.map(esc).join('  |  ') : 'Email  |  Phone  |  City, State  |  Portfolio or LinkedIn'}</p>
      </header>
      ${section('Education', 'education', 'Add your school, degree, and expected graduation date.')}
      ${skills.length ? `<section class="r-section"><h3>Skills</h3><p class="r-skills">${skills.map(esc).join(' • ')}</p></section>` : '<section class="r-section r-empty"><h3>Skills</h3><p class="ph">List skills separated by commas.</p></section>'}
      ${section('Projects', 'projects', 'Add projects, or import them from your portfolio.')}
      ${section('Experience', 'experience', 'Add jobs, internships, or research roles.')}
      ${section('Activities & Volunteering', 'activities', 'Add clubs, leadership roles, or volunteer work.')}`;
  }

  /* ---------- Interview ---------- */
  function reviewAnswer(text, item) {
    const words = wordCount(text);
    const sentences = String(text).split(/[.!?]+/).map((x) => x.trim()).filter(Boolean);
    const avgLen = sentences.length ? words / sentences.length : words;
    const lower = text.toLowerCase();
    const keyHits = item.keys.filter((k) => lower.includes(k)).length;
    const hasExample = /\d|for example|for instance|when i|at my|during|in my|last (semester|year|summer)|project|%/.test(lower);
    const hasReflection = /learn|realiz|next time|would do|improv|takeaway|taught me|now i/.test(lower);
    return [
      { key: 'clarity', label: 'Clarity',
        ok: words >= 75 && words <= 300 && avgLen <= 30,
        msg: words < 75 ? `About ${words} words — add detail. Spoken answers usually land around 120–250 words.` : words > 300 ? `About ${words} words — consider trimming to stay under two minutes out loud.` : avgLen > 30 ? 'Some sentences are long. Shorter sentences are easier to follow when spoken.' : `About ${words} words with readable sentence length.`,
        self: 'I could say this clearly out loud in under two minutes.' },
      { key: 'relevance', label: 'Relevance',
        ok: keyHits >= 2,
        msg: keyHits >= 2 ? 'Your answer uses language connected to the question.' : 'Make sure you answer the exact question asked — restate its key idea early.',
        self: 'My first two sentences directly answer the question.' },
      { key: 'example', label: 'Specific example',
        ok: hasExample,
        msg: hasExample ? 'You reference a specific situation or detail.' : 'Add a concrete example — a class, job, project, or a number that shows impact.',
        self: 'I included a real situation, my action, and the result.' },
      { key: 'reflection', label: 'Reflection',
        ok: hasReflection,
        msg: hasReflection ? 'You show what you learned or would do differently.' : 'Close with what you learned or how you would apply it next time.',
        self: 'I ended with a takeaway that connects to this role.' },
    ];
  }

  function renderInterview() {
    const s = Store.state;
    const catKey = INTERVIEW[s.interview.category] ? s.interview.category : 'behavioral';
    const cat = INTERVIEW[catKey];
    const pos = (s.interview.positions[catKey] || 0) % cat.items.length;
    const item = cat.items[pos];
    $('#interview-cats').innerHTML = Object.entries(INTERVIEW).map(([k, c]) => `<button type="button" class="chip chip-lg" data-action="interview-cat" data-cat="${k}" aria-pressed="${k === catKey}"><i data-lucide="${c.icon}" aria-hidden="true"></i> ${esc(c.label)}</button>`).join('');
    const saved = s.interview.answers[item.id] || '';
    $('#interview-root').innerHTML = `
      <div class="interview-layout">
        <div class="card question-card">
          <div class="card-header">
            <p class="eyebrow">${esc(cat.label)} · Question ${pos + 1} of ${cat.items.length}</p>
            <span class="muted small">${plural(s.interview.practiced, 'answer')} practiced</span>
          </div>
          ${ui.revealed ? `
            <h3 class="question-text">${esc(item.q)}</h3>
            <p class="tip"><i data-lucide="lightbulb" aria-hidden="true"></i> ${esc(item.tip)}</p>
            <div class="field">
              <label for="interview-answer">Your answer</label>
              <textarea id="interview-answer" rows="8" maxlength="3000" placeholder="Write your answer as you would say it out loud…">${esc(saved)}</textarea>
              <p class="field-hint"><span id="answer-count">${wordCount(saved)}</span> words · aim for roughly 120–250</p>
            </div>
            <div class="form-actions">
              <button class="btn btn-primary" type="button" data-action="review-answer"><i data-lucide="clipboard-check" aria-hidden="true"></i> Review my answer</button>
              <button class="btn btn-secondary" type="button" data-action="next-question">Next question <i data-lucide="arrow-right" aria-hidden="true"></i></button>
            </div>` : `
            <div class="reveal-box">
              <span class="icon-tile icon-lg icon-indigo"><i data-lucide="mic" aria-hidden="true"></i></span>
              <p>Take a breath. When you're ready, reveal the question and answer as if you were in the room.</p>
              <button class="btn btn-primary" type="button" data-action="reveal-question"><i data-lucide="eye" aria-hidden="true"></i> Reveal question</button>
            </div>`}
        </div>
        <div id="interview-review">${ui.review ? reviewHtml(ui.review) : `
          <div class="card">${emptyState('clipboard-check', 'Self-review checklist', 'After you write an answer, you\'ll see a structured checklist covering clarity, relevance, specific examples, and reflection.')}</div>`}
        </div>
      </div>`;
  }

  function reviewHtml(items) {
    const score = items.filter((x) => x.ok).length;
    return `
      <div class="card review-card">
        <div class="card-header">
          <h3 class="card-title">Self-review checklist</h3>
          <span class="badge badge-amber" title="Simple pattern checks, not AI analysis">Rule-based demo feedback · not AI</span>
        </div>
        <p class="review-score"><strong>${score} of 4</strong> automatic checks passed</p>
        <ul class="review-list">
          ${items.map((x) => `
            <li class="review-item ${x.ok ? 'ok' : 'tip'}">
              <span class="review-icon"><i data-lucide="${x.ok ? 'check-circle-2' : 'alert-circle'}" aria-hidden="true"></i></span>
              <div>
                <p class="review-label">${esc(x.label)} <span class="sr-only">${x.ok ? 'looks good' : 'needs attention'}</span></p>
                <p class="review-msg">${esc(x.msg)}</p>
                <label class="check-row check-row-sm"><input type="checkbox" class="check"><span>${esc(x.self)}</span></label>
              </div>
            </li>`).join('')}
        </ul>
        <p class="muted small">These checks only look for simple patterns such as length, keywords, numbers, and reflection words. They can't judge quality — use them as prompts, then practice with a friend, mentor, or your career center.</p>
      </div>`;
  }

  /* ---------- Settings ---------- */
  function renderSettings() {
    const p = Store.state.profile;
    const f = $('#settings-form');
    f.name.value = p.name || '';
    f.year.value = p.year || 'First-year';
    f.major.value = p.major || 'Undecided';
    f.minutes.value = String(p.minutes || 30);
    f.careerGoal.value = p.careerUnsure ? '' : p.careerGoal || '';
    $('#plan-label').innerHTML = p.plan === 'plus'
      ? `<strong>Smart Mentor Plus</strong> · ${formatPrice(CONFIG.pricing.plusMonthly)}/month`
      : '<strong>Free</strong> · $0/month';
    $('#upgrade-btn').hidden = p.plan === 'plus';
    const acct = Auth.current();
    $('#account-label').innerHTML = acct && acct.demo
      ? 'Exploring the <strong>demo account</strong> (sample student Alex).'
      : `Signed in as <strong>${esc(acct ? acct.name : '')}</strong> · ${esc(acct ? acct.email : '')}`;
    $('#reset-label').textContent = Auth.isDemo() ? 'Reset to sample data' : 'Reset my workspace';
  }

  function onSettingsSubmit(e) {
    e.preventDefault();
    const f = e.target;
    const p = Store.state.profile;
    const goal = f.careerGoal.value.trim();
    Object.assign(p, { name: f.name.value.trim(), year: f.year.value, major: f.major.value, minutes: Number(f.minutes.value), careerGoal: goal, careerUnsure: !goal });
    if (MAJORS[p.major]) Store.state.career.selectedMajor = p.major;
    save('Profile saved');
  }

  /* ---------- Event delegation ---------- */
  function onClick(e) {
    const el = e.target.closest('[data-action]');
    if (!el || el.type === 'checkbox' || el.type === 'range') return;
    const s = Store.state;
    const id = el.dataset.id;
    switch (el.dataset.action) {
      case 'week-prev': ui.weekOffset -= 1; render(); break;
      case 'week-next': ui.weekOffset += 1; render(); break;
      case 'week-today': ui.weekOffset = 0; render(); break;
      case 'add-on-day': {
        $('#task-date').value = el.dataset.date;
        $('#task-title').focus();
        $('#task-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
        toast(`Adding a task for ${fmtDate(el.dataset.date, { weekday: 'long', month: 'short', day: 'numeric' })}`, 'info');
        break;
      }
      case 'delete-task': {
        const t = s.tasks.find((x) => x.id === id);
        s.tasks = s.tasks.filter((x) => x.id !== id);
        save(t ? `Deleted "${t.title}"` : 'Task deleted', 'info');
        break;
      }
      case 'goal-filter': ui.goalFilter = el.dataset.filter; render(); break;
      case 'toggle-goal': {
        const g = s.goals.find((x) => x.id === id);
        if (!g) break;
        g.done = !g.done;
        if (g.done) { g.progress = 100; addAchievement(`Goal completed: ${g.title}`, 'target'); }
        else if (g.progress >= 100) g.progress = 90;
        save(g.done ? 'Goal completed — great work!' : 'Goal reopened');
        break;
      }
      case 'delete-goal': {
        const g = s.goals.find((x) => x.id === id);
        if (g && !window.confirm(`Delete the goal "${g.title}"?`)) break;
        s.goals = s.goals.filter((x) => x.id !== id);
        save('Goal deleted', 'info');
        break;
      }
      case 'select-major': s.career.selectedMajor = el.dataset.major; Store.save(); render(); break;
      case 'set-major': s.profile.major = el.dataset.major; s.skills.track = MAJOR_TRACK[el.dataset.major] || s.skills.track; save(`Major set to ${el.dataset.major}`); break;
      case 'set-career-goal': s.profile.careerGoal = el.dataset.goal; s.profile.careerUnsure = false; save(`Career goal set: ${el.dataset.goal}`); break;
      case 'add-activity': s.tasks.push({ id: uid(), title: el.dataset.title, desc: 'Suggested learning activity from My Major & Career.', category: 'Skill Building', date: todayISO(), minutes: 20, done: false }); save("Added to today's plan"); break;
      case 'select-track': s.skills.track = el.dataset.track; Store.save(); render(); break;
      case 'complete-challenge': {
        const c = findChallenge(id);
        if (!c || s.skills.completed.includes(id)) break;
        s.skills.completed.push(id);
        addAchievement(`Completed challenge: ${c.title}`, 'award');
        save('Challenge complete! Save it to your portfolio to show your work.');
        break;
      }
      case 'uncomplete-challenge': s.skills.completed = s.skills.completed.filter((x) => x !== id); save('Marked incomplete', 'info'); break;
      case 'save-challenge': {
        const c = findChallenge(id);
        if (!c || s.skills.saved.includes(id)) break;
        s.portfolio.push({ id: uid(), name: c.title, desc: c.outcome + ' Completed as a Smart Mentor skill challenge.', skills: [c.category], date: todayISO(), source: c.id });
        s.skills.saved.push(id);
        save('Saved to your portfolio — edit it there to add details.');
        break;
      }
      case 'edit-project': {
        const p = s.portfolio.find((x) => x.id === id);
        if (!p) break;
        ui.editingProject = id;
        fillProjectForm(p);
        $('#project-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
        $('#project-name').focus({ preventScroll: true });
        break;
      }
      case 'cancel-edit-project': ui.editingProject = null; fillProjectForm(null); break;
      case 'delete-project': {
        const p = s.portfolio.find((x) => x.id === id);
        if (p && !window.confirm(`Delete the project "${p.name}"?`)) break;
        s.portfolio = s.portfolio.filter((x) => x.id !== id);
        if (p && p.source) s.skills.saved = s.skills.saved.filter((x) => x !== p.source);
        if (ui.editingProject === id) { ui.editingProject = null; fillProjectForm(null); }
        save('Project deleted', 'info');
        break;
      }
      case 'preview-portfolio': renderPortfolioPreview(); openDialog($('#portfolio-dialog')); refreshIcons(); break;
      case 'import-projects': {
        if (!s.portfolio.length) { toast('Your portfolio is empty — add a project first.', 'info'); break; }
        const existing = s.resume.projects;
        const blocks = s.portfolio.filter((p) => !existing.includes(p.name)).map((p) => `${p.name} (${fmtDate(p.date, { month: 'short', year: 'numeric' })})\n${p.desc}${p.skills.length ? `\nSkills: ${p.skills.join(', ')}` : ''}`);
        if (!blocks.length) { toast('All portfolio projects are already on your resume.', 'info'); break; }
        s.resume.projects = [existing.trim(), ...blocks].filter(Boolean).join('\n\n');
        save(`Imported ${plural(blocks.length, 'project')}`);
        break;
      }
      case 'print-resume': {
        if (!s.resume.fullName.trim()) { toast('Add your name before printing.', 'error'); $('#r-fullName').focus(); break; }
        window.print();
        break;
      }
      case 'clear-resume': {
        if (!window.confirm('Clear everything in the resume builder?')) break;
        s.resume = emptyResume();
        save('Resume cleared', 'info');
        break;
      }
      case 'interview-cat': s.interview.category = el.dataset.cat; ui.revealed = false; ui.review = null; Store.save(); render(); break;
      case 'reveal-question': ui.revealed = true; render(); { const ta = $('#interview-answer'); if (ta) ta.focus(); } break;
      case 'next-question': {
        const k = s.interview.category;
        s.interview.positions[k] = ((s.interview.positions[k] || 0) + 1) % INTERVIEW[k].items.length;
        ui.revealed = true; ui.review = null;
        Store.save(); render();
        const ta = $('#interview-answer'); if (ta) ta.focus();
        break;
      }
      case 'review-answer': {
        const ta = $('#interview-answer');
        const text = ta ? ta.value.trim() : '';
        if (wordCount(text) < 15) { setError(ta, 'Write at least a few sentences (15+ words) to get a review.'); ta.focus(); break; }
        const k = s.interview.category;
        const item = INTERVIEW[k].items[(s.interview.positions[k] || 0) % INTERVIEW[k].items.length];
        if (!s.interview.answers[item.id]) s.interview.practiced += 1;
        s.interview.answers[item.id] = text;
        ui.review = reviewAnswer(text, item);
        Store.save(); render();
        const r = $('#interview-review'); if (r) r.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        break;
      }
      case 'reset-demo': {
        if (!window.confirm(Auth.isDemo() ? 'Reset the demo account to the original sample data? Your changes will be lost.' : 'Reset your workspace? Tasks, goals, projects, resume, and progress will be cleared.')) break;
        Store.reset();
        ui.weekOffset = 0; ui.editingProject = null; ui.review = null; ui.revealed = false;
        try { localStorage.removeItem(CONFIG.draftKey); } catch (err) { /* ignore */ }
        fillProjectForm(null);
        save(Auth.isDemo() ? 'Demo data reset to the sample account' : 'Workspace reset');
        break;
      }
      case 'clear-demo': {
        if (!window.confirm('Start with an empty workspace? Tasks, goals, projects, resume, and progress will be cleared. Your profile is kept.')) break;
        Object.assign(s, { tasks: [], goals: [], portfolio: [], achievements: [], resume: emptyResume() });
        s.skills.completed = []; s.skills.saved = [];
        s.interview.practiced = 0; s.interview.answers = {};
        s.career.stepsDone = {};
        ui.editingProject = null; fillProjectForm(null);
        save('Workspace cleared', 'info');
        break;
      }
      case 'logout': {
        Auth.clear();
        window.location.href = 'login.html';
        break;
      }
      default: break;
    }
  }

  function onChange(e) {
    const el = e.target;
    const action = el.dataset && el.dataset.action;
    const s = Store.state;
    if (action === 'toggle-task') {
      const t = s.tasks.find((x) => x.id === el.dataset.id);
      if (!t) return;
      t.done = el.checked;
      const todays = s.tasks.filter((x) => x.date === todayISO());
      const allDone = t.done && t.date === todayISO() && todays.length > 0 && todays.every((x) => x.done);
      if (allDone) addAchievement("Completed every task on today's plan", 'party-popper');
      const focusId = el.id;
      save(allDone ? "Everything on today's plan is done!" : '');
      const again = document.getElementById(focusId);
      if (again) again.focus();
    } else if (action === 'career-step') {
      s.career.stepsDone[el.dataset.key] = el.checked;
      Store.save();
    } else if (action === 'goal-progress') {
      const g = s.goals.find((x) => x.id === el.dataset.id);
      if (!g) return;
      g.progress = clamp(Number(el.value), 0, 100);
      if (g.progress >= 100 && !g.done) { g.done = true; addAchievement(`Goal completed: ${g.title}`, 'target'); save('Goal reached 100% — marked complete!'); }
      else Store.save();
    }
  }

  function onInput(e) {
    const el = e.target;
    if (el.dataset && el.dataset.action === 'goal-progress') {
      const pct = el.value;
      const item = el.closest('.goal-item');
      const bar = item && item.querySelector('.progress');
      if (bar) { bar.firstElementChild.style.width = pct + '%'; bar.setAttribute('aria-valuenow', pct); }
      const lbl = item && item.querySelector('.goal-pct');
      if (lbl) lbl.textContent = pct + '%';
    } else if (el.dataset && el.dataset.resume) {
      Store.state.resume[el.dataset.resume] = el.value;
      renderResumePaper();
      clearTimeout(onInput.t);
      onInput.t = setTimeout(() => Store.save(), 300);
    } else if (el.id === 'interview-answer') {
      const c = $('#answer-count');
      if (c) c.textContent = wordCount(el.value);
      if (el.hasAttribute('aria-invalid') && wordCount(el.value) >= 15) setError(el, '');
    }
  }

  /* =========================================================
     9. INFO PAGE + BOOT
     ========================================================= */
  function initInfo() {
    syncNavForAuth();
    const toggle = $('#nav-toggle');
    const menu = $('#mobile-menu');
    if (toggle && menu) {
      toggle.addEventListener('click', () => {
        const open = menu.hidden;
        menu.hidden = !open;
        toggle.setAttribute('aria-expanded', String(open));
      });
    }
  }

  function boot() {
    const page = document.body.dataset.page;
    initYear();
    initDialogs();
    if (page === 'landing') initLanding();
    else if (page === 'dashboard') initDashboard();
    else if (page === 'info') initInfo();
    else if (page === 'login') initLogin();
    else if (page === 'checkout') initCheckout();
    refreshIcons();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
