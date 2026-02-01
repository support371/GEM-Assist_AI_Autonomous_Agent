import express from "express";
import bodyParser from "body-parser";
import { runAgent, resumeUnfinishedGoals, getAvailableTools } from "./engine";
import { loadMemory, clearMemory, getMemoryStats, getUnfinishedGoals } from "./memory";
import { AgentState } from "./types";

const app = express();
app.use(bodyParser.json());

const activeAgents: Map<string, AgentState> = new Map();
const agentClients: Map<string, express.Response[]> = new Map();

function broadcastAgentUpdate(agentId: string, state: AgentState) {
  const clients = agentClients.get(agentId) || [];
  clients.forEach((res) => {
    try {
      res.write(`data: ${JSON.stringify(state)}\n\n`);
    } catch (e) {
      console.error("Error broadcasting to client:", e);
    }
  });
  activeAgents.set(agentId, state);
}

app.post("/agent", async (req, res) => {
  const { goal, autonomous = false, maxSteps = 50 } = req.body;
  if (!goal) return res.status(400).json({ error: "Goal required" });

  try {
    const result = await runAgent(
      goal,
      { autonomousMode: autonomous, maxSteps },
      (state) => broadcastAgentUpdate(state.id, state)
    );
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/agent/stream/:id", (req, res) => {
  const { id } = req.params;
  
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  
  const clients = agentClients.get(id) || [];
  clients.push(res);
  agentClients.set(id, clients);
  
  const currentState = activeAgents.get(id);
  if (currentState) {
    res.write(`data: ${JSON.stringify(currentState)}\n\n`);
  }
  
  req.on("close", () => {
    const updatedClients = (agentClients.get(id) || []).filter((c) => c !== res);
    agentClients.set(id, updatedClients);
  });
});

app.get("/agent/status/:id", (req, res) => {
  const { id } = req.params;
  const state = activeAgents.get(id);
  if (!state) {
    return res.status(404).json({ error: "Agent not found" });
  }
  res.json(state);
});

app.get("/agent/memory", (req, res) => {
  const memory = loadMemory();
  res.json(memory);
});

app.get("/agent/memory/stats", (req, res) => {
  const stats = getMemoryStats();
  res.json(stats);
});

app.delete("/agent/memory", (req, res) => {
  clearMemory();
  res.json({ success: true, message: "Memory cleared" });
});

app.get("/agent/tools", (req, res) => {
  const tools = getAvailableTools();
  res.json(tools);
});

app.get("/agent/unfinished", (req, res) => {
  const goals = getUnfinishedGoals();
  res.json(goals);
});

app.post("/agent/resume", async (req, res) => {
  try {
    const results = await resumeUnfinishedGoals((state) =>
      broadcastAgentUpdate(state.id, state)
    );
    res.json(results);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/", (_, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Autonomous AI Agent</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { 
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
      color: #e2e8f0; 
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      min-height: 100vh;
    }
    .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
    
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 20px 0;
      border-bottom: 1px solid rgba(255,255,255,0.1);
      margin-bottom: 30px;
    }
    .logo {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .logo-icon {
      width: 40px;
      height: 40px;
      background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
    }
    h1 { font-size: 1.5rem; font-weight: 600; }
    
    .status-badge {
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 0.85rem;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .status-idle { background: rgba(100,116,139,0.3); color: #94a3b8; }
    .status-planning { background: rgba(59,130,246,0.3); color: #60a5fa; }
    .status-executing { background: rgba(34,197,94,0.3); color: #4ade80; }
    .status-reflecting { background: rgba(168,85,247,0.3); color: #c084fc; }
    .status-completed { background: rgba(34,197,94,0.3); color: #4ade80; }
    .status-failed { background: rgba(239,68,68,0.3); color: #f87171; }
    .status-paused { background: rgba(234,179,8,0.3); color: #fbbf24; }
    
    .grid { display: grid; grid-template-columns: 1fr 400px; gap: 24px; }
    @media (max-width: 1024px) { .grid { grid-template-columns: 1fr; } }
    
    .card {
      background: rgba(30, 41, 59, 0.8);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 16px;
      padding: 24px;
      backdrop-filter: blur(10px);
    }
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }
    .card-title { font-size: 1.1rem; font-weight: 600; color: #f1f5f9; }
    
    .input-group {
      display: flex;
      gap: 12px;
      margin-bottom: 20px;
    }
    textarea {
      flex: 1;
      background: rgba(15, 23, 42, 0.8);
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 12px;
      padding: 16px;
      color: #e2e8f0;
      font-size: 1rem;
      resize: none;
      min-height: 100px;
      transition: border-color 0.2s;
    }
    textarea:focus { outline: none; border-color: #3b82f6; }
    textarea::placeholder { color: #64748b; }
    
    .btn-group { display: flex; gap: 10px; flex-wrap: wrap; }
    button {
      padding: 12px 24px;
      border-radius: 10px;
      font-size: 0.95rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      border: none;
    }
    .btn-primary {
      background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
      color: white;
    }
    .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(59,130,246,0.4); }
    .btn-secondary {
      background: rgba(100,116,139,0.3);
      color: #e2e8f0;
      border: 1px solid rgba(255,255,255,0.15);
    }
    .btn-secondary:hover { background: rgba(100,116,139,0.5); }
    .btn-danger {
      background: rgba(239,68,68,0.3);
      color: #f87171;
      border: 1px solid rgba(239,68,68,0.3);
    }
    
    .checkbox-group {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 12px;
    }
    .checkbox-group input { width: 18px; height: 18px; }
    .checkbox-group label { color: #94a3b8; font-size: 0.9rem; }
    
    .tasks-list { display: flex; flex-direction: column; gap: 12px; }
    .task-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 16px;
      background: rgba(15, 23, 42, 0.6);
      border-radius: 10px;
      border-left: 3px solid transparent;
      transition: all 0.2s;
    }
    .task-item.pending { border-left-color: #64748b; }
    .task-item.running { border-left-color: #3b82f6; background: rgba(59,130,246,0.1); }
    .task-item.done { border-left-color: #22c55e; }
    .task-item.failed { border-left-color: #ef4444; }
    
    .task-icon {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
    }
    .task-item.pending .task-icon { background: rgba(100,116,139,0.3); }
    .task-item.running .task-icon { background: rgba(59,130,246,0.3); animation: pulse 1.5s infinite; }
    .task-item.done .task-icon { background: rgba(34,197,94,0.3); }
    .task-item.failed .task-icon { background: rgba(239,68,68,0.3); }
    
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    
    .task-content { flex: 1; }
    .task-description { font-size: 0.95rem; color: #e2e8f0; }
    .task-meta { font-size: 0.8rem; color: #64748b; margin-top: 4px; }
    
    .log-container {
      max-height: 500px;
      overflow-y: auto;
      background: rgba(15, 23, 42, 0.6);
      border-radius: 10px;
      padding: 16px;
    }
    .log-entry {
      padding: 8px 0;
      border-bottom: 1px solid rgba(255,255,255,0.05);
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.85rem;
    }
    .log-entry:last-child { border-bottom: none; }
    .log-time { color: #64748b; margin-right: 10px; }
    .log-info { color: #60a5fa; }
    .log-task { color: #4ade80; }
    .log-tool { color: #c084fc; }
    .log-reflection { color: #fbbf24; }
    .log-error { color: #f87171; }
    .log-warning { color: #fb923c; }
    
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
      margin-top: 16px;
    }
    .stat-item {
      background: rgba(15, 23, 42, 0.6);
      padding: 16px;
      border-radius: 10px;
      text-align: center;
    }
    .stat-value { font-size: 1.5rem; font-weight: 600; color: #f1f5f9; }
    .stat-label { font-size: 0.8rem; color: #64748b; margin-top: 4px; }
    
    .tools-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 12px;
    }
    .tool-item {
      padding: 12px;
      background: rgba(15, 23, 42, 0.6);
      border-radius: 8px;
    }
    .tool-name { font-weight: 500; color: #c084fc; }
    .tool-desc { font-size: 0.85rem; color: #94a3b8; margin-top: 4px; }
    
    .empty-state {
      text-align: center;
      padding: 40px;
      color: #64748b;
    }
    .empty-state-icon { font-size: 3rem; margin-bottom: 16px; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="logo">
        <div class="logo-icon">AI</div>
        <h1>Autonomous Multi-Task Agent</h1>
      </div>
      <span id="agentStatus" class="status-badge status-idle">Idle</span>
    </header>
    
    <div class="grid">
      <div class="main-column">
        <div class="card">
          <div class="card-header">
            <span class="card-title">Goal Input</span>
          </div>
          <textarea id="goal" placeholder="Enter your goal... (e.g., 'List all TypeScript files in the project and summarize their purpose')"></textarea>
          <div class="checkbox-group">
            <input type="checkbox" id="autonomous">
            <label for="autonomous">Autonomous Mode (continue on failures)</label>
          </div>
          <div class="btn-group" style="margin-top: 16px;">
            <button class="btn-primary" onclick="runAgent()">Run Agent</button>
            <button class="btn-secondary" onclick="resumeGoals()">Resume Unfinished</button>
            <button class="btn-danger" onclick="clearMemory()">Clear Memory</button>
          </div>
        </div>
        
        <div class="card" style="margin-top: 24px;">
          <div class="card-header">
            <span class="card-title">Tasks</span>
            <span id="taskProgress" style="color: #64748b; font-size: 0.9rem;">0 / 0</span>
          </div>
          <div id="tasksList" class="tasks-list">
            <div class="empty-state">
              <div class="empty-state-icon">📋</div>
              <p>No tasks yet. Enter a goal to start.</p>
            </div>
          </div>
        </div>
      </div>
      
      <div class="sidebar">
        <div class="card">
          <div class="card-header">
            <span class="card-title">Activity Log</span>
          </div>
          <div id="logContainer" class="log-container">
            <div class="empty-state" style="padding: 20px;">
              <p>Waiting for agent activity...</p>
            </div>
          </div>
        </div>
        
        <div class="card" style="margin-top: 24px;">
          <div class="card-header">
            <span class="card-title">Memory Stats</span>
          </div>
          <div id="memoryStats" class="stats-grid">
            <div class="stat-item">
              <div class="stat-value">0</div>
              <div class="stat-label">Total Entries</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">0</div>
              <div class="stat-label">Goals</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">0</div>
              <div class="stat-label">Completed</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">0</div>
              <div class="stat-label">Failed</div>
            </div>
          </div>
        </div>
        
        <div class="card" style="margin-top: 24px;">
          <div class="card-header">
            <span class="card-title">Available Tools</span>
          </div>
          <div id="toolsList" class="tools-list"></div>
        </div>
      </div>
    </div>
  </div>
  
  <script>
    let currentAgentId = null;
    let eventSource = null;
    
    async function loadStats() {
      try {
        const res = await fetch('/agent/memory/stats');
        const stats = await res.json();
        document.getElementById('memoryStats').innerHTML = \`
          <div class="stat-item">
            <div class="stat-value">\${stats.totalEntries}</div>
            <div class="stat-label">Total Entries</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">\${stats.totalGoals}</div>
            <div class="stat-label">Goals</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">\${stats.completedGoals}</div>
            <div class="stat-label">Completed</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">\${stats.failedGoals}</div>
            <div class="stat-label">Failed</div>
          </div>
        \`;
      } catch (e) {
        console.error('Failed to load stats:', e);
      }
    }
    
    async function loadTools() {
      try {
        const res = await fetch('/agent/tools');
        const tools = await res.json();
        document.getElementById('toolsList').innerHTML = tools.map(t => \`
          <div class="tool-item">
            <div class="tool-name">\${t.name}</div>
            <div class="tool-desc">\${t.description}</div>
          </div>
        \`).join('');
      } catch (e) {
        console.error('Failed to load tools:', e);
      }
    }
    
    function updateUI(state) {
      const statusEl = document.getElementById('agentStatus');
      statusEl.textContent = state.status.charAt(0).toUpperCase() + state.status.slice(1);
      statusEl.className = 'status-badge status-' + state.status;
      
      const completed = state.tasks.filter(t => t.status === 'done').length;
      document.getElementById('taskProgress').textContent = \`\${completed} / \${state.tasks.length}\`;
      
      if (state.tasks.length > 0) {
        document.getElementById('tasksList').innerHTML = state.tasks.map(t => \`
          <div class="task-item \${t.status}">
            <div class="task-icon">
              \${t.status === 'done' ? '✓' : t.status === 'failed' ? '✗' : t.status === 'running' ? '●' : '○'}
            </div>
            <div class="task-content">
              <div class="task-description">\${t.description}</div>
              \${t.reflection ? \`<div class="task-meta">Confidence: \${t.reflection.confidence}%</div>\` : ''}
            </div>
          </div>
        \`).join('');
      }
      
      if (state.log.length > 0) {
        document.getElementById('logContainer').innerHTML = state.log.slice(-50).map(l => \`
          <div class="log-entry">
            <span class="log-time">\${new Date(l.timestamp).toLocaleTimeString()}</span>
            <span class="log-\${l.type}">\${l.message}</span>
          </div>
        \`).join('');
        const container = document.getElementById('logContainer');
        container.scrollTop = container.scrollHeight;
      }
    }
    
    function subscribeToAgent(agentId) {
      if (eventSource) eventSource.close();
      eventSource = new EventSource('/agent/stream/' + agentId);
      eventSource.onmessage = (e) => {
        const state = JSON.parse(e.data);
        updateUI(state);
        if (state.status === 'completed' || state.status === 'failed') {
          loadStats();
        }
      };
      eventSource.onerror = () => {
        console.log('Event source connection closed');
      };
    }
    
    async function runAgent() {
      const goal = document.getElementById('goal').value.trim();
      if (!goal) return alert('Please enter a goal');
      
      const autonomous = document.getElementById('autonomous').checked;
      
      document.getElementById('tasksList').innerHTML = '<div class="empty-state"><p>Planning tasks...</p></div>';
      document.getElementById('logContainer').innerHTML = '<div class="empty-state" style="padding: 20px;"><p>Starting agent...</p></div>';
      
      try {
        const res = await fetch('/agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ goal, autonomous })
        });
        const state = await res.json();
        currentAgentId = state.id;
        updateUI(state);
        loadStats();
      } catch (e) {
        console.error('Failed to run agent:', e);
        alert('Failed to run agent: ' + e.message);
      }
    }
    
    async function resumeGoals() {
      try {
        const res = await fetch('/agent/resume', { method: 'POST' });
        const results = await res.json();
        if (results.length === 0) {
          alert('No unfinished goals to resume');
        } else {
          alert(\`Resumed \${results.length} goal(s)\`);
          loadStats();
        }
      } catch (e) {
        console.error('Failed to resume:', e);
      }
    }
    
    async function clearMemory() {
      if (!confirm('Are you sure you want to clear all memory?')) return;
      try {
        await fetch('/agent/memory', { method: 'DELETE' });
        loadStats();
        alert('Memory cleared');
      } catch (e) {
        console.error('Failed to clear memory:', e);
      }
    }
    
    loadStats();
    loadTools();
  </script>
</body>
</html>
`);
});

const PORT = parseInt(process.env.AGENT_PORT || "3000", 10);
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Autonomous Agent running at http://localhost:${PORT}`);
});

export { app };
