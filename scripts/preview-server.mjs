// @ts-check
import http from 'node:http';

const PORT = 3002;

const HTML_CONTENT = `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CRMONIA | Enterprise Hierarchical CRM & GTM Control Plane</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          fontFamily: {
            sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
            mono: ['"JetBrains Mono"', 'monospace'],
          },
          colors: {
            obsidian: {
              950: '#07090e',
              900: '#0c0f17',
              850: '#111522',
              800: '#171c2d',
              700: '#232b42',
              600: '#344063',
            },
            crimson: {
              500: '#ef4444',
              600: '#dc2626',
            },
            brand: {
              emerald: '#10b981',
              cyan: '#06b6d4',
              violet: '#8b5cf6',
              amber: '#f59e0b',
            }
          }
        }
      }
    }
  </script>
  <style>
    body {
      background-color: #07090e;
      color: #f1f5f9;
      font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
      overflow-x: hidden;
    }
    .custom-scrollbar::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }
    .custom-scrollbar::-webkit-scrollbar-track {
      background: #0c0f17;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb {
      background: #232b42;
      border-radius: 9999px;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb:hover {
      background: #344063;
    }
    .glass-card {
      background: rgba(17, 21, 34, 0.75);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.07);
    }
    .glass-card:hover {
      border-color: rgba(255, 255, 255, 0.14);
    }
    .glow-cyan {
      box-shadow: 0 0 25px -5px rgba(6, 182, 212, 0.25);
    }
    .glow-violet {
      box-shadow: 0 0 25px -5px rgba(139, 92, 246, 0.25);
    }
    .drawer-backdrop {
      background: rgba(0, 0, 0, 0.65);
      backdrop-filter: blur(4px);
    }
  </style>
</head>
<body class="min-h-screen flex flex-col antialiased selection:bg-cyan-500/20 selection:text-cyan-300">

  <!-- TOP ENTERPRISE BANNER -->
  <header class="h-16 border-b border-obsidian-700/60 bg-obsidian-900/90 backdrop-blur-md sticky top-0 z-40 px-6 flex items-center justify-between">
    <div class="flex items-center gap-4">
      <div class="flex items-center gap-2.5">
        <div class="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 via-indigo-600 to-violet-500 flex items-center justify-center font-black text-white text-base shadow-lg shadow-cyan-500/20">
          C
        </div>
        <div>
          <span class="font-extrabold text-lg tracking-tight text-white flex items-center gap-1.5">
            CRMONIA <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-950/80 text-cyan-400 border border-cyan-800/40">ENTERPRISE</span>
          </span>
          <p class="text-[11px] text-slate-400 font-mono -mt-1">N-Tier Subtree Hierarchy &middot; Governed GTM</p>
        </div>
      </div>

      <div class="h-5 w-[1px] bg-obsidian-700/80 mx-1"></div>

      <!-- Current Org Node Selector -->
      <div class="flex items-center gap-2 bg-obsidian-850 border border-obsidian-700/80 rounded-lg px-3 py-1.5 text-xs">
        <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
        <span class="text-slate-400">Context:</span>
        <span id="activeOrgBadge" class="font-semibold text-slate-200">Global Corporate Parent (HQ)</span>
        <span id="activePathBadge" class="text-[10px] font-mono bg-obsidian-800 text-cyan-300 px-1.5 py-0.5 rounded border border-cyan-900/50">root</span>
        <button onclick="openOrgSelectorModal()" class="text-xs text-cyan-400 hover:text-cyan-300 ml-1 underline decoration-cyan-500/40">Switch</button>
      </div>
    </div>

    <!-- Active Navigation Tabs -->
    <nav class="hidden md:flex items-center gap-1 bg-obsidian-850/80 p-1 rounded-xl border border-obsidian-700/50">
      <button onclick="switchTab('pipeline')" id="tab-btn-pipeline" class="tab-btn active px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all bg-gradient-to-r from-cyan-500 to-indigo-600 text-white shadow-sm">
        Pipeline & Leads
      </button>
      <button onclick="switchTab('hierarchy')" id="tab-btn-hierarchy" class="tab-btn px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-white transition-all">
        Org Hierarchy (ltree)
      </button>
      <button onclick="switchTab('playbooks')" id="tab-btn-playbooks" class="tab-btn px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-white transition-all">
        GTM Playbooks
      </button>
      <button onclick="switchTab('custody')" id="tab-btn-custody" class="tab-btn px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-white transition-all">
        Sender Custody & BYOK
      </button>
      <button onclick="switchTab('policies')" id="tab-btn-policies" class="tab-btn px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-white transition-all">
        Deny-Wins Policies
      </button>
    </nav>

    <!-- Top Right Actions -->
    <div class="flex items-center gap-3">
      <div class="hidden sm:flex items-center gap-2 text-xs font-mono text-slate-400 bg-obsidian-850 px-2.5 py-1.5 rounded-lg border border-obsidian-700/50">
        <span class="text-emerald-400 font-bold">RLS ACTIVE</span>
        <span>&middot;</span>
        <span class="text-slate-300">FORCE RLS</span>
      </div>
      <button onclick="openNewDealModal()" class="flex items-center gap-1.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-bold px-3.5 py-2 rounded-lg shadow-lg shadow-cyan-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/></svg>
        <span>+ New Deal</span>
      </button>
    </div>
  </header>

  <!-- MAIN APPLICATION CONTAINER -->
  <main class="flex-1 flex flex-col p-6 max-w-[1600px] w-full mx-auto">

    <!-- ========================================== -->
    <!-- VIEW 1: PIPELINE & LEADS (KANBAN & STATS)  -->
    <!-- ========================================== -->
    <section id="view-pipeline" class="tab-view flex-1 flex flex-col gap-6">
      <!-- KPI Top Summary Bar -->
      <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        <div class="glass-card p-4 rounded-xl border-l-4 border-l-cyan-500 flex flex-col">
          <span class="text-xs text-slate-400 font-medium">Pipeline Value</span>
          <div class="flex items-baseline gap-2 mt-1">
            <span id="kpi-total-val" class="text-2xl font-black text-white font-mono tracking-tight">$335,000</span>
            <span class="text-[11px] font-semibold text-emerald-400">+18% MoM</span>
          </div>
          <span class="text-[11px] text-slate-400 mt-1">Weighted Downward Subtree</span>
        </div>

        <div class="glass-card p-4 rounded-xl border-l-4 border-l-indigo-500 flex flex-col">
          <span class="text-xs text-slate-400 font-medium">Active Leads</span>
          <div class="flex items-baseline gap-2 mt-1">
            <span id="kpi-total-leads" class="text-2xl font-black text-white font-mono tracking-tight">5</span>
            <span class="text-[11px] font-semibold text-cyan-400">0 Overdue SLA</span>
          </div>
          <span class="text-[11px] text-slate-400 mt-1">100% Attributed Ingestion</span>
        </div>

        <div class="glass-card p-4 rounded-xl border-l-4 border-l-brand-amber flex flex-col">
          <span class="text-xs text-slate-400 font-medium">Conversion Win Rate</span>
          <div class="flex items-baseline gap-2 mt-1">
            <span class="text-2xl font-black text-white font-mono tracking-tight">34.8%</span>
            <span class="text-[11px] font-semibold text-emerald-400">&uarr; 4.2%</span>
          </div>
          <span class="text-[11px] text-slate-400 mt-1">Enterprise Average</span>
        </div>

        <div class="glass-card p-4 rounded-xl border-l-4 border-l-violet-500 flex flex-col">
          <span class="text-xs text-slate-400 font-medium">Rotational Mailboxes</span>
          <div class="flex items-baseline gap-2 mt-1">
            <span class="text-2xl font-black text-white font-mono tracking-tight">8 / 10</span>
            <span class="text-[11px] font-semibold text-emerald-400">98.4% Health</span>
          </div>
          <span class="text-[11px] text-slate-400 mt-1">Zero Reputation Drift</span>
        </div>

        <div class="glass-card p-4 rounded-xl border-l-4 border-l-emerald-500 flex flex-col col-span-2 md:col-span-4 lg:col-span-1">
          <span class="text-xs text-slate-400 font-medium">Jurisdiction Boundary</span>
          <div class="flex items-baseline gap-2 mt-1">
            <span class="text-xl font-bold text-white font-mono">CA & US</span>
            <span class="text-[10px] font-mono bg-emerald-950 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-800/50">FENCED</span>
          </div>
          <span class="text-[11px] text-slate-400 mt-1">PIPEDA + State Compliance</span>
        </div>
      </div>

      <!-- Pipeline Controls & Filter Bar -->
      <div class="flex flex-wrap items-center justify-between gap-4 bg-obsidian-900/60 p-3 rounded-xl border border-obsidian-700/60">
        <div class="flex items-center gap-3 flex-1 min-w-[280px]">
          <div class="relative flex-1 max-w-sm">
            <input type="text" id="leadSearchInput" oninput="filterLeads()" placeholder="Search deals, contacts, companies..." class="w-full bg-obsidian-950 border border-obsidian-700/80 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all font-sans">
            <svg class="w-4 h-4 text-slate-500 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          </div>
          <select id="countryFilter" onchange="filterLeads()" class="bg-obsidian-950 border border-obsidian-700/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-cyan-500 font-sans">
            <option value="ALL">All Jurisdictions (Global)</option>
            <option value="CA">Canada (CA)</option>
            <option value="US">United States (US)</option>
          </select>
        </div>

        <div class="flex items-center gap-2">
          <button onclick="openSubtreeMoveModal()" class="flex items-center gap-1.5 bg-obsidian-850 hover:bg-obsidian-800 text-cyan-300 text-xs font-semibold px-3 py-1.5 rounded-lg border border-cyan-800/40 transition-all">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/></svg>
            <span>Subtree Move Wizard</span>
          </button>
          <button onclick="showToast('Synced 5 deals with local PostgreSQL crmonia instance.')" class="p-1.5 rounded-lg bg-obsidian-850 hover:bg-obsidian-800 text-slate-400 hover:text-white border border-obsidian-700/60" title="Refresh State">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
          </button>
        </div>
      </div>

      <!-- KANBAN BOARD 5 STAGES -->
      <div class="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 items-start flex-1">
        
        <!-- COLUMN 1: NEW -->
        <div class="bg-obsidian-900/60 rounded-xl border border-obsidian-800/80 p-3 flex flex-col gap-3 min-h-[450px]">
          <div class="flex items-center justify-between px-1">
            <div class="flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-full bg-cyan-400"></span>
              <span class="text-xs font-bold text-slate-200 uppercase tracking-wider">New</span>
            </div>
            <span id="col-count-NEW" class="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-obsidian-800 text-cyan-300 border border-cyan-900/50">1</span>
          </div>
          <div id="col-cards-NEW" class="flex flex-col gap-3 min-h-[350px]"></div>
        </div>

        <!-- COLUMN 2: QUALIFIED -->
        <div class="bg-obsidian-900/60 rounded-xl border border-obsidian-800/80 p-3 flex flex-col gap-3 min-h-[450px]">
          <div class="flex items-center justify-between px-1">
            <div class="flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-full bg-indigo-400"></span>
              <span class="text-xs font-bold text-slate-200 uppercase tracking-wider">Qualified</span>
            </div>
            <span id="col-count-QUALIFIED" class="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-obsidian-800 text-indigo-300 border border-indigo-900/50">1</span>
          </div>
          <div id="col-cards-QUALIFIED" class="flex flex-col gap-3 min-h-[350px]"></div>
        </div>

        <!-- COLUMN 3: PROPOSAL -->
        <div class="bg-obsidian-900/60 rounded-xl border border-obsidian-800/80 p-3 flex flex-col gap-3 min-h-[450px]">
          <div class="flex items-center justify-between px-1">
            <div class="flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-full bg-brand-amber"></span>
              <span class="text-xs font-bold text-slate-200 uppercase tracking-wider">Proposal</span>
            </div>
            <span id="col-count-PROPOSAL" class="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-obsidian-800 text-amber-300 border border-amber-900/50">1</span>
          </div>
          <div id="col-cards-PROPOSAL" class="flex flex-col gap-3 min-h-[350px]"></div>
        </div>

        <!-- COLUMN 4: NEGOTIATION -->
        <div class="bg-obsidian-900/60 rounded-xl border border-obsidian-800/80 p-3 flex flex-col gap-3 min-h-[450px]">
          <div class="flex items-center justify-between px-1">
            <div class="flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-full bg-violet-400"></span>
              <span class="text-xs font-bold text-slate-200 uppercase tracking-wider">Negotiation</span>
            </div>
            <span id="col-count-NEGOTIATION" class="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-obsidian-800 text-violet-300 border border-violet-900/50">1</span>
          </div>
          <div id="col-cards-NEGOTIATION" class="flex flex-col gap-3 min-h-[350px]"></div>
        </div>

        <!-- COLUMN 5: WON -->
        <div class="bg-obsidian-900/60 rounded-xl border border-obsidian-800/80 p-3 flex flex-col gap-3 min-h-[450px]">
          <div class="flex items-center justify-between px-1">
            <div class="flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
              <span class="text-xs font-bold text-slate-200 uppercase tracking-wider">Won</span>
            </div>
            <span id="col-count-WON" class="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-obsidian-800 text-emerald-300 border border-emerald-900/50">1</span>
          </div>
          <div id="col-cards-WON" class="flex flex-col gap-3 min-h-[350px]"></div>
        </div>

      </div>
    </section>

    <!-- ========================================== -->
    <!-- VIEW 2: ORG HIERARCHY & TREE (LTREE)       -->
    <!-- ========================================== -->
    <section id="view-hierarchy" class="tab-view hidden flex-1 flex flex-col gap-6">
      <div class="flex flex-wrap items-center justify-between gap-4 bg-obsidian-900/60 p-4 rounded-xl border border-obsidian-700/60">
        <div>
          <h2 class="text-lg font-bold text-white tracking-tight flex items-center gap-2">
            Enterprise Organizational Topology
            <span class="text-xs font-mono bg-cyan-950 text-cyan-400 px-2 py-0.5 rounded border border-cyan-800/40">PostgreSQL ltree</span>
          </h2>
          <p class="text-xs text-slate-400 mt-0.5">Asymmetric downward visibility: Parents inspect subtrees; siblings and up-chain nodes are strictly isolated.</p>
        </div>
        <button onclick="openSubtreeMoveModal()" class="bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white text-xs font-bold px-4 py-2 rounded-lg shadow-lg shadow-cyan-500/20 transition-all flex items-center gap-2">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/></svg>
          <span>Launch Move & Merge Wizard</span>
        </button>
      </div>

      <!-- Tree Visualization Cards -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="lg:col-span-2 glass-card p-6 rounded-xl flex flex-col gap-4">
          <span class="text-xs font-bold text-slate-300 uppercase tracking-wider">Subtree Node Explorer</span>
          <div id="orgTreeContainer" class="flex flex-col gap-2 font-mono text-xs">
            <!-- Dynamically populated tree -->
          </div>
        </div>

        <div class="glass-card p-6 rounded-xl flex flex-col gap-4">
          <span class="text-xs font-bold text-slate-300 uppercase tracking-wider">Governance Guarantees</span>
          <div class="flex flex-col gap-3 text-xs text-slate-300">
            <div class="p-3 rounded-lg bg-obsidian-900/80 border border-obsidian-700/60">
              <span class="font-bold text-cyan-400 block mb-1">1. Asymmetric Visibility (RLS)</span>
              A manager at <code class="text-cyan-300">root.ca</code> reads all records for Toronto, Ottawa, and Ontario. Toronto reps have zero access to Ottawa or US nodes.
            </div>
            <div class="p-3 rounded-lg bg-obsidian-900/80 border border-obsidian-700/60">
              <span class="font-bold text-brand-emerald block mb-1">2. Jurisdictional Boundary Locks</span>
              Cross-country subtree moves (e.g., Canadian branch into US parent) trigger immediate blocking exceptions to protect PIPEDA / GDPR residency.
            </div>
            <div class="p-3 rounded-lg bg-obsidian-900/80 border border-obsidian-700/60">
              <span class="font-bold text-violet-400 block mb-1">3. Non-Blocking Live Move</span>
              PostgreSQL <code class="text-violet-300">subpath()</code> recalculates all descendant paths atomically in one transaction with zero downtime.
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ========================================== -->
    <!-- VIEW 3: GTM PLAYBOOKS                      -->
    <!-- ========================================== -->
    <section id="view-playbooks" class="tab-view hidden flex-1 flex flex-col gap-6">
      <div class="flex flex-wrap items-center justify-between gap-4 bg-obsidian-900/60 p-4 rounded-xl border border-obsidian-700/60">
        <div>
          <h2 class="text-lg font-bold text-white tracking-tight flex items-center gap-2">
            Governed GTM Playbooks & Sequence Engine
            <span class="text-xs font-mono bg-violet-950 text-violet-400 px-2 py-0.5 rounded border border-violet-800/40">Zero 2nd CRM Drift</span>
          </h2>
          <p class="text-xs text-slate-400 mt-0.5">Corporate templates published with locked compliance tokens; localized branches clone & activate within bounds.</p>
        </div>
        <button onclick="showToast('Playbook cloned to Toronto Branch with active compliance tokens.')" class="bg-gradient-to-r from-violet-500 to-indigo-600 hover:from-violet-400 hover:to-indigo-500 text-white text-xs font-bold px-4 py-2 rounded-lg shadow-lg shadow-violet-500/20 transition-all flex items-center gap-2">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
          <span>+ Clone Playbook to Subtree</span>
        </button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <!-- Playbook Card 1 -->
        <div class="glass-card p-5 rounded-xl flex flex-col justify-between border-t-4 border-t-cyan-500">
          <div>
            <div class="flex items-center justify-between mb-2">
              <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/40">GLOBAL_HQ TEMPLATE</span>
              <span class="text-xs font-semibold text-emerald-400 flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-emerald-400"></span> ACTIVE</span>
            </div>
            <h3 class="font-bold text-white text-base">Commercial Fleet & Liability Outbound</h3>
            <p class="text-xs text-slate-400 mt-1">Multi-touch email + LinkedIn sequence for regional commercial fleet operators ($50k–$500k ARR).</p>

            <div class="mt-4 flex flex-col gap-2 font-mono text-xs">
              <div class="flex justify-between text-slate-400 border-b border-obsidian-700/40 pb-1">
                <span>Steps:</span>
                <span class="text-slate-200">4 Touchpoints (12 Days)</span>
              </div>
              <div class="flex justify-between text-slate-400 border-b border-obsidian-700/40 pb-1">
                <span>Tokens:</span>
                <span class="text-cyan-400">{{branch_city}}, {{sender_name}}</span>
              </div>
              <div class="flex justify-between text-slate-400">
                <span>Compliance:</span>
                <span class="text-emerald-400">Locked Global Disclaimer</span>
              </div>
            </div>
          </div>

          <div class="mt-5 pt-3 border-t border-obsidian-700/60 flex items-center justify-between">
            <span class="text-xs text-slate-400 font-mono">1,420 Enrolled</span>
            <button onclick="inspectPlaybook('Commercial Fleet & Liability Outbound')" class="text-xs font-semibold text-cyan-400 hover:text-cyan-300">Inspect Steps &rarr;</button>
          </div>
        </div>

        <!-- Playbook Card 2 -->
        <div class="glass-card p-5 rounded-xl flex flex-col justify-between border-t-4 border-t-violet-500">
          <div>
            <div class="flex items-center justify-between mb-2">
              <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-violet-950 text-violet-300 border border-violet-800/40">BRANCH LOCALIZED</span>
              <span class="text-xs font-semibold text-emerald-400 flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-emerald-400"></span> ACTIVE</span>
            </div>
            <h3 class="font-bold text-white text-base">Executive Key-Person Life Expansion</h3>
            <p class="text-xs text-slate-400 mt-1">High-net-worth business owners policy review; localized to Toronto Financial District postal codes.</p>

            <div class="mt-4 flex flex-col gap-2 font-mono text-xs">
              <div class="flex justify-between text-slate-400 border-b border-obsidian-700/40 pb-1">
                <span>Steps:</span>
                <span class="text-slate-200">3 Touchpoints (8 Days)</span>
              </div>
              <div class="flex justify-between text-slate-400 border-b border-obsidian-700/40 pb-1">
                <span>Tokens:</span>
                <span class="text-violet-400">{{exec_title}}, {{adviser_license}}</span>
              </div>
              <div class="flex justify-between text-slate-400">
                <span>Compliance:</span>
                <span class="text-emerald-400">FSRA Compliant</span>
              </div>
            </div>
          </div>

          <div class="mt-5 pt-3 border-t border-obsidian-700/60 flex items-center justify-between">
            <span class="text-xs text-slate-400 font-mono">380 Enrolled</span>
            <button onclick="inspectPlaybook('Executive Key-Person Life Expansion')" class="text-xs font-semibold text-violet-400 hover:text-violet-300">Inspect Steps &rarr;</button>
          </div>
        </div>

        <!-- Playbook Card 3 -->
        <div class="glass-card p-5 rounded-xl flex flex-col justify-between border-t-4 border-t-brand-amber">
          <div>
            <div class="flex items-center justify-between mb-2">
              <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800/40">GLOBAL_HQ TEMPLATE</span>
              <span class="text-xs font-semibold text-amber-400 flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-amber-400"></span> REVIEW GATED</span>
            </div>
            <h3 class="font-bold text-white text-base">Inbound Speed-to-Lead Escalation</h3>
            <p class="text-xs text-slate-400 mt-1">Immediate automated SMS + email acknowledgment within 2 minutes of web form capture ticket signing.</p>

            <div class="mt-4 flex flex-col gap-2 font-mono text-xs">
              <div class="flex justify-between text-slate-400 border-b border-obsidian-700/40 pb-1">
                <span>Steps:</span>
                <span class="text-slate-200">5 Touchpoints (14 Days)</span>
              </div>
              <div class="flex justify-between text-slate-400 border-b border-obsidian-700/40 pb-1">
                <span>Tokens:</span>
                <span class="text-amber-400">{{first_name}}, {{preferred_rep}}</span>
              </div>
              <div class="flex justify-between text-slate-400">
                <span>Compliance:</span>
                <span class="text-emerald-400">CASL Opt-In Verified</span>
              </div>
            </div>
          </div>

          <div class="mt-5 pt-3 border-t border-obsidian-700/60 flex items-center justify-between">
            <span class="text-xs text-slate-400 font-mono">2,890 Enrolled</span>
            <button onclick="inspectPlaybook('Inbound Speed-to-Lead Escalation')" class="text-xs font-semibold text-amber-400 hover:text-amber-300">Inspect Steps &rarr;</button>
          </div>
        </div>
      </div>
    </section>

    <!-- ========================================== -->
    <!-- VIEW 4: SENDER CUSTODY & BYOK              -->
    <!-- ========================================== -->
    <section id="view-custody" class="tab-view hidden flex-1 flex flex-col gap-6">
      <div class="flex flex-wrap items-center justify-between gap-4 bg-obsidian-900/60 p-4 rounded-xl border border-obsidian-700/60">
        <div>
          <h2 class="text-lg font-bold text-white tracking-tight flex items-center gap-2">
            Rotational Sender Custody & Mailbox Pools
            <span class="text-xs font-mono bg-emerald-950 text-emerald-400 px-2 py-0.5 rounded border border-emerald-800/40">SPF &middot; DKIM &middot; DMARC Verified</span>
          </h2>
          <p class="text-xs text-slate-400 mt-0.5">Branch-isolated mailbox pools prevent primary domain blacklisting with automated warm-up and ramp curves.</p>
        </div>
        <button onclick="showToast('Rotational pool health scan completed: All 4 mailboxes in optimal deliverability zone.')" class="bg-obsidian-850 hover:bg-obsidian-800 text-cyan-300 text-xs font-bold px-4 py-2 rounded-lg border border-cyan-800/40 transition-all flex items-center gap-2">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          <span>Run Pool Health Diagnostic</span>
        </button>
      </div>

      <div class="glass-card rounded-xl overflow-hidden border border-obsidian-700/60">
        <div class="px-6 py-4 bg-obsidian-900/90 border-b border-obsidian-700/60 flex items-center justify-between">
          <span class="text-xs font-bold text-slate-300 uppercase tracking-wider">Registered Mailbox Pools (Ontario / Toronto Branch)</span>
          <span class="text-xs font-mono text-cyan-400">Daily Cap: 40 emails / mailbox</span>
        </div>
        <div class="divide-y divide-obsidian-800/60 text-xs">
          <div class="px-6 py-3.5 flex items-center justify-between">
            <div class="flex items-center gap-3">
              <span class="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
              <div>
                <span class="font-mono font-semibold text-slate-200">sarah.c@outreach.crmonia-ca.com</span>
                <span class="text-[11px] text-slate-400 block font-sans">Assigned: Sarah Chen &middot; Warmup: Day 42 (Mature)</span>
              </div>
            </div>
            <div class="flex items-center gap-4 font-mono">
              <span class="text-slate-400">Sent Today: <strong class="text-slate-200">28 / 40</strong></span>
              <span class="text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800/40">99.2% Health</span>
            </div>
          </div>

          <div class="px-6 py-3.5 flex items-center justify-between">
            <div class="flex items-center gap-3">
              <span class="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
              <div>
                <span class="font-mono font-semibold text-slate-200">marcus.t@outreach.crmonia-ca.com</span>
                <span class="text-[11px] text-slate-400 block font-sans">Assigned: Marcus Thorne &middot; Warmup: Day 30 (Mature)</span>
              </div>
            </div>
            <div class="flex items-center gap-4 font-mono">
              <span class="text-slate-400">Sent Today: <strong class="text-slate-200">34 / 40</strong></span>
              <span class="text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800/40">97.8% Health</span>
            </div>
          </div>

          <div class="px-6 py-3.5 flex items-center justify-between">
            <div class="flex items-center gap-3">
              <span class="w-2.5 h-2.5 rounded-full bg-cyan-400"></span>
              <div>
                <span class="font-mono font-semibold text-slate-200">elena.r@outreach.crmonia-ca.com</span>
                <span class="text-[11px] text-slate-400 block font-sans">Assigned: Elena Rostova &middot; Warmup: Day 12 (Ramping)</span>
              </div>
            </div>
            <div class="flex items-center gap-4 font-mono">
              <span class="text-slate-400">Sent Today: <strong class="text-slate-200">14 / 20</strong></span>
              <span class="text-cyan-400 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-800/40">Ramping Safe</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ========================================== -->
    <!-- VIEW 5: DENY-WINS POLICIES                 -->
    <!-- ========================================== -->
    <section id="view-policies" class="tab-view hidden flex-1 flex flex-col gap-6">
      <div class="bg-obsidian-900/60 p-4 rounded-xl border border-obsidian-700/60">
        <h2 class="text-lg font-bold text-white tracking-tight flex items-center gap-2">
          Governed Deny-Wins Policy Fabric
          <span class="text-xs font-mono bg-red-950 text-red-400 px-2 py-0.5 rounded border border-red-800/40">Deny-Wins Precedence</span>
        </h2>
        <p class="text-xs text-slate-400 mt-0.5">Parent rules define ceilings. Downward tiers can narrow permissions, but can never widen corporate compliance ceilings.</p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="glass-card p-5 rounded-xl flex flex-col gap-3">
          <span class="text-xs font-bold text-slate-300 uppercase tracking-wider">Outbound Velocity Guardrails</span>
          <div class="flex flex-col gap-2.5 text-xs">
            <div class="flex justify-between items-center p-2.5 rounded-lg bg-obsidian-900 border border-obsidian-700/50">
              <span class="text-slate-300">Max Daily Sends / Mailbox (Corporate Ceiling)</span>
              <span class="font-mono font-bold text-cyan-400">50 Emails</span>
            </div>
            <div class="flex justify-between items-center p-2.5 rounded-lg bg-obsidian-900 border border-obsidian-700/50">
              <span class="text-slate-300">Toronto Branch Localized Override</span>
              <span class="font-mono font-bold text-emerald-400">40 Emails (Valid: Stricter)</span>
            </div>
            <div class="flex justify-between items-center p-2.5 rounded-lg bg-obsidian-900 border border-obsidian-700/50">
              <span class="text-slate-300">Minimum Interval Between Outbound Drops</span>
              <span class="font-mono font-bold text-cyan-400">120 seconds</span>
            </div>
          </div>
        </div>

        <div class="glass-card p-5 rounded-xl flex flex-col gap-3">
          <span class="text-xs font-bold text-slate-300 uppercase tracking-wider">Global Suppression & DNC Lists</span>
          <div class="flex flex-col gap-2.5 text-xs">
            <div class="flex justify-between items-center p-2.5 rounded-lg bg-obsidian-900 border border-obsidian-700/50">
              <span class="text-slate-300">Corporate Master DNC Domain Count</span>
              <span class="font-mono font-bold text-red-400">1,842 Domains</span>
            </div>
            <div class="flex justify-between items-center p-2.5 rounded-lg bg-obsidian-900 border border-obsidian-700/50">
              <span class="text-slate-300">Country Legal Suppression (Canada CASL)</span>
              <span class="font-mono font-bold text-red-400">Enforced Automatic</span>
            </div>
            <div class="flex justify-between items-center p-2.5 rounded-lg bg-obsidian-900 border border-obsidian-700/50">
              <span class="text-slate-300">Subtree Bypass Attempt Behavior</span>
              <span class="font-mono font-bold text-amber-400">Hard Drop & Flag Audit</span>
            </div>
          </div>
        </div>
      </div>
    </section>

  </main>

  <!-- ========================================== -->
  <!-- SLIDE-OVER LEAD DETAIL DRAWER              -->
  <!-- ========================================== -->
  <div id="leadDrawer" class="fixed inset-0 z-50 hidden">
    <div onclick="closeLeadDrawer()" class="absolute inset-0 drawer-backdrop"></div>
    <div class="absolute right-0 top-0 bottom-0 w-full max-w-xl bg-obsidian-900 border-l border-obsidian-700/80 shadow-2xl flex flex-col transform transition-transform duration-200">
      
      <!-- Drawer Header -->
      <div class="p-6 border-b border-obsidian-700/80 bg-obsidian-950 flex items-start justify-between">
        <div>
          <div class="flex items-center gap-2 mb-1">
            <span id="drawerCountryBadge" class="text-[10px] font-mono px-2 py-0.5 rounded font-bold bg-cyan-950 text-cyan-300 border border-cyan-800/40">CA</span>
            <span id="drawerId" class="text-xs font-mono text-slate-400">lead_tor_01</span>
          </div>
          <h2 id="drawerTitle" class="text-xl font-bold text-white tracking-tight">Apex Logistics Fleet Overhaul</h2>
          <p id="drawerCompany" class="text-xs text-slate-300 font-medium">Apex Logistics Group Inc.</p>
        </div>
        <button onclick="closeLeadDrawer()" class="p-1 rounded-lg hover:bg-obsidian-800 text-slate-400 hover:text-white">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>

      <!-- Drawer Body -->
      <div class="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar text-xs">
        
        <!-- Live Stage Advancement Controls -->
        <div class="p-4 rounded-xl bg-obsidian-850 border border-obsidian-700/80 space-y-3">
          <div class="flex items-center justify-between">
            <span class="font-bold text-slate-200 uppercase tracking-wider text-[11px]">Current Sales Stage</span>
            <span id="drawerStageText" class="font-mono font-bold text-cyan-400">PROPOSAL</span>
          </div>
          <div class="grid grid-cols-5 gap-1.5 pt-1">
            <button onclick="setDrawerStage('NEW')" class="stage-btn py-1.5 rounded text-[10px] font-bold border border-obsidian-700 hover:border-cyan-500 bg-obsidian-900 text-slate-300">NEW</button>
            <button onclick="setDrawerStage('QUALIFIED')" class="stage-btn py-1.5 rounded text-[10px] font-bold border border-obsidian-700 hover:border-cyan-500 bg-obsidian-900 text-slate-300">QUALIFIED</button>
            <button onclick="setDrawerStage('PROPOSAL')" class="stage-btn py-1.5 rounded text-[10px] font-bold border border-obsidian-700 hover:border-cyan-500 bg-obsidian-900 text-slate-300">PROPOSAL</button>
            <button onclick="setDrawerStage('NEGOTIATION')" class="stage-btn py-1.5 rounded text-[10px] font-bold border border-obsidian-700 hover:border-cyan-500 bg-obsidian-900 text-slate-300">NEGOTIATE</button>
            <button onclick="setDrawerStage('WON')" class="stage-btn py-1.5 rounded text-[10px] font-bold border border-emerald-800 hover:border-emerald-500 bg-emerald-950/60 text-emerald-300">WON</button>
          </div>
        </div>

        <!-- Deal Attributes -->
        <div class="grid grid-cols-2 gap-4">
          <div class="p-3 rounded-lg bg-obsidian-950 border border-obsidian-800">
            <span class="text-slate-400 block mb-1">Deal Value</span>
            <span id="drawerValue" class="text-lg font-bold font-mono text-emerald-400">$45,000</span>
          </div>
          <div class="p-3 rounded-lg bg-obsidian-950 border border-obsidian-800">
            <span class="text-slate-400 block mb-1">Subtree Node Path</span>
            <span id="drawerPath" class="text-xs font-mono text-cyan-300 truncate block">root.ca.on.toronto</span>
          </div>
        </div>

        <!-- Primary Contact -->
        <div class="p-4 rounded-xl bg-obsidian-850 border border-obsidian-700/80 space-y-2">
          <span class="font-bold text-slate-200 uppercase tracking-wider text-[11px]">Primary Contact</span>
          <div class="flex items-center justify-between">
            <span id="drawerContactName" class="text-sm font-semibold text-white">David Miller</span>
            <span class="text-slate-400">VP Operations</span>
          </div>
          <div class="flex items-center gap-2 text-slate-300 font-mono">
            <svg class="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
            <span id="drawerContactEmail">d.miller@apexlogistics.ca</span>
          </div>
        </div>

        <!-- Demand Capture Provenance (Immutable First-Touch) -->
        <div class="p-4 rounded-xl bg-obsidian-950 border border-obsidian-800 space-y-2">
          <div class="flex items-center justify-between">
            <span class="font-bold text-slate-200 uppercase tracking-wider text-[11px]">Attribution Provenance</span>
            <span class="text-[10px] font-mono text-emerald-400 bg-emerald-950 px-1.5 py-0.5 rounded border border-emerald-800/40">HMAC VERIFIED</span>
          </div>
          <div class="font-mono text-[11px] space-y-1 text-slate-400">
            <div>utm_source: <span class="text-slate-200">google_ads</span></div>
            <div>utm_campaign: <span class="text-slate-200">commercial_fleet_q3</span></div>
            <div>capture_channel: <span class="text-slate-200">signed_landing_page_ticket</span></div>
          </div>
        </div>

        <!-- Activity Audit Stream -->
        <div class="space-y-3">
          <span class="font-bold text-slate-200 uppercase tracking-wider text-[11px]">Immutable Audit Trail</span>
          <div class="space-y-2 border-l-2 border-obsidian-700 ml-2 pl-3">
            <div class="text-slate-300">
              <span class="text-[10px] text-slate-500 block font-mono">Today, 10:14 AM</span>
              Email Sequence Step 2 opened & click verified by Sarah Chen.
            </div>
            <div class="text-slate-300">
              <span class="text-[10px] text-slate-500 block font-mono">Yesterday, 04:30 PM</span>
              Proposal generated and sent via DocuSign link.
            </div>
          </div>
        </div>

      </div>

      <!-- Drawer Footer Action -->
      <div class="p-4 border-t border-obsidian-700/80 bg-obsidian-950 flex items-center justify-between">
        <button onclick="advanceCurrentLeadStage()" class="w-full bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-bold py-2.5 rounded-lg text-xs transition-all shadow-lg shadow-cyan-500/20">
          Advance to Next Pipeline Stage &rarr;
        </button>
      </div>

    </div>
  </div>

  <!-- ========================================== -->
  <!-- MODAL: NEW DEAL CREATION                   -->
  <!-- ========================================== -->
  <div id="newDealModal" class="fixed inset-0 z-50 hidden flex items-center justify-center p-4">
    <div onclick="closeNewDealModal()" class="absolute inset-0 drawer-backdrop"></div>
    <div class="relative w-full max-w-lg bg-obsidian-900 border border-obsidian-700 rounded-2xl shadow-2xl p-6 space-y-4">
      <div class="flex items-center justify-between border-b border-obsidian-700/80 pb-3">
        <h3 class="text-base font-bold text-white tracking-tight flex items-center gap-2">
          <span>+ Create Canonical CRM Lead</span>
        </h3>
        <button onclick="closeNewDealModal()" class="text-slate-400 hover:text-white">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>

      <form onsubmit="handleCreateDeal(event)" class="space-y-3.5 text-xs">
        <div>
          <label class="block text-slate-400 mb-1 font-medium">Deal Title</label>
          <input type="text" id="dealTitleInput" required placeholder="e.g. Greater Ontario Logistics Coverage" class="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-cyan-500 font-sans">
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-slate-400 mb-1 font-medium">Company Name</label>
            <input type="text" id="dealCompanyInput" required placeholder="e.g. Ontario Trans Freight" class="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-cyan-500 font-sans">
          </div>
          <div>
            <label class="block text-slate-400 mb-1 font-medium">Deal Value ($ USD/CAD)</label>
            <input type="number" id="dealValueInput" required placeholder="50000" class="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-cyan-500 font-mono">
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-slate-400 mb-1 font-medium">Contact Full Name</label>
            <input type="text" id="dealContactInput" required placeholder="e.g. Michael Harris" class="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-cyan-500 font-sans">
          </div>
          <div>
            <label class="block text-slate-400 mb-1 font-medium">Contact Email</label>
            <input type="email" id="dealEmailInput" required placeholder="m.harris@ontariotrans.ca" class="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-cyan-500 font-sans">
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-slate-400 mb-1 font-medium">Target Org Branch</label>
            <select id="dealBranchSelect" class="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-cyan-500 font-sans">
              <option value="Toronto Branch|root.ca.on.toronto|CA">Toronto Branch (CA)</option>
              <option value="Ottawa Branch|root.ca.on.ottawa|CA">Ottawa Branch (CA)</option>
              <option value="US National Branch|root.us|US">US National Branch (US)</option>
            </select>
          </div>
          <div>
            <label class="block text-slate-400 mb-1 font-medium">Initial Sales Stage</label>
            <select id="dealInitialStageSelect" class="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-cyan-500 font-sans">
              <option value="NEW">NEW</option>
              <option value="QUALIFIED">QUALIFIED</option>
              <option value="PROPOSAL">PROPOSAL</option>
            </select>
          </div>
        </div>

        <div class="pt-3 border-t border-obsidian-700/80 flex items-center justify-end gap-2">
          <button type="button" onclick="closeNewDealModal()" class="px-4 py-2 rounded-lg bg-obsidian-850 hover:bg-obsidian-800 text-slate-400 font-semibold text-xs">Cancel</button>
          <button type="submit" class="px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-cyan-500/20">Create Lead</button>
        </div>
      </form>
    </div>
  </div>

  <!-- ========================================== -->
  <!-- MODAL: SUBTREE MOVE & MERGE WIZARD         -->
  <!-- ========================================== -->
  <div id="subtreeModal" class="fixed inset-0 z-50 hidden flex items-center justify-center p-4">
    <div onclick="closeSubtreeModal()" class="absolute inset-0 drawer-backdrop"></div>
    <div class="relative w-full max-w-lg bg-obsidian-900 border border-obsidian-700 rounded-2xl shadow-2xl p-6 space-y-4">
      <div class="flex items-center justify-between border-b border-obsidian-700/80 pb-3">
        <h3 class="text-base font-bold text-white tracking-tight flex items-center gap-2">
          <svg class="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/></svg>
          <span>Subtree Migration & Re-Parenting Wizard</span>
        </h3>
        <button onclick="closeSubtreeModal()" class="text-slate-400 hover:text-white">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>

      <div class="space-y-4 text-xs">
        <div>
          <label class="block text-slate-400 mb-1 font-medium">Select Source Subtree Node to Move</label>
          <select id="moveSourceNode" class="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-cyan-500 font-sans">
            <option value="root.ca.on.ottawa">Ottawa Branch (Current: root.ca.on.ottawa)</option>
            <option value="root.ca.on.toronto">Toronto Branch (Current: root.ca.on.toronto)</option>
          </select>
        </div>

        <div>
          <label class="block text-slate-400 mb-1 font-medium">Select Target Destination Parent Node</label>
          <select id="moveTargetParent" class="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-cyan-500 font-sans">
            <option value="root.ca.on">Ontario Region (root.ca.on)</option>
            <option value="root.ca">Canada OpCo Direct (root.ca)</option>
            <option value="root.us">US OpCo (FAIL TEST: Cross-Jurisdiction Blocked)</option>
          </select>
        </div>

        <div class="p-3 rounded-lg bg-obsidian-950 border border-obsidian-800 space-y-1.5">
          <span class="font-bold text-slate-300 block">PostgreSQL ltree Mutation Impact:</span>
          <div class="text-slate-400 font-mono text-[11px]">
            &bull; Recalculates paths: <code class="text-cyan-300">target_path || subpath(org_node_path, n)</code><br>
            &bull; Updates all assigned leads, mailboxes, and audit trails atomically.<br>
            &bull; Enforces Country residency boundary invariant.
          </div>
        </div>

        <div class="pt-3 border-t border-obsidian-700/80 flex items-center justify-end gap-2">
          <button onclick="closeSubtreeModal()" class="px-4 py-2 rounded-lg bg-obsidian-850 hover:bg-obsidian-800 text-slate-400 font-semibold text-xs">Cancel</button>
          <button onclick="executeSubtreeMove()" class="px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-cyan-500/20">Execute Atomic Migration</button>
        </div>
      </div>
    </div>
  </div>

  <!-- TOAST NOTIFICATION POPUP -->
  <div id="toastContainer" class="fixed bottom-6 right-6 z-50 flex flex-col gap-2"></div>

  <!-- JAVASCRIPT STATE ENGINE -->
  <script>
    // In-memory reactive state
    let state = {
      activeTab: 'pipeline',
      currentOrgContext: 'root',
      activeDrawerLeadId: null,
      leads: [
        {
          id: 'lead_tor_01',
          title: 'Apex Logistics Fleet Overhaul',
          company: 'Apex Logistics Group Inc.',
          value: 45000,
          stage: 'PROPOSAL',
          country: 'CA',
          orgPath: 'root.ca.on.toronto',
          branch: 'Toronto Branch',
          contact: 'David Miller',
          email: 'd.miller@apexlogistics.ca',
          daysInStage: 4
        },
        {
          id: 'lead_tor_02',
          title: 'BioHealth Diagnostic Key-Person Insurance',
          company: 'BioHealth Diagnostics Ltd.',
          value: 85000,
          stage: 'QUALIFIED',
          country: 'CA',
          orgPath: 'root.ca.on.toronto',
          branch: 'Toronto Branch',
          contact: 'Dr. Aris Thorne',
          email: 'a.thorne@biohealth.ca',
          daysInStage: 2
        },
        {
          id: 'lead_ott_01',
          title: 'Federal Gov Tech Advisory Liability',
          company: 'Capital Cyber Security Systems',
          value: 120000,
          stage: 'NEGOTIATION',
          country: 'CA',
          orgPath: 'root.ca.on.ottawa',
          branch: 'Ottawa Branch',
          contact: 'Claire Vance',
          email: 'c.vance@capitalcyber.ca',
          daysInStage: 8
        },
        {
          id: 'lead_us_01',
          title: 'Pacific Freight Cross-Border Marine Policy',
          company: 'Pacific Trans-Marine US LLC',
          value: 65000,
          stage: 'NEW',
          country: 'US',
          orgPath: 'root.us',
          branch: 'US National Branch',
          contact: 'Robert Kowalski',
          email: 'r.kowalski@pacificmarine.com',
          daysInStage: 1
        },
        {
          id: 'lead_tor_03',
          title: 'Ontario CleanTech Founders Umbrella',
          company: 'CleanTech Grid Innovations',
          value: 20000,
          stage: 'WON',
          country: 'CA',
          orgPath: 'root.ca.on.toronto',
          branch: 'Toronto Branch',
          contact: 'Siddharth Patel',
          email: 's.patel@cleantechgrid.ca',
          daysInStage: 14
        }
      ],
      orgTree: [
        { name: 'Global Corporate Parent', path: 'root', level: 0, country: 'GLOBAL', leadsCount: 5 },
        { name: 'Canada OpCo (Legal Entity)', path: 'root.ca', level: 1, country: 'CA', leadsCount: 4 },
        { name: 'Ontario Regional Office', path: 'root.ca.on', level: 2, country: 'CA', leadsCount: 4 },
        { name: 'Toronto Financial District Branch', path: 'root.ca.on.toronto', level: 3, country: 'CA', leadsCount: 3 },
        { name: 'Ottawa Capital Branch', path: 'root.ca.on.ottawa', level: 3, country: 'CA', leadsCount: 1 },
        { name: 'United States OpCo', path: 'root.us', level: 1, country: 'US', leadsCount: 1 }
      ]
    };

    // Render on boot
    window.addEventListener('DOMContentLoaded', () => {
      renderPipeline();
      renderOrgTree();
    });

    // Tab Switching
    function switchTab(tabId) {
      state.activeTab = tabId;
      document.querySelectorAll('.tab-view').forEach(el => el.classList.add('hidden'));
      document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active', 'bg-gradient-to-r', 'from-cyan-500', 'to-indigo-600', 'text-white', 'shadow-sm');
        btn.classList.add('text-slate-400');
      });

      const activeView = document.getElementById('view-' + tabId);
      if (activeView) activeView.classList.remove('hidden');

      const activeBtn = document.getElementById('tab-btn-' + tabId);
      if (activeBtn) {
        activeBtn.classList.add('active', 'bg-gradient-to-r', 'from-cyan-500', 'to-indigo-600', 'text-white', 'shadow-sm');
        activeBtn.classList.remove('text-slate-400');
      }
    }

    // Render Kanban Pipeline
    function renderPipeline() {
      const stages = ['NEW', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON'];
      const search = (document.getElementById('leadSearchInput')?.value || '').toLowerCase();
      const countryFilter = document.getElementById('countryFilter')?.value || 'ALL';

      let totalVal = 0;
      let activeCount = 0;

      stages.forEach(stage => {
        const colContainer = document.getElementById('col-cards-' + stage);
        const countBadge = document.getElementById('col-count-' + stage);
        if (!colContainer) return;

        const stageLeads = state.leads.filter(l => {
          if (l.stage !== stage) return false;
          if (countryFilter !== 'ALL' && l.country !== countryFilter) return false;
          if (search) {
            const match = l.title.toLowerCase().includes(search) || 
                          l.company.toLowerCase().includes(search) || 
                          l.contact.toLowerCase().includes(search);
            if (!match) return false;
          }
          return true;
        });

        if (countBadge) countBadge.textContent = stageLeads.length;

        colContainer.innerHTML = stageLeads.map(lead => {
          totalVal += lead.value;
          activeCount++;
          return \`
            <div onclick="openLeadDrawer('\${lead.id}')" class="glass-card p-3.5 rounded-xl cursor-pointer hover:border-cyan-500/50 hover:scale-[1.01] transition-all flex flex-col gap-2 relative group">
              <div class="flex items-center justify-between">
                <span class="text-[9px] font-mono px-1.5 py-0.5 rounded font-bold \${lead.country === 'CA' ? 'bg-cyan-950 text-cyan-300 border border-cyan-800/40' : 'bg-brand-emerald/10 text-emerald-400 border border-emerald-800/40'}">\${lead.country}</span>
                <span class="text-[10px] text-slate-500 font-mono">\${lead.daysInStage}d in stage</span>
              </div>
              <h4 class="font-bold text-white text-xs leading-snug group-hover:text-cyan-300 transition-colors">\${lead.title}</h4>
              <p class="text-[11px] text-slate-400 font-medium">\${lead.company}</p>
              <div class="flex items-center justify-between pt-2 border-t border-obsidian-800/60 mt-1">
                <span class="font-mono font-extrabold text-white text-xs">$\${lead.value.toLocaleString()}</span>
                <span class="text-[10px] text-slate-400 font-mono truncate max-w-[120px]">\${lead.branch}</span>
              </div>
            </div>
          \`;
        }).join('');
      });

      const totalValEl = document.getElementById('kpi-total-val');
      if (totalValEl) totalValEl.textContent = '$' + totalVal.toLocaleString();
      const totalLeadsEl = document.getElementById('kpi-total-leads');
      if (totalLeadsEl) totalLeadsEl.textContent = activeCount;
    }

    function filterLeads() {
      renderPipeline();
    }

    // Render Org Tree
    function renderOrgTree() {
      const container = document.getElementById('orgTreeContainer');
      if (!container) return;

      container.innerHTML = state.orgTree.map(node => {
        const indent = node.level * 24;
        return \`
          <div class="flex items-center justify-between p-2.5 rounded-lg bg-obsidian-900/90 border border-obsidian-700/60 hover:border-cyan-500/40 transition-all" style="margin-left: \${indent}px">
            <div class="flex items-center gap-2">
              <span class="text-cyan-400 font-bold">\${node.level > 0 ? '└── ' : ''}</span>
              <span class="font-semibold text-slate-200">\${node.name}</span>
              <span class="text-[10px] font-mono text-cyan-400 bg-obsidian-950 px-1.5 py-0.5 rounded border border-cyan-900/50">\${node.path}</span>
            </div>
            <div class="flex items-center gap-3">
              <span class="text-[10px] font-mono text-slate-400">\${node.leadsCount} Active Leads</span>
              <button onclick="setOrgContext('\${node.name}', '\${node.path}')" class="text-xs text-cyan-400 hover:text-cyan-300 font-semibold px-2 py-1 rounded bg-obsidian-800 hover:bg-obsidian-700">Assume Context</button>
            </div>
          </div>
        \`;
      }).join('');
    }

    function setOrgContext(name, path) {
      document.getElementById('activeOrgBadge').textContent = name;
      document.getElementById('activePathBadge').textContent = path;
      showToast('Switched security RLS context to: ' + name);
    }

    // Lead Slide-Over Drawer
    function openLeadDrawer(leadId) {
      state.activeDrawerLeadId = leadId;
      const lead = state.leads.find(l => l.id === leadId);
      if (!lead) return;

      document.getElementById('drawerId').textContent = lead.id;
      document.getElementById('drawerTitle').textContent = lead.title;
      document.getElementById('drawerCompany').textContent = lead.company;
      document.getElementById('drawerValue').textContent = '$' + lead.value.toLocaleString();
      document.getElementById('drawerPath').textContent = lead.orgPath;
      document.getElementById('drawerContactName').textContent = lead.contact;
      document.getElementById('drawerContactEmail').textContent = lead.email;
      document.getElementById('drawerCountryBadge').textContent = lead.country;
      document.getElementById('drawerStageText').textContent = lead.stage;

      const drawer = document.getElementById('leadDrawer');
      drawer.classList.remove('hidden');
    }

    function closeLeadDrawer() {
      document.getElementById('leadDrawer').classList.add('hidden');
      state.activeDrawerLeadId = null;
    }

    function setDrawerStage(newStage) {
      if (!state.activeDrawerLeadId) return;
      const lead = state.leads.find(l => l.id === state.activeDrawerLeadId);
      if (lead) {
        lead.stage = newStage;
        document.getElementById('drawerStageText').textContent = newStage;
        renderPipeline();
        showToast('Lead stage advanced to: ' + newStage);
      }
    }

    function advanceCurrentLeadStage() {
      if (!state.activeDrawerLeadId) return;
      const stages = ['NEW', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON'];
      const lead = state.leads.find(l => l.id === state.activeDrawerLeadId);
      if (!lead) return;
      const idx = stages.indexOf(lead.stage);
      if (idx < stages.length - 1) {
        const next = stages[idx + 1];
        setDrawerStage(next);
      } else {
        showToast('Lead is already in terminal stage: WON');
      }
    }

    // Modal: New Deal
    function openNewDealModal() {
      document.getElementById('newDealModal').classList.remove('hidden');
    }

    function closeNewDealModal() {
      document.getElementById('newDealModal').classList.add('hidden');
    }

    function handleCreateDeal(e) {
      e.preventDefault();
      const title = document.getElementById('dealTitleInput').value;
      const company = document.getElementById('dealCompanyInput').value;
      const val = parseInt(document.getElementById('dealValueInput').value, 10);
      const contact = document.getElementById('dealContactInput').value;
      const email = document.getElementById('dealEmailInput').value;
      const branchRaw = document.getElementById('dealBranchSelect').value;
      const [branch, path, country] = branchRaw.split('|');
      const stage = document.getElementById('dealInitialStageSelect').value;

      const newLead = {
        id: 'lead_' + Date.now().toString(36),
        title,
        company,
        value: val,
        stage,
        country,
        orgPath: path,
        branch,
        contact,
        email,
        daysInStage: 0
      };

      state.leads.unshift(newLead);
      renderPipeline();
      closeNewDealModal();
      showToast('Created deal: ' + title + ' ($' + val.toLocaleString() + ')');
    }

    // Modal: Subtree Move Wizard
    function openSubtreeMoveModal() {
      document.getElementById('subtreeModal').classList.remove('hidden');
    }

    function closeSubtreeModal() {
      document.getElementById('subtreeModal').classList.add('hidden');
    }

    function executeSubtreeMove() {
      const src = document.getElementById('moveSourceNode').value;
      const target = document.getElementById('moveTargetParent').value;

      if (target === 'root.us' && src.startsWith('root.ca')) {
        showToast('BLOCKED by Jurisdictional Boundary: Cannot re-parent CA entity into US node without compliance override.', true);
        return;
      }

      // Perform local tree update
      const node = state.orgTree.find(n => n.path === src);
      if (node) {
        const oldPath = node.path;
        const newPath = target + '.' + oldPath.split('.').pop();
        node.path = newPath;

        // update leads
        state.leads.forEach(l => {
          if (l.orgPath.startsWith(oldPath)) {
            l.orgPath = l.orgPath.replace(oldPath, newPath);
          }
        });

        renderOrgTree();
        renderPipeline();
        closeSubtreeModal();
        showToast('Successfully migrated ' + node.name + ' to ' + newPath + ' via PostgreSQL subpath()');
      }
    }

    function inspectPlaybook(name) {
      showToast('Inspecting Governed Playbook: ' + name);
    }

    // Non-blocking Toast notification system
    function showToast(message, isError = false) {
      const container = document.getElementById('toastContainer');
      const toast = document.createElement('div');
      toast.className = \`px-4 py-3 rounded-xl border text-xs font-semibold shadow-2xl flex items-center gap-2.5 transition-all transform duration-200 \${
        isError ? 'bg-red-950/90 text-red-200 border-red-800/80 shadow-red-950/50' : 'bg-obsidian-850/95 text-slate-100 border-cyan-800/80 shadow-cyan-950/50'
      }\`;
      toast.innerHTML = \`
        <span class="w-2 h-2 rounded-full \${isError ? 'bg-red-400' : 'bg-cyan-400'}"></span>
        <span>\${message}</span>
      \`;
      container.appendChild(toast);
      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        setTimeout(() => toast.remove(), 250);
      }, 4000);
    }
  </script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
  });
  res.end(HTML_CONTENT);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[CRMONIA Interactive Preview] Running live on http://localhost:${PORT}`);
});
