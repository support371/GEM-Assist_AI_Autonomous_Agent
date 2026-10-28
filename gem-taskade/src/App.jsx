import { useState, useRef, useEffect, useMemo } from "react";
import { subscribeTable } from "./lib/realtime.js";
import {
  Plus, Search, ChevronDown, ChevronRight, MoreHorizontal, Users, Settings,
  Grid3x3, Share2, Bot, Sparkles, LayoutGrid, List as ListIcon, Columns3,
  Calendar, GitBranch, Network, Workflow as WorkflowIcon, Clock, Target,
  CheckCircle2, Circle, X, Loader2, Send, Trash2, Edit3, Star, Folder,
  FileText, Home, Bell, HelpCircle, Zap, Box, Layers, Database, Globe,
  ArrowLeft, Hash, Mic, Paperclip, Image as ImageIcon, Smile, ChevronLeft,
  Filter, SlidersHorizontal, UserPlus, Lock, Unlock, Eye, EyeOff, Flag,
  Tag, MessageSquare, Video, Phone, Copy, Download, Upload, PlayCircle,
  PauseCircle, SkipForward, Save, LogOut, User, Palette, Moon, Sun, Check
} from "lucide-react";

/*╔══════════════════════════════════════════════════════════════════════════════╗
  ║  GEM ASSISTS · Taskade Clone — Zero-Billing Production Stack             ║
  ║  Vercel + Supabase + Cloudflare Workers + Claude Opus 4.7                ║
  ║  Workspaces · 8 Views · AI Agents · Automations · Real-time (local-first)║
  ╚══════════════════════════════════════════════════════════════════════════════╝*/

// Taskade-exact color system (dark mode default, matching the screenshot)
const T = {
  bg:'#0a0a0f', bg2:'#111118', card:'#171720', cardH:'#1d1d28', surf:'#1a1a24',
  bd:'#252533', bdH:'#333345', bdA:'#3a3a52',
  tx:'#f0f0f8', sb:'#9b9bb5', dm:'#56566d', mt:'#3a3a4e',
  // Taskade's signature coral/pink workspace accent
  coral:'#ff5f6d', coralD:'#e94560', coralL:'#ff8a95',
  // Secondary brand colors
  purple:'#9b5cff', purpleL:'#b47dff', purpleD:'#7c3eff',
  blue:'#5c9eff', green:'#4ade80', yellow:'#fbbf24', red:'#ef4444',
  // Workspace glow effect
  glow:'radial-gradient(ellipse at top, rgba(255,95,109,0.15) 0%, rgba(155,92,255,0.08) 50%, transparent 70%)',
};
const FT = `'Inter','SF Pro Display',-apple-system,BlinkMacSystemFont,system-ui,sans-serif`;
const MN = `'JetBrains Mono','SF Mono',monospace`;

// ═══ PERSISTENCE (local-first; Supabase sync-ready) ════════════════════════
const DB = {
  async g(k){try{const r=await window.storage.get(k);return r?JSON.parse(r.value):null}catch{return null}},
  async s(k,v){try{await window.storage.set(k,JSON.stringify(v));return true}catch{return false}},
  async d(k){try{await window.storage.delete(k);return true}catch{return false}},
};

// UUID-shape ids so they align with Supabase relational tables when the SPA
// later writes through supabase.rpc('create_project_with_tasks', ...). Falls
// back to a 36-char synthetic uuid where crypto.randomUUID is unavailable.
function uid(){
  try { if (crypto?.randomUUID) return crypto.randomUUID(); } catch {}
  const hex = () => Math.floor(Math.random()*0x100000000).toString(16).padStart(8,'0');
  return `${hex()}-${hex().slice(0,4)}-4${hex().slice(0,3)}-${(8+Math.floor(Math.random()*4)).toString(16)}${hex().slice(0,3)}-${hex()}${hex().slice(0,4)}`;
}

// ═══ SEED DATA — matches your screenshot: GEM Assists workspace ════════════
const SEED_WORKSPACES = [
  {
    id:'ws1', name:'Workspace', emoji:'🔺', color:T.coral, isPersonal:true, memberCount:1,
    projects:[
      {id:'p1', name:'Home', emoji:'🏠', color:T.coral, cover:'coral', favorite:true, members:1, lastActive:Date.now()-120000},
      {id:'p2', name:'GEM Assists', emoji:'G', color:T.blue, cover:'blue', favorite:true, members:1, lastActive:Date.now()-240000},
    ],
    folders:[],
  },
  {
    id:'ws2', name:'GEM Enterprise', emoji:'G', color:T.purple, isPersonal:false, memberCount:4,
    projects:[
      {id:'p3', name:'OpenGuardians Roadmap', emoji:'🛡️', color:T.purple, cover:'purple', favorite:true, members:4, lastActive:Date.now()-600000},
      {id:'p4', name:'Nexus Financial', emoji:'💎', color:T.green, cover:'green', favorite:false, members:3, lastActive:Date.now()-3600000},
      {id:'p5', name:'Alliance Trust Realty', emoji:'🏢', color:T.yellow, cover:'yellow', favorite:false, members:2, lastActive:Date.now()-86400000},
      {id:'p6', name:'eSIM Platform', emoji:'📡', color:T.blue, cover:'blue', favorite:false, members:2, lastActive:Date.now()-172800000},
    ],
    folders:[
      {id:'f1', name:'Infrastructure', projects:['p3','p4']},
      {id:'f2', name:'Business', projects:['p5','p6']},
    ],
  },
];

const SEED_TASKS = {
  p1: [
    {id:'t1', title:'Welcome to GEM Assists', completed:false, priority:'medium', assignee:'Gem', dueDate:'2026-11-01', tags:['welcome'], notes:'Start building your workspace', subtasks:[]},
    {id:'t2', title:'Create your first project', completed:true, priority:'high', assignee:'Gem', dueDate:'2026-10-27', tags:['onboarding'], notes:'', subtasks:[]},
    {id:'t3', title:'Invite teammates', completed:false, priority:'low', assignee:null, dueDate:null, tags:['team'], notes:'', subtasks:[]},
  ],
  p2: [
    {id:'t4', title:'Set up Telegram bot integration', completed:false, priority:'high', assignee:'Gem', dueDate:'2026-10-30', tags:['bot','telegram'], notes:'@MyGemAssist_Bot → @mycybersecureWealthsolution', subtasks:[
      {id:'st1', title:'Register bot with BotFather', completed:true},
      {id:'st2', title:'Set webhook endpoint', completed:true},
      {id:'st3', title:'Deploy to Cloudflare Workers', completed:false},
    ]},
    {id:'t5', title:'Build FAQ hub with AI answers', completed:false, priority:'high', assignee:'Gem', dueDate:'2026-11-05', tags:['ai','docs'], notes:'Use Claude Opus 4.7 for Q&A', subtasks:[]},
    {id:'t6', title:'Connect Supabase for persistence', completed:true, priority:'high', assignee:'Gem', dueDate:'2026-10-25', tags:['backend'], notes:'Free tier: 500MB DB, unlimited API', subtasks:[]},
    {id:'t7', title:'Design workspace views (List/Board/Mind Map)', completed:false, priority:'medium', assignee:'Gem', dueDate:'2026-11-10', tags:['design','frontend'], notes:'', subtasks:[]},
    {id:'t8', title:'Automate daily digest publishing', completed:false, priority:'medium', assignee:'Gem', dueDate:'2026-11-15', tags:['automation'], notes:'Schedule: 0 7 * * *', subtasks:[]},
  ],
  p3: [
    {id:'t9', title:'RBAC middleware audit', completed:false, priority:'high', assignee:'Gem', dueDate:'2026-10-31', tags:['security','auth'], notes:'', subtasks:[]},
    {id:'t10', title:'Threat intelligence feed integration', completed:false, priority:'high', assignee:'A. Chen', dueDate:'2026-11-05', tags:['intel'], notes:'CISA + Krebs feeds', subtasks:[]},
    {id:'t11', title:'SOC dashboard v3 wireframes', completed:true, priority:'medium', assignee:'M. Torres', dueDate:'2026-10-20', tags:['design'], notes:'', subtasks:[]},
  ],
  p4: [
    {id:'t12', title:'Double-entry ledger v2 migration', completed:false, priority:'high', assignee:'Gem', dueDate:'2026-11-15', tags:['ledger'], notes:'', subtasks:[]},
    {id:'t13', title:'KYC document processor', completed:true, priority:'high', assignee:'Gem', dueDate:'2026-10-15', tags:['kyc'], notes:'', subtasks:[]},
  ],
  p5: [
    {id:'t14', title:'Zillow listing sync automation', completed:false, priority:'medium', assignee:'Gem', dueDate:'2026-11-20', tags:['automation'], notes:'', subtasks:[]},
  ],
  p6: [
    {id:'t15', title:'BOSS API order fulfillment pipeline', completed:true, priority:'high', assignee:'Gem', dueDate:'2026-10-10', tags:['api'], notes:'', subtasks:[]},
  ],
};


// ─── Claude API client (routes through Cloudflare Worker proxy or direct) ───
const LLM_ENDPOINT = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_LLM_PROXY_URL)
  || '/api/llm'; // Default: Cloudflare Worker /llm endpoint (free-tier AI stack: Workers AI → Gemini → Groq)
async function callLLM(body) {
  const headers = { 'Content-Type': 'application/json' };
  const key = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_ANTHROPIC_API_KEY : null;
  if (key && LLM_ENDPOINT.includes('anthropic.com')) {
    headers['x-api-key'] = key;
    headers['anthropic-version'] = '2023-06-01';
    headers['anthropic-dangerous-direct-browser-access'] = 'true';
  }
  const res = await fetch(LLM_ENDPOINT, { method:'POST', headers, body: JSON.stringify(body) });
  return res.json();
}


// ─── Agent runtime client (Base44 Superagent-style, routed via /agent/:name) ───
const AGENT_ENDPOINT = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_LLM_PROXY_URL?.replace('/llm','/agent'))
  || '/api/agent';
// Per-tab fallback uid used only if auth init failed and window.__gem.userId
// never got populated. Still per-visitor (not shared across tabs/browsers).
let __tabFallbackUid = null;
function tabFallbackUid() {
  if (!__tabFallbackUid) {
    try { __tabFallbackUid = crypto.randomUUID?.() || 'dev-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10); }
    catch { __tabFallbackUid = 'dev-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10); }
  }
  return __tabFallbackUid;
}
async function callAgent(agentName, message, userId) {
  // Caller may pass a userId; otherwise read the auth-bootstrapped one.
  // Never falls back to the shared 'anonymous' string — that bled facts
  // across visitors (Sourcery #5).
  const uid = userId || window.__gem?.userId || tabFallbackUid();

  // Attach the Supabase session JWT so the Worker can verify auth and
  // enforce workspace-scoped knowledge retrieval. Falls back to anonymous
  // (global knowledge only) when there's no Supabase session.
  const headers = { 'Content-Type': 'application/json' };
  try {
    const sb = window.__gem?.supabase;
    if (sb) {
      const { data } = await sb.auth.getSession();
      const token = data?.session?.access_token;
      if (token) headers.authorization = `Bearer ${token}`;
    }
    const wsId = window.__gem?.activeWorkspaceId;
    if (wsId) headers['x-gem-workspace'] = wsId;
  } catch {}

  const res = await fetch(`${AGENT_ENDPOINT}/${encodeURIComponent(agentName)}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ message, user_id: uid }),
  });
  if (!res.ok) throw new Error(`agent ${res.status}`);
  return res.json();
}

const AI_AGENTS = [
  {id:'ai1', name:'TSK-Auto', icon:'🤖', color:T.coral, desc:'Natural-language task creator — turns descriptions into actionable projects', prompt:'You are TSK-Auto, Taskade\'s AI task generator. Given a description, return a JSON list of 3-7 structured tasks: [{"title":"","priority":"high|medium|low","tags":[""]}]'},
  {id:'ai2', name:'Architect', icon:'🏗️', color:T.purple, desc:'Project planning + system design + roadmaps', prompt:'You are the Architect agent. Help plan projects, break down epics, and design system architectures. Be concise and actionable.'},
  {id:'ai3', name:'Sentinel', icon:'🛡️', color:T.red, desc:'Security review, threat modeling, compliance', prompt:'You are the Sentinel agent — cybersecurity specialist. Review tasks for security implications and flag risks.'},
  {id:'ai4', name:'Analyst', icon:'📊', color:T.blue, desc:'Data analysis, metrics, financial modeling', prompt:'You are the Analyst agent. Provide data-driven insights, metrics breakdowns, and financial analysis.'},
  {id:'ai5', name:'Codex', icon:'💻', color:T.green, desc:'Code generation, PR reviews, debugging', prompt:'You are the Codex agent — principal engineer. Write and review production code (TypeScript/React/Next.js preferred).'},
];

// ─── Agent health observability tile (reads live from agent_grades) ───
function median(nums) {
  if (!nums.length) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}
function AgentHealthTile({ grades = [] }) {
  if (!grades.length) return null;
  const byAgent = grades.reduce((acc, g) => {
    const a = acc[g.agent_id] ||= { count: 0, sumScore: 0, latencies: [], models: {} };
    a.count += 1;
    a.sumScore += Number(g.score) || 0;
    a.latencies.push(Number(g.latency_ms) || 0);
    a.models[g.model_used] = (a.models[g.model_used] || 0) + 1;
    return acc;
  }, {});
  const rows = Object.entries(byAgent).map(([agent, s]) => ({
    agent,
    avgScore: Math.round(s.sumScore / s.count),
    p50Latency: median(s.latencies),  // true median now, matches the "p50 ms" label
    turns: s.count,
    topModel: Object.entries(s.models).sort((a, b) => b[1] - a[1])[0]?.[0] || '—',
  }));
  return (
    <div style={{
      border: `1px solid ${T.bd}`, background: T.card, borderRadius: 10, padding: 14,
      fontFamily: FT, color: T.tx, fontSize: 12,
    }}>
      <div style={{ color: T.sb, fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 }}>
        Agent Health · last {grades.length} turns
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ color: T.dm, fontWeight: 500 }}>
            <th style={{ textAlign: 'left', padding: '4px 6px' }}>Agent</th>
            <th style={{ textAlign: 'right', padding: '4px 6px' }}>Score</th>
            <th style={{ textAlign: 'right', padding: '4px 6px' }}>p50 ms</th>
            <th style={{ textAlign: 'right', padding: '4px 6px' }}>Turns</th>
            <th style={{ textAlign: 'left', padding: '4px 6px' }}>Top model</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.agent} style={{ borderTop: `1px solid ${T.bd}` }}>
              <td style={{ padding: '6px', fontWeight: 500 }}>{r.agent}</td>
              <td style={{ padding: '6px', textAlign: 'right', color: r.avgScore >= 75 ? T.green : r.avgScore >= 50 ? T.yellow : T.red }}>{r.avgScore}</td>
              <td style={{ padding: '6px', textAlign: 'right', color: T.sb }}>{r.p50Latency}</td>
              <td style={{ padding: '6px', textAlign: 'right', color: T.sb }}>{r.turns}</td>
              <td style={{ padding: '6px', color: T.sb, fontFamily: MN, fontSize: 11 }}>{r.topModel}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const TEMPLATES = [
  {id:'tp1', name:'Portal', icon:'🏛️', desc:'Internal company portal with teams & docs'},
  {id:'tp2', name:'CRM', icon:'👥', desc:'Lead pipeline, contacts, opportunities'},
  {id:'tp3', name:'Forms', icon:'📝', desc:'Collect responses + auto-sync to projects'},
  {id:'tp4', name:'Docs Wiki', icon:'📚', desc:'Knowledge base with AI search'},
  {id:'tp5', name:'Roadmap', icon:'🗺️', desc:'Quarterly planning + milestones'},
  {id:'tp6', name:'Sprint Board', icon:'🏃', desc:'Agile workflow + standups'},
];

const COVER_GRADIENTS = {
  coral:`linear-gradient(135deg, rgba(255,95,109,0.4) 0%, rgba(255,95,109,0.1) 50%, rgba(20,20,30,0.9) 100%)`,
  purple:`linear-gradient(135deg, rgba(155,92,255,0.4) 0%, rgba(155,92,255,0.1) 50%, rgba(20,20,30,0.9) 100%)`,
  blue:`linear-gradient(135deg, rgba(92,158,255,0.4) 0%, rgba(92,158,255,0.1) 50%, rgba(20,20,30,0.9) 100%)`,
  green:`linear-gradient(135deg, rgba(74,222,128,0.3) 0%, rgba(74,222,128,0.08) 50%, rgba(20,20,30,0.9) 100%)`,
  yellow:`linear-gradient(135deg, rgba(251,191,36,0.3) 0%, rgba(251,191,36,0.08) 50%, rgba(20,20,30,0.9) 100%)`,
};

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');
* { margin:0; padding:0; box-sizing:border-box; }
::-webkit-scrollbar { width:6px; height:6px; }
::-webkit-scrollbar-track { background:transparent; }
::-webkit-scrollbar-thumb { background:${T.mt}; border-radius:10px; }
::-webkit-scrollbar-thumb:hover { background:${T.bdA}; }
input, textarea, select, button { font-family:inherit; }
button { cursor:pointer; border:none; background:none; color:inherit; }

@keyframes fadeIn { from{opacity:0} to{opacity:1} }
@keyframes slideUp { from{opacity:0; transform:translateY(8px)} to{opacity:1; transform:translateY(0)} }
@keyframes slideDown { from{opacity:0; transform:translateY(-8px)} to{opacity:1; transform:translateY(0)} }
@keyframes slideRight { from{opacity:0; transform:translateX(-10px)} to{opacity:1; transform:translateX(0)} }
@keyframes spin { to{transform:rotate(360deg)} }
@keyframes shimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
@keyframes glow { 0%,100%{box-shadow:0 0 20px rgba(255,95,109,0.2)} 50%{box-shadow:0 0 40px rgba(255,95,109,0.4)} }

.task-row:hover { background:${T.cardH} !important; }
.task-row:hover .task-actions { opacity:1 !important; }
.project-card:hover { transform:translateY(-2px); box-shadow:0 20px 40px rgba(0,0,0,0.4); }
.sidebar-item:hover { background:${T.cardH} !important; }
.sidebar-item:hover .item-actions { opacity:1 !important; }
.chip:hover { background:${T.cardH} !important; border-color:${T.bdA} !important; }
`;

// ═══ UI PRIMITIVES ═════════════════════════════════════════════════════════
const Avatar = ({name, color, size=28, emoji}) => <div style={{
  width:size, height:size, borderRadius:size/2, flexShrink:0,
  background: emoji ? T.card : (color || T.coral),
  display:'flex', alignItems:'center', justifyContent:'center',
  fontSize: emoji ? size*0.5 : size*0.42, fontWeight:700, color:'#fff',
  border: emoji ? `1px solid ${T.bd}` : 'none',
}}>{emoji || (name?.[0]?.toUpperCase() || '?')}</div>;

const Pill = ({children, color=T.sb, bg}) => <span style={{
  display:'inline-flex', alignItems:'center', gap:4,
  fontSize:11, fontWeight:600, color, letterSpacing:'.01em',
  background: bg || `${color}18`, padding:'3px 9px', borderRadius:12, whiteSpace:'nowrap',
}}>{children}</span>;

const Btn = ({children, onClick, primary, ghost, size='md', style, disabled}) => <button
  onClick={onClick} disabled={disabled}
  style={{
    display:'inline-flex', alignItems:'center', gap:6,
    fontSize: size==='sm'?12:13, fontWeight:600,
    padding: size==='sm'?'6px 12px':'8px 16px', borderRadius:8,
    background: primary ? T.coral : ghost ? 'transparent' : T.card,
    color: primary ? '#fff' : T.tx,
    border: ghost ? `1px solid ${T.bd}` : 'none',
    opacity: disabled?0.4:1, transition:'all .15s',
    ...style,
  }}>{children}</button>;

const IconBtn = ({icon:I, onClick, active, size=16, title, style}) => <button
  onClick={onClick} title={title}
  style={{
    width:30, height:30, borderRadius:7, display:'flex', alignItems:'center', justifyContent:'center',
    background: active ? T.cardH : 'transparent',
    color: active ? T.coral : T.sb, transition:'all .15s', ...style,
  }}
  onMouseEnter={e => { if(!active){e.currentTarget.style.background=T.cardH; e.currentTarget.style.color=T.tx;} }}
  onMouseLeave={e => { if(!active){e.currentTarget.style.background='transparent'; e.currentTarget.style.color=T.sb;} }}
><I size={size}/></button>;

// ═══ SIDEBAR (Taskade's left nav) ══════════════════════════════════════════
function Sidebar({workspaces, activeWs, setActiveWs, activeView, setActiveView, activeProject, setActiveProject, onCreateProject}) {
  const[expWs, setExpWs] = useState({[activeWs?.id]:true});

  return <div style={{
    width:260, height:'100vh', background:T.bg2, borderRight:`1px solid ${T.bd}`,
    display:'flex', flexDirection:'column', flexShrink:0, overflow:'hidden',
  }}>
    {/* Workspace selector (top) */}
    <div style={{padding:'12px 14px', borderBottom:`1px solid ${T.bd}`}}>
      <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:10}}>
        <Avatar name="Gem" color={T.coral} size={32} emoji="G"/>
        <div style={{flex:1}}>
          <div style={{fontSize:13, fontWeight:700, color:T.tx}}>Gem</div>
          <div style={{fontSize:10, color:T.dm, fontFamily:MN}}>legal@gemcyber...</div>
        </div>
        <IconBtn icon={Bell} size={14}/>
        <IconBtn icon={Settings} size={14}/>
      </div>
      <button onClick={()=>setActiveView('home')} style={{
        width:'100%', padding:'8px 10px', borderRadius:7,
        background: activeView==='home' ? T.cardH : 'transparent',
        display:'flex', alignItems:'center', gap:9, color:activeView==='home'?T.tx:T.sb,
        fontSize:13, fontWeight:500, transition:'all .15s',
      }} className="sidebar-item">
        <Home size={15}/>
        <span>Home</span>
      </button>
      <button onClick={()=>setActiveView('inbox')} style={{
        width:'100%', padding:'8px 10px', borderRadius:7, marginTop:2,
        background: activeView==='inbox' ? T.cardH : 'transparent',
        display:'flex', alignItems:'center', gap:9, color:activeView==='inbox'?T.tx:T.sb,
        fontSize:13, fontWeight:500,
      }} className="sidebar-item">
        <Bell size={15}/>
        <span style={{flex:1, textAlign:'left'}}>Inbox</span>
        <Pill color={T.coral}>3</Pill>
      </button>
      <button onClick={()=>setActiveView('agents')} style={{
        width:'100%', padding:'8px 10px', borderRadius:7, marginTop:2,
        background: activeView==='agents' ? T.cardH : 'transparent',
        display:'flex', alignItems:'center', gap:9, color:activeView==='agents'?T.tx:T.sb,
        fontSize:13, fontWeight:500,
      }} className="sidebar-item">
        <Bot size={15}/>
        <span>AI Agents</span>
      </button>
      <button onClick={()=>setActiveView('templates')} style={{
        width:'100%', padding:'8px 10px', borderRadius:7, marginTop:2,
        background: activeView==='templates' ? T.cardH : 'transparent',
        display:'flex', alignItems:'center', gap:9, color:activeView==='templates'?T.tx:T.sb,
        fontSize:13, fontWeight:500,
      }} className="sidebar-item">
        <LayoutGrid size={15}/>
        <span>Templates</span>
      </button>
    </div>

    {/* Workspaces + Projects */}
    <div style={{flex:1, overflowY:'auto', padding:'10px 8px'}}>
      <div style={{padding:'4px 8px 8px', display:'flex', alignItems:'center', justifyContent:'space-between'}}>
        <span style={{fontSize:10, fontWeight:700, color:T.dm, textTransform:'uppercase', letterSpacing:'.08em'}}>Workspaces</span>
        <IconBtn icon={Plus} size={12}/>
      </div>

      {workspaces.map(ws => <div key={ws.id} style={{marginBottom:4}}>
        {/* Workspace header */}
        <button
          onClick={()=>{setActiveWs(ws); setExpWs(e=>({...e,[ws.id]:!e[ws.id]}))}}
          style={{
            width:'100%', padding:'7px 8px', borderRadius:6,
            display:'flex', alignItems:'center', gap:8,
            background: activeWs?.id===ws.id ? T.cardH : 'transparent',
            color: activeWs?.id===ws.id ? T.tx : T.sb,
            transition:'all .15s',
          }} className="sidebar-item">
          <ChevronRight size={11} style={{transform:expWs[ws.id]?'rotate(90deg)':'none', transition:'transform .15s', color:T.dm}}/>
          <Avatar name={ws.name} color={ws.color} size={20} emoji={ws.emoji}/>
          <span style={{flex:1, textAlign:'left', fontSize:12, fontWeight:600}}>{ws.name}</span>
          {ws.isPersonal && <Lock size={10} style={{color:T.dm}}/>}
          {!ws.isPersonal && <Pill color={T.sb}>{ws.memberCount}</Pill>}
        </button>

        {/* Projects under workspace */}
        {expWs[ws.id] && <div style={{paddingLeft:18, marginTop:2}}>
          {/* Folders */}
          {ws.folders?.map(f => <div key={f.id} style={{marginTop:2}}>
            <div style={{padding:'5px 8px', fontSize:10, color:T.dm, textTransform:'uppercase', letterSpacing:'.06em', fontWeight:700, display:'flex', alignItems:'center', gap:5}}>
              <Folder size={10}/>{f.name}
            </div>
            {f.projects.map(pid => {
              const p = ws.projects.find(x => x.id===pid);
              if (!p) return null;
              return <button key={p.id} onClick={()=>{setActiveProject(p); setActiveView('project')}} style={{
                width:'100%', padding:'5px 8px', borderRadius:5,
                display:'flex', alignItems:'center', gap:7,
                background: activeProject?.id===p.id ? T.cardH : 'transparent',
                color: activeProject?.id===p.id ? T.tx : T.sb,
                fontSize:12, fontWeight:500, textAlign:'left',
                transition:'all .15s', marginBottom:1,
              }} className="sidebar-item">
                <span style={{width:16, textAlign:'center', fontSize:11}}>{p.emoji}</span>
                <span style={{flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{p.name}</span>
                {p.favorite && <Star size={9} fill={T.yellow} color={T.yellow}/>}
              </button>;
            })}
          </div>)}

          {/* Projects not in any folder */}
          {ws.projects.filter(p => !ws.folders?.some(f => f.projects.includes(p.id))).map(p => (
            <button key={p.id} onClick={()=>{setActiveProject(p); setActiveView('project')}} style={{
              width:'100%', padding:'5px 8px', borderRadius:5,
              display:'flex', alignItems:'center', gap:7,
              background: activeProject?.id===p.id ? T.cardH : 'transparent',
              color: activeProject?.id===p.id ? T.tx : T.sb,
              fontSize:12, fontWeight:500, textAlign:'left',
              transition:'all .15s', marginBottom:1,
            }} className="sidebar-item">
              <span style={{width:16, textAlign:'center', fontSize:11}}>{p.emoji}</span>
              <span style={{flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{p.name}</span>
              {p.favorite && <Star size={9} fill={T.yellow} color={T.yellow}/>}
            </button>
          ))}

          {/* Add project button */}
          <button onClick={()=>onCreateProject(ws.id)} style={{
            width:'100%', padding:'5px 8px', borderRadius:5, marginTop:3,
            display:'flex', alignItems:'center', gap:7,
            color:T.dm, fontSize:11, fontWeight:500, textAlign:'left',
          }} className="sidebar-item">
            <Plus size={11}/><span>Add project</span>
          </button>
        </div>}
      </div>)}
    </div>

    {/* Bottom: upgrade + help */}
    <div style={{padding:'8px 10px', borderTop:`1px solid ${T.bd}`, display:'flex', gap:6}}>
      <IconBtn icon={HelpCircle} size={15} title="Help"/>
      <IconBtn icon={Users} size={15} title="Invite"/>
      <div style={{flex:1}}/>
      <Pill color={T.purple}>Free</Pill>
    </div>
  </div>;
}

// ═══ HOME VIEW (matches your screenshot exactly) ═══════════════════════════
function HomeView({workspace, projects, onOpenProject, onCreateProject, onAIGenerate, recentGrades = []}) {
  const[prompt, setPrompt] = useState('');
  const[selectedAgent, setSelectedAgent] = useState('TSK-Auto');
  const[generating, setGenerating] = useState(false);
  const[templateFilter, setTemplateFilter] = useState('All');

  const generate = async () => {
    if (!prompt.trim() || generating) return;
    setGenerating(true);
    try {
      // Route to the Base44-style TSK-Auto agent on the Worker (free-tier model + planning + critique)
      const d = await callAgent('TSK-Auto', `Generate a project for: "${prompt}". Return ONLY valid JSON: {"name":"","emoji":"","tasks":[{"title":"","priority":"high|medium|low","tags":[""]}]}`);
      const txt = d.content?.map(b => b.text || '').join('') || '';
      const spec = JSON.parse(txt.replace(/```json|```/g, '').trim());
      await onAIGenerate(spec);
      setPrompt('');
    } catch (e) { alert('Generation error: ' + e.message); }
    setGenerating(false);
  };

  return <div style={{animation:'fadeIn .3s', maxWidth:1100, margin:'0 auto', padding:'20px 24px'}}>
    {/* AI Prompt Hero */}
    <div style={{
      position:'relative', borderRadius:16, padding:'32px 28px 28px',
      background:T.bg2, border:`1px solid ${T.bd}`, overflow:'hidden',
      marginBottom:24,
    }}>
      <div style={{
        position:'absolute', inset:0, pointerEvents:'none',
        background: T.glow, opacity:0.9,
      }}/>
      <div style={{position:'relative', zIndex:1}}>
        {/* AI Input */}
        <div style={{
          background: 'rgba(10,10,15,0.6)', borderRadius:14,
          border:`1.5px solid ${T.purple}`, padding:'14px 16px',
          marginBottom:16, boxShadow:`0 8px 32px rgba(155,92,255,0.15)`,
        }}>
          <textarea
            value={prompt} onChange={e=>setPrompt(e.target.value)}
            onKeyDown={e => {if(e.key==='Enter'&&e.metaKey)generate()}}
            placeholder={selectedAgent==='TSK-Auto' ? 'FAQ hub with AI answers...' : `Ask ${selectedAgent} to build...`}
            style={{
              width:'100%', background:'transparent', border:'none', outline:'none',
              color:T.tx, fontSize:15, resize:'none', fontFamily:FT,
              minHeight:40, maxHeight:120, lineHeight:1.5,
            }}
            rows={1}
          />
          <div style={{display:'flex', alignItems:'center', gap:10, marginTop:10}}>
            <IconBtn icon={Plus} size={16} title="Add media"/>
            <div style={{flex:1}}/>
            <button
              onClick={()=>{const i=AI_AGENTS.findIndex(a=>a.name===selectedAgent); setSelectedAgent(AI_AGENTS[(i+1)%AI_AGENTS.length].name)}}
              style={{
                display:'flex', alignItems:'center', gap:7, padding:'6px 12px',
                borderRadius:8, background:T.card, border:`1px solid ${T.bd}`,
                color:T.tx, fontSize:12, fontWeight:600,
              }}>
              <Bot size={13}/><span>{selectedAgent}</span>
            </button>
            <button
              onClick={generate} disabled={!prompt.trim() || generating}
              style={{
                padding:'7px 14px', borderRadius:8, fontSize:13, fontWeight:600,
                background: prompt.trim() ? `linear-gradient(135deg, ${T.coral}, ${T.purple})` : T.card,
                color: prompt.trim() ? '#fff' : T.dm,
                display:'flex', alignItems:'center', gap:6,
                opacity: generating ? 0.6 : 1,
              }}>
              {generating ? <Loader2 size={13} style={{animation:'spin 1s linear infinite'}}/> : <Sparkles size={13}/>}
              {generating ? 'Generating...' : 'Generate'}
            </button>
          </div>
        </div>

        {/* Template chips */}
        <div style={{display:'flex', gap:8, alignItems:'center', marginBottom:12, flexWrap:'wrap'}}>
          {TEMPLATES.slice(0,4).map(tp => <button key={tp.id} className="chip" style={{
            padding:'7px 14px', borderRadius:20, background:'rgba(255,255,255,0.04)',
            border:`1px solid ${T.bd}`, color:T.tx, fontSize:12, fontWeight:500,
            display:'flex', alignItems:'center', gap:5, transition:'all .15s',
          }}>
            <span>{tp.icon}</span><span>{tp.name}</span>
          </button>)}
          <button className="chip" style={{
            padding:'7px 12px', borderRadius:20, background:'rgba(255,255,255,0.04)',
            border:`1px solid ${T.bd}`, color:T.sb,
          }}><ChevronDown size={14}/></button>
        </div>

        {/* Open my projects + always-open toggle */}
        <div style={{display:'flex', alignItems:'center', gap:16, fontSize:13}}>
          <button style={{color:T.tx, fontWeight:500}}>Open my projects</button>
          <span style={{color:T.dm, fontSize:11}}>·</span>
          <button style={{color:T.sb, display:'flex', alignItems:'center', gap:5}}>
            <Circle size={12}/>Always open Projects here
          </button>
        </div>
      </div>
    </div>

    {/* Workspace tabs */}
    <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:16, flexWrap:'wrap'}}>
      <div style={{
        display:'flex', alignItems:'center', gap:8, padding:'7px 12px 7px 7px',
        borderRadius:20, background:T.card, border:`1px solid ${T.bd}`,
      }}>
        <Avatar name={workspace.name} color={workspace.color} size={22} emoji={workspace.emoji}/>
        <span style={{fontSize:13, fontWeight:600, color:T.tx}}>{workspace.name}</span>
        <Edit3 size={11} style={{color:T.dm}}/>
        <Pill color={T.sb}>{projects.filter(p=>p.favorite).length}/{projects.length}</Pill>
      </div>
      <button className="chip" style={{
        padding:'7px 14px', borderRadius:20, background:T.card,
        border:`1px solid ${T.bd}`, color:T.tx, fontSize:12, fontWeight:500,
        display:'flex', alignItems:'center', gap:6,
      }}>
        <LayoutGrid size={13}/><span>Templates</span>
      </button>
      <button onClick={()=>onCreateProject()} style={{
        width:38, height:38, borderRadius:'50%',
        background: `linear-gradient(135deg, ${T.coral}, ${T.coralD})`,
        display:'flex', alignItems:'center', justifyContent:'center',
        boxShadow:`0 6px 20px rgba(255,95,109,0.4)`,
      }}><Plus size={18} color="#fff"/></button>
    </div>

    {/* All / View toggle */}
    <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14}}>
      <button style={{display:'flex', alignItems:'center', gap:7, color:T.tx, fontSize:13, fontWeight:600}}>
        <Layers size={14} color={T.sb}/>
        <span>All</span>
        <Pill color={T.sb}>{projects.length}</Pill>
        <ChevronDown size={12} style={{color:T.dm}}/>
      </button>
      <button style={{display:'flex', alignItems:'center', gap:6, color:T.sb, fontSize:12, fontWeight:500}}>
        <SlidersHorizontal size={13}/><span>View</span>
      </button>
    </div>

    {/* Project cards grid */}
    <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(260px, 1fr))', gap:14}}>
      {projects.map(p => <div
        key={p.id}
        onClick={()=>onOpenProject(p)}
        className="project-card"
        style={{
          borderRadius:14, cursor:'pointer', overflow:'hidden',
          background: COVER_GRADIENTS[p.cover] || COVER_GRADIENTS.coral,
          border:`1px solid ${T.bd}`, transition:'all .2s',
          minHeight:160, display:'flex', flexDirection:'column',
          position:'relative',
        }}>
        {/* Cover area with centered emoji */}
        <div style={{
          flex:1, display:'flex', alignItems:'center', justifyContent:'center',
          padding:20, position:'relative',
        }}>
          <div style={{
            width:68, height:68, borderRadius:'50%',
            background: p.color + '30', border:`2px solid ${p.color}60`,
            display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:30, backdropFilter:'blur(8px)',
          }}>{p.emoji}</div>
          <button style={{
            position:'absolute', top:10, right:10, width:28, height:28,
            borderRadius:7, background:'rgba(0,0,0,0.4)', color:T.tx,
            display:'flex', alignItems:'center', justifyContent:'center',
            backdropFilter:'blur(8px)',
          }} onClick={e => e.stopPropagation()}>
            <MoreHorizontal size={14}/>
          </button>
        </div>
        {/* Footer */}
        <div style={{
          padding:'12px 14px', background:'rgba(10,10,15,0.6)',
          borderTop:`1px solid ${T.bd}`, backdropFilter:'blur(10px)',
          display:'flex', alignItems:'center', gap:8,
        }}>
          <div style={{
            width:22, height:22, borderRadius:'50%', background:p.color,
            display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:11, fontWeight:700, color:'#fff',
          }}>{p.emoji}</div>
          <span style={{flex:1, fontSize:13, fontWeight:600, color:T.tx, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{p.name}</span>
          {p.favorite && <Star size={11} fill={T.yellow} color={T.yellow}/>}
        </div>
      </div>)}

      {/* New app card */}
      <div onClick={()=>onCreateProject()} style={{
        borderRadius:14, cursor:'pointer', minHeight:160,
        border:`2px dashed ${T.bd}`, background:'transparent',
        display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
        gap:10, transition:'all .2s',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = T.coral; e.currentTarget.style.background = 'rgba(255,95,109,0.03)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = T.bd; e.currentTarget.style.background = 'transparent'; }}>
        <div style={{
          width:48, height:48, borderRadius:'50%',
          background: `linear-gradient(135deg, ${T.coral}30, ${T.purple}30)`,
          border: `1.5px solid ${T.coral}60`,
          display:'flex', alignItems:'center', justifyContent:'center',
        }}><Plus size={22} color={T.coral}/></div>
        <span style={{fontSize:13, fontWeight:500, color:T.sb}}>New app</span>
      </div>
    </div>

    {/* Agent observability — only renders when agent_grades has rows */}
    {recentGrades.length > 0 && <div style={{marginTop: 28}}>
      <AgentHealthTile grades={recentGrades}/>
    </div>}
  </div>;
}

// ═══ PROJECT VIEW (all 8 Taskade views) ════════════════════════════════════
function ProjectView({project, tasks, setTasks, onBack}) {
  const[view, setView] = useState('list');
  const[filter, setFilter] = useState('all');
  const[newTask, setNewTask] = useState('');
  const[selectedTask, setSelectedTask] = useState(null);

  const views = [
    {k:'list', l:'List', i:ListIcon},
    {k:'board', l:'Board', i:Columns3},
    {k:'calendar', l:'Calendar', i:Calendar},
    {k:'mindmap', l:'Mind Map', i:GitBranch},
    {k:'org', l:'Org Chart', i:Network},
    {k:'action', l:'Action', i:Target},
    {k:'table', l:'Table', i:Grid3x3},
    {k:'flow', l:'Flow', i:WorkflowIcon},
  ];

  const toggle = (id) => {
    const upd = tasks.map(t => t.id===id ? {...t, completed:!t.completed} : t);
    setTasks(upd);
  };
  const addTask = () => {
    if (!newTask.trim()) return;
    const t = {id:uid(), title:newTask.trim(), completed:false, priority:'medium', assignee:null, dueDate:null, tags:[], notes:'', subtasks:[]};
    setTasks([t, ...tasks]);
    setNewTask('');
  };
  const delTask = (id) => setTasks(tasks.filter(t => t.id!==id));

  const filtered = tasks.filter(t => {
    if (filter==='active') return !t.completed;
    if (filter==='done') return t.completed;
    return true;
  });

  return <div style={{display:'flex', flexDirection:'column', height:'100vh', background:T.bg}}>
    {/* Project header */}
    <div style={{
      padding:'14px 24px', borderBottom:`1px solid ${T.bd}`,
      display:'flex', alignItems:'center', gap:12, background:T.bg2,
    }}>
      <IconBtn icon={ArrowLeft} onClick={onBack} size={16}/>
      <div style={{
        width:34, height:34, borderRadius:'50%',
        background:project.color, display:'flex', alignItems:'center', justifyContent:'center',
        fontSize:16,
      }}>{project.emoji}</div>
      <div style={{flex:1}}>
        <div style={{fontSize:15, fontWeight:700, color:T.tx}}>{project.name}</div>
        <div style={{fontSize:11, color:T.dm, fontFamily:MN}}>{project.members} member{project.members>1?'s':''} · {tasks.length} tasks</div>
      </div>
      <Btn ghost size="sm"><Share2 size={13}/>Share</Btn>
      <Btn ghost size="sm"><UserPlus size={13}/>Invite</Btn>
      <IconBtn icon={MoreHorizontal} size={16}/>
    </div>

    {/* View toolbar */}
    <div style={{
      padding:'10px 24px', borderBottom:`1px solid ${T.bd}`,
      display:'flex', alignItems:'center', gap:5, background:T.bg2, overflowX:'auto',
    }}>
      {views.map(v => <button
        key={v.k} onClick={()=>setView(v.k)}
        style={{
          padding:'6px 11px', borderRadius:7, display:'flex', alignItems:'center', gap:6,
          background: view===v.k ? T.cardH : 'transparent',
          color: view===v.k ? T.tx : T.sb,
          fontSize:12, fontWeight:500, whiteSpace:'nowrap',
          borderBottom: view===v.k ? `2px solid ${T.coral}` : '2px solid transparent',
          transition:'all .15s',
        }}>
        <v.i size={13}/>{v.l}
      </button>)}
      <div style={{flex:1}}/>
      <button style={{padding:'6px 10px', borderRadius:7, display:'flex', alignItems:'center', gap:5, color:T.sb, fontSize:12}}>
        <Filter size={12}/>Filter
      </button>
      <IconBtn icon={Search} size={14}/>
    </div>

    {/* Add task bar */}
    <div style={{padding:'10px 24px', borderBottom:`1px solid ${T.bd}`}}>
      <div style={{
        display:'flex', alignItems:'center', gap:8, padding:'8px 12px',
        borderRadius:9, background:T.card, border:`1px solid ${T.bd}`,
      }}>
        <Plus size={15} color={T.dm}/>
        <input
          value={newTask} onChange={e=>setNewTask(e.target.value)}
          onKeyDown={e=>e.key==='Enter'&&addTask()}
          placeholder="Add a task..."
          style={{flex:1, background:'transparent', border:'none', outline:'none', color:T.tx, fontSize:13, fontFamily:FT}}
        />
        {newTask && <Btn primary size="sm" onClick={addTask}>Add</Btn>}
      </div>
    </div>

    {/* Content area */}
    <div style={{flex:1, overflow:'auto', padding:'8px 24px 24px'}}>
      {view==='list' && <ListView tasks={filtered} toggle={toggle} delTask={delTask} setSelectedTask={setSelectedTask}/>}
      {view==='board' && <BoardView tasks={filtered} toggle={toggle}/>}
      {view==='calendar' && <CalendarView tasks={filtered}/>}
      {view==='mindmap' && <MindMapView project={project} tasks={filtered}/>}
      {view==='org' && <OrgChartView project={project} tasks={filtered}/>}
      {view==='action' && <ActionView tasks={filtered} toggle={toggle}/>}
      {view==='table' && <TableView tasks={filtered} toggle={toggle}/>}
      {view==='flow' && <FlowView tasks={filtered}/>}
    </div>

    {/* Task detail drawer */}
    {selectedTask && <TaskDrawer task={selectedTask} onClose={()=>setSelectedTask(null)} onUpdate={updated => {
      setTasks(tasks.map(t => t.id===updated.id ? updated : t));
      setSelectedTask(updated);
    }}/>}
  </div>;
}

// ═══ LIST VIEW ═════════════════════════════════════════════════════════════
function ListView({tasks, toggle, delTask, setSelectedTask}) {
  const grouped = {high:[], medium:[], low:[]};
  tasks.forEach(t => grouped[t.priority || 'medium'].push(t));

  const PRI_LABELS = {high:'High Priority', medium:'Medium', low:'Low'};
  const PRI_COLORS = {high:T.red, medium:T.yellow, low:T.sb};

  return <div style={{display:'flex', flexDirection:'column', gap:16, animation:'fadeIn .3s'}}>
    {Object.entries(grouped).map(([pri, items]) => items.length > 0 && (
      <div key={pri}>
        <div style={{
          display:'flex', alignItems:'center', gap:7, marginBottom:6, padding:'0 4px',
        }}>
          <div style={{width:6, height:6, borderRadius:'50%', background:PRI_COLORS[pri]}}/>
          <span style={{fontSize:10, color:T.sb, textTransform:'uppercase', letterSpacing:'.08em', fontWeight:700}}>{PRI_LABELS[pri]}</span>
          <span style={{fontSize:10, color:T.dm, fontFamily:MN}}>{items.length}</span>
        </div>
        {items.map(t => <div key={t.id} className="task-row" style={{
          display:'flex', alignItems:'center', gap:10, padding:'10px 12px',
          borderRadius:8, transition:'all .15s', cursor:'pointer',
        }} onClick={()=>setSelectedTask(t)}>
          <button onClick={e=>{e.stopPropagation(); toggle(t.id)}} style={{display:'flex'}}>
            {t.completed ? <CheckCircle2 size={17} color={T.green}/> : <Circle size={17} color={T.dm}/>}
          </button>
          <div style={{flex:1, minWidth:0}}>
            <div style={{fontSize:13, color:t.completed ? T.dm : T.tx, textDecoration:t.completed?'line-through':'none', fontWeight:500}}>{t.title}</div>
            {t.notes && <div style={{fontSize:11, color:T.dm, marginTop:2}}>{t.notes}</div>}
          </div>
          {t.subtasks?.length>0 && <Pill color={T.sb}><Layers size={10}/>{t.subtasks.filter(s=>s.completed).length}/{t.subtasks.length}</Pill>}
          {t.tags?.map(tag => <Pill key={tag} color={T.purple}>{tag}</Pill>)}
          {t.assignee && <Avatar name={t.assignee} color={T.coral} size={22}/>}
          {t.dueDate && <span style={{fontSize:11, color:T.sb, fontFamily:MN}}>{t.dueDate.slice(5)}</span>}
          <div className="task-actions" style={{display:'flex', gap:3, opacity:0, transition:'opacity .15s'}}>
            <IconBtn icon={Trash2} size={13} onClick={e=>{e.stopPropagation(); delTask(t.id)}}/>
          </div>
        </div>)}
      </div>
    ))}
    {tasks.length===0 && <div style={{textAlign:'center', padding:'60px 20px', color:T.dm, fontSize:13}}>
      <ListIcon size={36} style={{opacity:0.3, marginBottom:12}}/>
      <div>No tasks yet. Add one above to get started.</div>
    </div>}
  </div>;
}

// ═══ BOARD VIEW ════════════════════════════════════════════════════════════
function BoardView({tasks, toggle}) {
  const cols = [
    {k:'todo', l:'To Do', c:T.sb, filter:t=>!t.completed && t.priority!=='high'},
    {k:'active', l:'In Progress', c:T.blue, filter:t=>!t.completed && t.priority==='high'},
    {k:'done', l:'Done', c:T.green, filter:t=>t.completed},
  ];
  return <div style={{display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:14, animation:'fadeIn .3s'}}>
    {cols.map(col => {
      const items = tasks.filter(col.filter);
      return <div key={col.k} style={{background:T.bg2, borderRadius:10, padding:12, border:`1px solid ${T.bd}`}}>
        <div style={{display:'flex', alignItems:'center', gap:7, marginBottom:12, padding:'0 4px'}}>
          <div style={{width:7, height:7, borderRadius:'50%', background:col.c}}/>
          <span style={{fontSize:11, color:T.tx, fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em'}}>{col.l}</span>
          <Pill color={T.sb}>{items.length}</Pill>
        </div>
        <div style={{display:'flex', flexDirection:'column', gap:8}}>
          {items.map(t => <div key={t.id} onClick={()=>toggle(t.id)} style={{
            padding:11, background:T.card, borderRadius:8, cursor:'pointer',
            border:`1px solid ${T.bd}`, transition:'all .15s',
          }} onMouseEnter={e=>e.currentTarget.style.borderColor=T.bdH} onMouseLeave={e=>e.currentTarget.style.borderColor=T.bd}>
            <div style={{display:'flex', alignItems:'center', gap:7, marginBottom:6}}>
              {t.completed ? <CheckCircle2 size={14} color={T.green}/> : <Circle size={14} color={T.dm}/>}
              <span style={{flex:1, fontSize:12, color:t.completed?T.dm:T.tx, fontWeight:500, textDecoration:t.completed?'line-through':'none'}}>{t.title}</span>
            </div>
            {(t.tags?.length>0 || t.assignee) && <div style={{display:'flex', alignItems:'center', gap:5, marginTop:7}}>
              {t.tags?.slice(0,2).map(tag => <Pill key={tag} color={T.purple}>{tag}</Pill>)}
              <div style={{flex:1}}/>
              {t.assignee && <Avatar name={t.assignee} color={T.coral} size={18}/>}
            </div>}
          </div>)}
          {items.length===0 && <div style={{padding:20, textAlign:'center', fontSize:11, color:T.dm}}>Empty</div>}
        </div>
      </div>;
    })}
  </div>;
}

// ═══ CALENDAR VIEW ═════════════════════════════════════════════════════════
function CalendarView({tasks}) {
  const now = new Date();
  const month = now.toLocaleString('default', {month:'long', year:'numeric'});
  const daysInMonth = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).getDay();
  const today = now.getDate();

  const tasksByDate = {};
  tasks.forEach(t => { if (t.dueDate) { tasksByDate[t.dueDate] = tasksByDate[t.dueDate] || []; tasksByDate[t.dueDate].push(t); }});

  const yr = now.getFullYear();
  const mo = String(now.getMonth()+1).padStart(2, '0');

  return <div style={{animation:'fadeIn .3s'}}>
    <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16}}>
      <div style={{fontSize:17, fontWeight:700, color:T.tx}}>{month}</div>
      <div style={{display:'flex', gap:6}}>
        <IconBtn icon={ChevronLeft} size={16}/>
        <Btn ghost size="sm">Today</Btn>
        <IconBtn icon={ChevronRight} size={16}/>
      </div>
    </div>
    <div style={{display:'grid', gridTemplateColumns:'repeat(7, 1fr)', gap:4, marginBottom:4}}>
      {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => <div key={d} style={{
        padding:'8px 4px', fontSize:10, fontWeight:700, color:T.sb, textAlign:'center',
        textTransform:'uppercase', letterSpacing:'.06em',
      }}>{d}</div>)}
    </div>
    <div style={{display:'grid', gridTemplateColumns:'repeat(7, 1fr)', gap:4}}>
      {Array(firstDay).fill(0).map((_,i) => <div key={`e${i}`}/>)}
      {Array(daysInMonth).fill(0).map((_,i) => {
        const day = i+1;
        const dateStr = `${yr}-${mo}-${String(day).padStart(2,'0')}`;
        const dayTasks = tasksByDate[dateStr] || [];
        return <div key={day} style={{
          minHeight:84, padding:7, borderRadius:7,
          background: day===today ? `${T.coral}10` : T.card,
          border:`1px solid ${day===today ? T.coral : T.bd}`,
        }}>
          <div style={{fontSize:12, fontWeight:day===today?700:500, color:day===today?T.coral:T.tx, marginBottom:4}}>{day}</div>
          {dayTasks.slice(0,2).map(t => <div key={t.id} style={{
            fontSize:9, padding:'2px 5px', borderRadius:3, marginBottom:2,
            background:`${t.priority==='high'?T.red:t.priority==='medium'?T.yellow:T.blue}20`,
            color:T.tx, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
          }}>{t.title}</div>)}
          {dayTasks.length>2 && <div style={{fontSize:9, color:T.dm, marginTop:2}}>+{dayTasks.length-2} more</div>}
        </div>;
      })}
    </div>
  </div>;
}

// ═══ MIND MAP VIEW ═════════════════════════════════════════════════════════
function MindMapView({project, tasks}) {
  const centerX = 400, centerY = 240;
  const radius = 170;
  return <div style={{animation:'fadeIn .3s', position:'relative', height:500, overflow:'hidden', background:T.bg2, borderRadius:12, border:`1px solid ${T.bd}`}}>
    <svg width="100%" height="500" viewBox="0 0 800 500">
      {tasks.map((t, i) => {
        const angle = (i / tasks.length) * Math.PI * 2 - Math.PI/2;
        const x = centerX + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle) * radius;
        return <g key={t.id}>
          <line x1={centerX} y1={centerY} x2={x} y2={y} stroke={T.bd} strokeWidth="1.5"/>
          <rect x={x-70} y={y-16} width="140" height="32" rx="8" fill={t.completed?T.card:T.cardH} stroke={t.priority==='high'?T.red:T.bd} strokeWidth="1"/>
          <text x={x} y={y+4} textAnchor="middle" fill={t.completed?T.dm:T.tx} fontSize="11" fontWeight="500" fontFamily={FT}>
            {t.title.length>18 ? t.title.slice(0,18)+'...' : t.title}
          </text>
        </g>;
      })}
      <circle cx={centerX} cy={centerY} r="50" fill={project.color} opacity="0.3"/>
      <circle cx={centerX} cy={centerY} r="40" fill={project.color}/>
      <text x={centerX} y={centerY+5} textAnchor="middle" fill="#fff" fontSize="22" fontFamily={FT}>{project.emoji}</text>
    </svg>
  </div>;
}

// ═══ ORG CHART ═════════════════════════════════════════════════════════════
function OrgChartView({project, tasks}) {
  return <div style={{animation:'fadeIn .3s', padding:20, display:'flex', flexDirection:'column', alignItems:'center', gap:30}}>
    <div style={{
      padding:'14px 20px', borderRadius:10, background:project.color, color:'#fff',
      display:'flex', alignItems:'center', gap:10, boxShadow:`0 8px 24px ${project.color}40`,
    }}>
      <span style={{fontSize:20}}>{project.emoji}</span>
      <span style={{fontSize:14, fontWeight:700}}>{project.name}</span>
    </div>
    <svg width="80" height="40"><line x1="40" y1="0" x2="40" y2="40" stroke={T.bd} strokeWidth="2"/></svg>
    <div style={{display:'flex', gap:14, flexWrap:'wrap', justifyContent:'center'}}>
      {tasks.slice(0,6).map(t => <div key={t.id} style={{
        padding:'11px 15px', borderRadius:9, background:T.card, border:`1px solid ${T.bd}`,
        display:'flex', alignItems:'center', gap:8, minWidth:180,
      }}>
        {t.completed ? <CheckCircle2 size={15} color={T.green}/> : <Circle size={15} color={T.dm}/>}
        <div style={{flex:1}}>
          <div style={{fontSize:12, fontWeight:600, color:T.tx}}>{t.title}</div>
          {t.assignee && <div style={{fontSize:10, color:T.dm, marginTop:2}}>{t.assignee}</div>}
        </div>
      </div>)}
    </div>
  </div>;
}

// ═══ ACTION VIEW ═══════════════════════════════════════════════════════════
function ActionView({tasks, toggle}) {
  const today = new Date().toISOString().slice(0,10);
  const sections = [
    {k:'overdue', l:'Overdue', c:T.red, filter:t=>!t.completed && t.dueDate && t.dueDate<today},
    {k:'today', l:'Due Today', c:T.yellow, filter:t=>!t.completed && t.dueDate===today},
    {k:'upcoming', l:'Upcoming', c:T.blue, filter:t=>!t.completed && t.dueDate && t.dueDate>today},
    {k:'nodate', l:'No Due Date', c:T.sb, filter:t=>!t.completed && !t.dueDate},
    {k:'done', l:'Completed', c:T.green, filter:t=>t.completed},
  ];
  return <div style={{animation:'fadeIn .3s', display:'flex', flexDirection:'column', gap:18}}>
    {sections.map(s => {
      const items = tasks.filter(s.filter);
      if (items.length===0) return null;
      return <div key={s.k}>
        <div style={{display:'flex', alignItems:'center', gap:7, marginBottom:7, padding:'0 4px'}}>
          <div style={{width:6, height:6, borderRadius:'50%', background:s.c}}/>
          <span style={{fontSize:11, color:T.tx, fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em'}}>{s.l}</span>
          <Pill color={s.c}>{items.length}</Pill>
        </div>
        {items.map(t => <div key={t.id} className="task-row" style={{display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:7, cursor:'pointer'}}>
          <button onClick={()=>toggle(t.id)} style={{display:'flex'}}>
            {t.completed ? <CheckCircle2 size={16} color={T.green}/> : <Circle size={16} color={T.dm}/>}
          </button>
          <span style={{flex:1, fontSize:12, color:t.completed?T.dm:T.tx, textDecoration:t.completed?'line-through':'none'}}>{t.title}</span>
          {t.dueDate && <Pill color={s.c}><Clock size={10}/>{t.dueDate.slice(5)}</Pill>}
          {t.assignee && <Avatar name={t.assignee} color={T.coral} size={20}/>}
        </div>)}
      </div>;
    })}
  </div>;
}

// ═══ TABLE VIEW ════════════════════════════════════════════════════════════
function TableView({tasks, toggle}) {
  return <div style={{animation:'fadeIn .3s', background:T.bg2, borderRadius:9, border:`1px solid ${T.bd}`, overflow:'hidden'}}>
    <div style={{display:'grid', gridTemplateColumns:'30px 2fr 1fr 1fr 1fr 1fr', gap:0, padding:'10px 14px', background:T.card, borderBottom:`1px solid ${T.bd}`}}>
      {['', 'Task', 'Status', 'Priority', 'Assignee', 'Due Date'].map(h => <div key={h} style={{fontSize:10, color:T.sb, fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em'}}>{h}</div>)}
    </div>
    {tasks.map(t => <div key={t.id} className="task-row" style={{display:'grid', gridTemplateColumns:'30px 2fr 1fr 1fr 1fr 1fr', gap:0, padding:'10px 14px', borderBottom:`1px solid ${T.bd}`, alignItems:'center'}}>
      <button onClick={()=>toggle(t.id)} style={{display:'flex'}}>
        {t.completed ? <CheckCircle2 size={14} color={T.green}/> : <Circle size={14} color={T.dm}/>}
      </button>
      <span style={{fontSize:12, color:t.completed?T.dm:T.tx, textDecoration:t.completed?'line-through':'none'}}>{t.title}</span>
      <Pill color={t.completed?T.green:T.blue}>{t.completed?'Done':'Active'}</Pill>
      <Pill color={t.priority==='high'?T.red:t.priority==='medium'?T.yellow:T.sb}>{t.priority}</Pill>
      <div>{t.assignee ? <div style={{display:'flex', alignItems:'center', gap:5}}><Avatar name={t.assignee} color={T.coral} size={18}/><span style={{fontSize:11, color:T.sb}}>{t.assignee}</span></div> : <span style={{color:T.dm, fontSize:11}}>—</span>}</div>
      <span style={{fontSize:11, color:T.sb, fontFamily:MN}}>{t.dueDate || '—'}</span>
    </div>)}
  </div>;
}

// ═══ FLOW VIEW ═════════════════════════════════════════════════════════════
function FlowView({tasks}) {
  return <div style={{animation:'fadeIn .3s', padding:20}}>
    <div style={{display:'flex', flexDirection:'column', gap:4, alignItems:'center'}}>
      {tasks.map((t, i) => <div key={t.id} style={{display:'flex', flexDirection:'column', alignItems:'center', gap:4}}>
        <div style={{
          padding:'12px 20px', borderRadius:9, minWidth:260,
          background: t.completed ? `${T.green}15` : T.card,
          border:`1.5px solid ${t.completed ? T.green : t.priority==='high' ? T.red : T.bd}`,
          display:'flex', alignItems:'center', gap:9,
        }}>
          {t.completed ? <CheckCircle2 size={15} color={T.green}/> : <Circle size={15} color={T.dm}/>}
          <span style={{flex:1, fontSize:12, fontWeight:500, color:t.completed?T.dm:T.tx}}>{t.title}</span>
        </div>
        {i < tasks.length-1 && <svg width="20" height="24"><line x1="10" y1="0" x2="10" y2="20" stroke={T.bd} strokeWidth="2"/><polygon points="6,16 10,22 14,16" fill={T.bd}/></svg>}
      </div>)}
    </div>
  </div>;
}

// ═══ TASK DETAIL DRAWER ════════════════════════════════════════════════════
function TaskDrawer({task, onClose, onUpdate}) {
  const[local, setLocal] = useState(task);
  useEffect(() => setLocal(task), [task.id]);
  const save = (patch) => { const u = {...local, ...patch}; setLocal(u); onUpdate(u); };

  return <div style={{
    position:'fixed', top:0, right:0, bottom:0, width:380, background:T.bg2,
    borderLeft:`1px solid ${T.bd}`, boxShadow:'-20px 0 60px rgba(0,0,0,0.5)',
    display:'flex', flexDirection:'column', animation:'slideRight .25s', zIndex:50,
  }}>
    <div style={{padding:'14px 18px', borderBottom:`1px solid ${T.bd}`, display:'flex', alignItems:'center', gap:10}}>
      <button onClick={()=>save({completed:!local.completed})}>
        {local.completed ? <CheckCircle2 size={18} color={T.green}/> : <Circle size={18} color={T.dm}/>}
      </button>
      <div style={{flex:1, fontSize:14, fontWeight:700, color:T.tx}}>Task Details</div>
      <IconBtn icon={X} onClick={onClose} size={16}/>
    </div>
    <div style={{flex:1, overflow:'auto', padding:'18px'}}>
      <input
        value={local.title}
        onChange={e=>save({title:e.target.value})}
        style={{
          width:'100%', background:'transparent', border:'none', outline:'none',
          color:T.tx, fontSize:17, fontWeight:600, marginBottom:16, fontFamily:FT,
        }}
      />
      <div style={{display:'flex', flexDirection:'column', gap:12}}>
        <div>
          <label style={{fontSize:10, color:T.sb, fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:5}}>Priority</label>
          <div style={{display:'flex', gap:5}}>
            {['high','medium','low'].map(p => <button key={p} onClick={()=>save({priority:p})} style={{
              padding:'5px 11px', borderRadius:6, fontSize:11, fontWeight:600,
              background: local.priority===p ? (p==='high'?T.red:p==='medium'?T.yellow:T.sb)+'20' : T.card,
              color: local.priority===p ? (p==='high'?T.red:p==='medium'?T.yellow:T.sb) : T.sb,
              border:`1px solid ${local.priority===p ? (p==='high'?T.red:p==='medium'?T.yellow:T.sb) : T.bd}`,
              textTransform:'capitalize',
            }}>{p}</button>)}
          </div>
        </div>
        <div>
          <label style={{fontSize:10, color:T.sb, fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:5}}>Due Date</label>
          <input
            type="date" value={local.dueDate || ''}
            onChange={e=>save({dueDate:e.target.value || null})}
            style={{
              width:'100%', padding:'7px 10px', borderRadius:6,
              background:T.card, border:`1px solid ${T.bd}`, color:T.tx, fontSize:12,
              outline:'none', fontFamily:MN,
            }}
          />
        </div>
        <div>
          <label style={{fontSize:10, color:T.sb, fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:5}}>Assignee</label>
          <input
            value={local.assignee || ''}
            onChange={e=>save({assignee:e.target.value || null})}
            placeholder="Unassigned"
            style={{width:'100%', padding:'7px 10px', borderRadius:6, background:T.card, border:`1px solid ${T.bd}`, color:T.tx, fontSize:12, outline:'none'}}
          />
        </div>
        <div>
          <label style={{fontSize:10, color:T.sb, fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:5}}>Notes</label>
          <textarea
            value={local.notes || ''}
            onChange={e=>save({notes:e.target.value})}
            placeholder="Add notes..."
            style={{width:'100%', padding:9, borderRadius:6, background:T.card, border:`1px solid ${T.bd}`, color:T.tx, fontSize:12, outline:'none', resize:'vertical', minHeight:80, fontFamily:FT, lineHeight:1.5}}
          />
        </div>
        {local.subtasks?.length>0 && <div>
          <label style={{fontSize:10, color:T.sb, fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:5}}>Subtasks</label>
          <div style={{display:'flex', flexDirection:'column', gap:4}}>
            {local.subtasks.map(st => <div key={st.id} style={{display:'flex', alignItems:'center', gap:7, padding:'5px 9px', background:T.card, borderRadius:6, border:`1px solid ${T.bd}`}}>
              <button onClick={()=>{
                const sts = local.subtasks.map(s => s.id===st.id ? {...s, completed:!s.completed} : s);
                save({subtasks:sts});
              }}>
                {st.completed ? <CheckCircle2 size={13} color={T.green}/> : <Circle size={13} color={T.dm}/>}
              </button>
              <span style={{flex:1, fontSize:12, color:st.completed?T.dm:T.tx, textDecoration:st.completed?'line-through':'none'}}>{st.title}</span>
            </div>)}
          </div>
        </div>}
      </div>
    </div>
  </div>;
}

// ═══ AI AGENTS VIEW ════════════════════════════════════════════════════════
function AgentsView() {
  const[active, setActive] = useState(null);
  const[msgs, setMsgs] = useState([]);
  const[input, setInput] = useState('');
  const[loading, setLoading] = useState(false);
  const ref = useRef(null);

  useEffect(() => { ref.current?.scrollTo(0, ref.current.scrollHeight); }, [msgs]);

  const send = async () => {
    if (!input.trim() || loading || !active) return;
    const u = {role:'user', content:input, ts:Date.now()};
    const nm = [...msgs, u];
    setMsgs(nm); setInput(''); setLoading(true);
    try {
      // Route to the specialist agent on the Worker — carries memory, tools, planning, grading
      const d = await callAgent(active.name, u.content);
      const reply = d.content?.map(b => b.text || '').join('') || '';
      setMsgs([...nm, {
        role:'assistant', content:reply, ts:Date.now(),
        meta: { grade: d.grade, model: d.model, classification: d.classification, iterations: d.iterations, latency_ms: d.latency_ms },
      }]);
    } catch (e) { setMsgs([...nm, {role:'assistant', content:'Error: '+e.message, ts:Date.now()}]); }
    setLoading(false);
  };

  return <div style={{display:'flex', height:'100vh', animation:'fadeIn .3s'}}>
    <div style={{width:280, borderRight:`1px solid ${T.bd}`, background:T.bg2, padding:'20px 14px', overflow:'auto'}}>
      <div style={{fontSize:11, color:T.sb, fontWeight:700, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:12}}>AI Agents</div>
      {AI_AGENTS.map(a => <div key={a.id} onClick={()=>{setActive(a); setMsgs([])}} style={{
        padding:11, borderRadius:9, marginBottom:5, cursor:'pointer',
        background: active?.id===a.id ? T.cardH : T.card,
        border:`1.5px solid ${active?.id===a.id ? a.color : T.bd}`,
        transition:'all .15s',
      }}>
        <div style={{display:'flex', alignItems:'center', gap:9, marginBottom:5}}>
          <div style={{
            width:34, height:34, borderRadius:9, background:a.color,
            display:'flex', alignItems:'center', justifyContent:'center', fontSize:17,
          }}>{a.icon}</div>
          <div style={{flex:1}}>
            <div style={{fontSize:13, fontWeight:700, color:T.tx}}>{a.name}</div>
            <div style={{fontSize:9, color:T.dm, fontFamily:MN}}>opus-4-7</div>
          </div>
        </div>
        <div style={{fontSize:10, color:T.sb, lineHeight:1.4}}>{a.desc}</div>
      </div>)}
    </div>
    <div style={{flex:1, display:'flex', flexDirection:'column', background:T.bg}}>
      {active ? <>
        <div style={{padding:'14px 20px', borderBottom:`1px solid ${T.bd}`, display:'flex', alignItems:'center', gap:10}}>
          <div style={{
            width:30, height:30, borderRadius:7, background:active.color,
            display:'flex', alignItems:'center', justifyContent:'center', fontSize:15,
          }}>{active.icon}</div>
          <div>
            <div style={{fontSize:14, fontWeight:700, color:T.tx}}>{active.name}</div>
            <div style={{fontSize:10, color:T.dm, fontFamily:MN}}>Powered by Claude Opus 4.7</div>
          </div>
        </div>
        <div ref={ref} style={{flex:1, overflow:'auto', padding:20, display:'flex', flexDirection:'column', gap:11}}>
          {msgs.length===0 && <div style={{textAlign:'center', color:T.dm, marginTop:60}}>
            <div style={{fontSize:36, marginBottom:12}}>{active.icon}</div>
            <div style={{fontSize:14, fontWeight:600, color:T.sb}}>Start a conversation with {active.name}</div>
            <div style={{fontSize:11, marginTop:5}}>{active.desc}</div>
          </div>}
          {msgs.map((m, i) => <div key={i} style={{alignSelf:m.role==='user'?'flex-end':'flex-start', maxWidth:'75%'}}>
            <div style={{
              padding:'10px 14px', borderRadius:11,
              background: m.role==='user' ? T.coral : T.card,
              color:'#fff', border: m.role==='user'?'none':`1px solid ${T.bd}`,
            }}>
              <div style={{fontSize:13, lineHeight:1.5, whiteSpace:'pre-wrap', color:m.role==='user'?'#fff':T.tx}}>{m.content}</div>
            </div>
            {m.meta && <div style={{display:'flex',gap:8,marginTop:4,paddingLeft:4,fontFamily:MN,fontSize:9,color:T.sb,flexWrap:'wrap'}}>
              <span style={{color:m.meta.grade>=80?T.green:m.meta.grade>=50?T.yellow:T.red,fontWeight:700}}>{m.meta.grade}</span>
              <span>·</span><span>{m.meta.model?.split('/').pop()}</span>
              <span>·</span><span>{m.meta.classification}</span>
              {m.meta.iterations>0 && <><span>·</span><span>{m.meta.iterations} tool call{m.meta.iterations>1?'s':''}</span></>}
              <span>·</span><span>{m.meta.latency_ms}ms</span>
            </div>}
          </div>)}
          {loading && <div style={{alignSelf:'flex-start', padding:'10px 14px', borderRadius:11, background:T.card, border:`1px solid ${T.bd}`}}>
            <Loader2 size={14} color={active.color} style={{animation:'spin 1s linear infinite'}}/>
          </div>}
        </div>
        <div style={{padding:'12px 20px', borderTop:`1px solid ${T.bd}`, display:'flex', gap:8}}>
          <input
            value={input} onChange={e=>setInput(e.target.value)}
            onKeyDown={e=>e.key==='Enter'&&!e.shiftKey&&send()}
            placeholder={`Message ${active.name}...`}
            style={{flex:1, padding:'9px 14px', borderRadius:9, background:T.card, border:`1px solid ${T.bd}`, color:T.tx, fontSize:13, outline:'none'}}
          />
          <Btn primary onClick={send} disabled={loading||!input.trim()}><Send size={13}/></Btn>
        </div>
      </> : <div style={{display:'flex', alignItems:'center', justifyContent:'center', flex:1, color:T.dm, flexDirection:'column', gap:10}}>
        <Bot size={40} style={{opacity:0.3}}/>
        <div style={{fontSize:13}}>Select an AI agent to begin</div>
      </div>}
    </div>
  </div>;
}

// ═══ INBOX VIEW ════════════════════════════════════════════════════════════
function InboxView() {
  const notifs = [
    {id:'n1', type:'mention', from:'A. Chen', msg:'mentioned you on "RBAC middleware audit"', ts:Date.now()-300000, read:false},
    {id:'n2', type:'assign', from:'System', msg:'assigned you "Threat intelligence feed integration"', ts:Date.now()-3600000, read:false},
    {id:'n3', type:'comment', from:'M. Torres', msg:'commented on "SOC dashboard v3 wireframes"', ts:Date.now()-7200000, read:true},
    {id:'n4', type:'ai', from:'TSK-Auto', msg:'generated 5 tasks for your new project', ts:Date.now()-86400000, read:false},
  ];
  return <div style={{animation:'fadeIn .3s', padding:'20px 24px', maxWidth:800, margin:'0 auto'}}>
    <div style={{fontSize:20, fontWeight:800, color:T.tx, marginBottom:16}}>Inbox</div>
    <div style={{display:'flex', flexDirection:'column', gap:6}}>
      {notifs.map(n => <div key={n.id} style={{
        display:'flex', gap:12, padding:14, borderRadius:9,
        background:T.card, border:`1px solid ${T.bd}`,
        opacity: n.read ? 0.6 : 1,
      }}>
        <Avatar name={n.from} color={n.type==='ai'?T.purple:T.coral} size={32}/>
        <div style={{flex:1}}>
          <div style={{fontSize:12, color:T.tx}}><span style={{fontWeight:700}}>{n.from}</span> {n.msg}</div>
          <div style={{fontSize:10, color:T.dm, marginTop:3, fontFamily:MN}}>{new Date(n.ts).toLocaleString()}</div>
        </div>
        {!n.read && <div style={{width:7, height:7, borderRadius:'50%', background:T.coral, marginTop:5, flexShrink:0}}/>}
      </div>)}
    </div>
  </div>;
}

// ═══ TEMPLATES VIEW ════════════════════════════════════════════════════════
function TemplatesView() {
  return <div style={{animation:'fadeIn .3s', padding:'20px 24px', maxWidth:1000, margin:'0 auto'}}>
    <div style={{fontSize:20, fontWeight:800, color:T.tx, marginBottom:4}}>Templates</div>
    <div style={{fontSize:13, color:T.sb, marginBottom:20}}>Start from a pre-built workflow</div>
    <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(240px, 1fr))', gap:12}}>
      {TEMPLATES.map(tp => <div key={tp.id} style={{
        padding:16, borderRadius:11, background:T.card, border:`1px solid ${T.bd}`,
        cursor:'pointer', transition:'all .15s',
      }} onMouseEnter={e=>{e.currentTarget.style.borderColor=T.coral; e.currentTarget.style.transform='translateY(-2px)'}} onMouseLeave={e=>{e.currentTarget.style.borderColor=T.bd; e.currentTarget.style.transform='none'}}>
        <div style={{fontSize:30, marginBottom:9}}>{tp.icon}</div>
        <div style={{fontSize:13, fontWeight:700, color:T.tx, marginBottom:4}}>{tp.name}</div>
        <div style={{fontSize:11, color:T.sb, lineHeight:1.4}}>{tp.desc}</div>
      </div>)}
    </div>
  </div>;
}

// ═══ MAIN APP ══════════════════════════════════════════════════════════════
export default function GEMTaskadeClone() {
  const[workspaces, setWorkspaces] = useState(SEED_WORKSPACES);
  const[tasksById, setTasksById] = useState(SEED_TASKS);
  const[activeWs, setActiveWs] = useState(SEED_WORKSPACES[0]);
  const[activeView, setActiveView] = useState('home');
  const[activeProject, setActiveProject] = useState(null);
  const[loaded, setLoaded] = useState(false);

  // Load persisted
  useEffect(() => {
    (async () => {
      const w = await DB.g('taskade:workspaces');
      const t = await DB.g('taskade:tasks');
      if (w) { setWorkspaces(w); setActiveWs(w[0]); }
      if (t) setTasksById(t);
      setLoaded(true);
    })();
  }, []);

  // Persist on change
  useEffect(() => { if (loaded) DB.s('taskade:workspaces', workspaces); }, [workspaces, loaded]);
  useEffect(() => { if (loaded) DB.s('taskade:tasks', tasksById); }, [tasksById, loaded]);
  // Expose the current workspace id for callAgent → Worker header mapping.
  useEffect(() => { window.__gem = { ...(window.__gem || {}), activeWorkspaceId: activeWs?.id || null }; }, [activeWs]);

  // ─── Cross-tab sync via BroadcastChannel (set up by storage adapter) ───
  // Another tab wrote to kv — refetch the affected key so this tab stays current.
  useEffect(() => {
    if (!loaded || !window.storage?.onKeyChange) return;
    return window.storage.onKeyChange(async (key) => {
      if (key === 'taskade:workspaces') {
        const w = await DB.g('taskade:workspaces');
        if (w) { setWorkspaces(w); setActiveWs(prev => w.find(x => x.id === prev?.id) || w[0]); }
      } else if (key === 'taskade:tasks') {
        const t = await DB.g('taskade:tasks');
        if (t) setTasksById(t);
      }
    });
  }, [loaded]);

  // ─── Supabase Realtime subscriptions ───
  // Current SPA state uses local uid() ids and persists through the kv table,
  // not relational projects/tasks. These subscriptions are therefore active
  // only for installations that have migrated the SPA onto relational IDs
  // (future Phase 3). Until then, task/project events arrive but no-op
  // because row.project_id won't match any SPA project.
  const [recentGrades, setRecentGrades] = useState([]);
  // Normalize a Postgres row to the camelCase shape App.jsx task UI expects.
  const toUiTask = (row) => row && ({
    ...row,
    dueDate: row.due_date ?? row.dueDate ?? null,
    subtasks: row.subtasks ?? [],
    tags: row.tags ?? [],
  });
  useEffect(() => {
    const sb = window.__gem?.supabase;
    if (!sb || !loaded) return;
    const unsubs = [
      subscribeTable(sb, 'tasks', '', (payload) => {
        // DELETE payloads often carry only `old` with the primary key.
        if (payload.eventType === 'DELETE') {
          const old = payload.old || {};
          setTasksById(prev => {
            const next = { ...prev };
            for (const [pid, list] of Object.entries(prev)) {
              if (!old.project_id || old.project_id === pid) {
                next[pid] = list.filter(t => t.id !== old.id);
              }
            }
            return next;
          });
          return;
        }
        const row = toUiTask(payload.new);
        if (!row?.project_id) return;
        setTasksById(prev => {
          const list = prev[row.project_id] || [];
          const next = list.filter(t => t.id !== row.id);
          next.push(row);
          return { ...prev, [row.project_id]: next };
        });
      }),
      // Projects — also only effective in relational mode (Phase 3).
      subscribeTable(sb, 'projects', '', (payload) => {
        if (!payload.new) return;
        setWorkspaces(prev => prev.map(w => w.id === payload.new.workspace_id
          ? { ...w, projects: [payload.new, ...w.projects.filter(p => p.id !== payload.new.id)] }
          : w));
      }),
      // Agent grades — merge into state so initial query race doesn't drop
      // a realtime INSERT that landed first (Sourcery #15).
      subscribeTable(sb, 'agent_grades', '', (payload) => {
        if (payload.eventType !== 'INSERT') return;
        setRecentGrades(prev => {
          if (prev.some(g => g.id === payload.new.id)) return prev;
          return [payload.new, ...prev].slice(0, 20);
        });
      }),
    ];
    // Seed the grade tile. Merge with any realtime rows already received.
    sb.from('agent_grades').select('id,agent_id,score,model_used,latency_ms,created_at')
      .order('created_at', { ascending: false }).limit(20)
      .then(({ data, error }) => {
        if (error || !data) return;
        setRecentGrades(prev => {
          const seen = new Set(prev.map(g => g.id).filter(Boolean));
          const merged = [...prev, ...data.filter(g => !seen.has(g.id))];
          return merged.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 20);
        });
      });
    return () => unsubs.forEach(u => u && u());
  }, [loaded]);
  window.__gem_recentGrades = recentGrades; // dev-tools inspection

  const setProjectTasks = (projectId, tasks) => {
    setTasksById(prev => ({...prev, [projectId]: tasks}));
  };

  const createProject = (wsId) => {
    const name = prompt('Project name:');
    if (!name) return;
    const newProject = {
      id: uid(), name, emoji:'📝', color:T.purple, cover:'purple',
      favorite:false, members:1, lastActive:Date.now(),
    };
    setWorkspaces(prev => prev.map(w => w.id===(wsId||activeWs.id) ? {...w, projects:[newProject, ...w.projects]} : w));
    setTasksById(prev => ({...prev, [newProject.id]: []}));
  };

  const handleAIGenerate = async (spec) => {
    const newProject = {
      id: uid(), name:spec.name, emoji:spec.emoji||'✨', color:T.purple, cover:'purple',
      favorite:false, members:1, lastActive:Date.now(),
    };
    const tasks = (spec.tasks || []).map(t => ({
      id:uid(), title:t.title, completed:false, priority:t.priority||'medium',
      assignee:null, dueDate:null, tags:t.tags||[], notes:'', subtasks:[],
    }));
    setWorkspaces(prev => prev.map(w => w.id===activeWs.id ? {...w, projects:[newProject, ...w.projects]} : w));
    setTasksById(prev => ({...prev, [newProject.id]: tasks}));
    setActiveProject(newProject);
    setActiveView('project');
  };

  if (!loaded) return <div style={{width:'100vw', height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:T.bg, fontFamily:FT}}>
    <style>{CSS}</style>
    <div style={{display:'flex', flexDirection:'column', alignItems:'center', gap:12}}>
      <div style={{width:42, height:42, borderRadius:9, background:`linear-gradient(135deg, ${T.coral}, ${T.purple})`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:22}}>🔺</div>
      <Loader2 size={18} color={T.coral} style={{animation:'spin 1s linear infinite'}}/>
    </div>
  </div>;

  const currentProjects = activeWs?.projects || [];
  const currentTasks = activeProject ? (tasksById[activeProject.id] || []) : [];

  return <div style={{display:'flex', height:'100vh', width:'100vw', background:T.bg, color:T.tx, fontFamily:FT, overflow:'hidden'}}>
    <style>{CSS}</style>
    <Sidebar
      workspaces={workspaces}
      activeWs={activeWs}
      setActiveWs={setActiveWs}
      activeView={activeView}
      setActiveView={setActiveView}
      activeProject={activeProject}
      setActiveProject={setActiveProject}
      onCreateProject={createProject}
    />
    <div style={{flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0}}>
      {activeView==='home' && <HomeView
        workspace={activeWs}
        projects={currentProjects}
        onOpenProject={p => {setActiveProject(p); setActiveView('project')}}
        onCreateProject={createProject}
        onAIGenerate={handleAIGenerate}
        recentGrades={recentGrades}
      />}
      {activeView==='project' && activeProject && <ProjectView
        project={activeProject}
        tasks={currentTasks}
        setTasks={tasks => setProjectTasks(activeProject.id, tasks)}
        onBack={() => setActiveView('home')}
      />}
      {activeView==='inbox' && <InboxView/>}
      {activeView==='agents' && <AgentsView/>}
      {activeView==='templates' && <TemplatesView/>}
    </div>
  </div>;
}
