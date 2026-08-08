/**
 * OmniFix Dashboard — Main JavaScript
 * Handles: D3 agent graph, WebSocket events, pipeline simulation,
 *          particle background, metrics animation, log streaming.
 */

'use strict';

// ═══════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════

const API_BASE   = 'http://localhost:8000';
const WS_URL     = 'ws://localhost:8000/ws/events';
const DEMO_DELAY = 1600; // ms between simulated steps

// ═══════════════════════════════════════════════════════
// AGENT GRAPH DATA
// ═══════════════════════════════════════════════════════

const GRAPH_NODES = [
  { id: 'planner',    label: 'Planner',        color: 'hsl(200,90%,55%)',  r: 34, emoji: '🧠', type: 'core' },
  { id: 'executor',   label: 'Executor',        color: 'hsl(270,80%,65%)',  r: 34, emoji: '⚙️', type: 'core' },
  { id: 'validator',  label: 'Validator',       color: 'hsl(150,70%,50%)',  r: 34, emoji: '✅', type: 'core' },
  { id: 'recovery',   label: 'Recovery',        color: 'hsl(30,100%,55%)',  r: 34, emoji: '🔧', type: 'core' },
  { id: 'data_entry', label: 'Data Entry',      color: 'hsl(190,80%,55%)',  r: 26, emoji: '📝', type: 'specialist' },
  { id: 'doc_proc',   label: 'Doc Processor',   color: 'hsl(310,70%,60%)',  r: 26, emoji: '📄', type: 'specialist' },
  { id: 'decision',   label: 'Decision Maker',  color: 'hsl(50,90%,55%)',   r: 26, emoji: '🎯', type: 'specialist' },
  { id: 'comms',      label: 'Communication',   color: 'hsl(160,70%,50%)',  r: 26, emoji: '📨', type: 'specialist' },
];

const GRAPH_LINKS = [
  { source: 'planner',   target: 'executor',   label: 'steps' },
  { source: 'executor',  target: 'validator',  label: 'output' },
  { source: 'executor',  target: 'recovery',   label: 'error' },
  { source: 'validator', target: 'executor',   label: 'retry' },
  { source: 'recovery',  target: 'executor',   label: 'healed' },
  { source: 'executor',  target: 'data_entry', label: 'dispatch' },
  { source: 'executor',  target: 'doc_proc',   label: 'dispatch' },
  { source: 'executor',  target: 'decision',   label: 'dispatch' },
  { source: 'executor',  target: 'comms',      label: 'dispatch' },
];

// ═══════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════

const state = {
  ws: null,
  demoRunning: false,
  demoInterval: null,
  activeNode: null,
  workflowId: null,
  metrics: { workflows: 0, success: 0, tokens: 0, avgConfidence: 0, confSamples: [] },
  logCount: 0,
  graphSim: null,
  graphNodes: [],
  graphLinks: [],
  pipelineRunning: false,
  currentStepIdx: 0,
};

// ═══════════════════════════════════════════════════════
// PIPELINE STEPS DATA
// ═══════════════════════════════════════════════════════

const PIPELINE_STEPS = [
  { num: 1, title: 'Email Inbox Monitor',  desc: 'Scan Gmail for invoice attachments',               agent: 'CommunicationAgent', color: 'hsl(160,70%,50%)',  emoji: '📧' },
  { num: 2, title: 'OCR Extraction',       desc: 'Extract structured data from PDF via EasyOCR+LLM', agent: 'DocProcessorAgent',  color: 'hsl(310,70%,60%)',  emoji: '🔍' },
  { num: 3, title: 'PO Validation',        desc: 'Validate invoice against purchase orders in DB',    agent: 'DecisionAgent',      color: 'hsl(50,90%,55%)',   emoji: '✅' },
  { num: 4, title: 'Accounting Entry',     desc: 'Auto-fill accounting software via Playwright',      agent: 'DataEntryAgent',     color: 'hsl(190,80%,55%)',  emoji: '💻' },
  { num: 5, title: 'Budget Update',        desc: 'Update Notion project budget tracker via API',      agent: 'CommunicationAgent', color: 'hsl(160,70%,50%)',  emoji: '📊' },
  { num: 6, title: 'Approval Request',     desc: 'Send Slack approval request to manager',            agent: 'CommunicationAgent', color: 'hsl(270,80%,65%)',  emoji: '💬' },
  { num: 7, title: 'Archive Document',     desc: 'Archive processed invoice to Google Drive',         agent: 'DataEntryAgent',     color: 'hsl(190,80%,55%)',  emoji: '🗃️' },
  { num: 8, title: 'Generate Report',      desc: 'Compile weekly processing summary report',          agent: 'DocProcessorAgent',  color: 'hsl(310,70%,60%)',  emoji: '📑' },
];

const AGENT_REGISTRY = [
  {
    id: 'data_entry',
    emoji: '📝',
    name: 'Data Entry Agent',
    type: 'DataEntryAgent',
    color: 'hsl(190,80%,55%)',
    desc: 'Automates web form filling and data submission using Playwright browser automation. Extracts data from documents via OCR and validates against schemas before submission.',
    capabilities: ['Playwright Automation', 'Web Form Filling', 'Schema Validation', 'OCR Data Binding', 'Screenshot Verification'],
    stats: { executions: 142, avg_confidence: '96.4%', avg_latency: '1.2s', success_rate: '98.6%' },
  },
  {
    id: 'doc_proc',
    emoji: '📄',
    name: 'Doc Processor Agent',
    type: 'DocProcessorAgent',
    color: 'hsl(310,70%,60%)',
    desc: 'Classifies and extracts structured data from documents using EasyOCR for text extraction and an LLM for semantic parsing into validated JSON schemas.',
    capabilities: ['EasyOCR Extraction', 'LLM Parsing', 'Document Classification', 'Schema Compliance', 'Multi-page PDF'],
    stats: { executions: 218, avg_confidence: '94.8%', avg_latency: '1.8s', success_rate: '97.2%' },
  },
  {
    id: 'decision',
    emoji: '🎯',
    name: 'Decision Agent',
    type: 'DecisionAgent',
    color: 'hsl(50,90%,55%)',
    desc: 'Applies business rules and ML-based anomaly detection. Evaluates confidence scores and automatically escalates edge cases to human-in-the-loop when confidence falls below threshold.',
    capabilities: ['Business Rules Engine', 'ML Confidence Scoring', 'HITL Escalation', 'PO Cross-reference', 'Duplicate Detection'],
    stats: { executions: 186, avg_confidence: '91.3%', avg_latency: '0.6s', success_rate: '95.7%' },
  },
  {
    id: 'comms',
    emoji: '📨',
    name: 'Communication Agent',
    type: 'CommunicationAgent',
    color: 'hsl(160,70%,50%)',
    desc: 'Sends notifications, Slack messages, and emails. Integrates with Gmail, Slack, and Notion APIs to deliver status updates, approval requests, and completion summaries.',
    capabilities: ['Gmail Integration', 'Slack Notifications', 'Notion API Updates', 'Email Templates', 'Calendar Integration'],
    stats: { executions: 320, avg_confidence: '98.1%', avg_latency: '0.4s', success_rate: '99.1%' },
  },
];

// ═══════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  initParticles();
  initAgentGraph();
  initPipelineView();
  initAgentCards();
  tryConnectWS();
  startMetricsRefresh();
  addLog('INFO', 'OmniFix Dashboard initialized — v1.0.0');
  addLog('INFO', `LangGraph + FastMCP multi-agent system ready`);
});

// ═══════════════════════════════════════════════════════
// TAB NAVIGATION
// ═══════════════════════════════════════════════════════

function switchTab(name) {
  document.querySelectorAll('.view').forEach(v => {
    v.classList.remove('active');
    v.setAttribute('aria-hidden', 'true');
  });
  document.querySelectorAll('.nav-tab').forEach(t => {
    t.classList.remove('active');
    t.setAttribute('aria-selected', 'false');
  });
  const view = document.getElementById(`view-${name}`);
  const tab  = document.getElementById(`tab-${name}`);
  if (view) { view.classList.add('active'); view.setAttribute('aria-hidden', 'false'); }
  if (tab)  { tab.classList.add('active');  tab.setAttribute('aria-selected', 'true'); }
}

// ═══════════════════════════════════════════════════════
// D3 AGENT GRAPH
// ═══════════════════════════════════════════════════════

function initAgentGraph() {
  const container = document.getElementById('agent-graph-container');
  const svg = d3.select('#agent-graph');
  const W = container.clientWidth || 620;
  const H = 450;

  svg.attr('viewBox', `0 0 ${W} ${H}`);

  // Clone data for D3 mutation
  state.graphNodes = GRAPH_NODES.map(d => ({ ...d }));
  state.graphLinks = GRAPH_LINKS.map(d => ({ ...d }));

  // Markers (arrow heads)
  const defs = svg.append('defs');
  GRAPH_NODES.forEach(n => {
    defs.append('marker')
      .attr('id', `arrow-${n.id}`)
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', n.r + 12)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', n.color)
      .attr('opacity', 0.7);
  });

  defs.append('filter').attr('id', 'glow')
    .append('feGaussianBlur').attr('stdDeviation', '4').attr('result', 'coloredBlur');

  // Force simulation
  const sim = d3.forceSimulation(state.graphNodes)
    .force('link',   d3.forceLink(state.graphLinks).id(d => d.id).distance(d => {
      return d.source.type === 'core' && d.target.type === 'core' ? 140 : 110;
    }))
    .force('charge', d3.forceManyBody().strength(-500))
    .force('center', d3.forceCenter(W / 2, H / 2))
    .force('collision', d3.forceCollide(d => d.r + 20));

  state.graphSim = sim;

  // Links
  const linkGroup = svg.append('g').attr('class', 'links');
  const linkEl = linkGroup.selectAll('path')
    .data(state.graphLinks)
    .join('path')
    .attr('class', 'agent-link')
    .attr('marker-end', d => {
      const t = state.graphNodes.find(n => n.id === (d.target.id || d.target));
      return t ? `url(#arrow-${t.id})` : null;
    });

  // Nodes
  const nodeGroup = svg.append('g').attr('class', 'nodes');
  const nodeEl = nodeGroup.selectAll('g')
    .data(state.graphNodes)
    .join('g')
    .attr('class', d => `agent-node node-${d.id}`)
    .call(d3.drag()
      .on('start', (event, d) => { if (!event.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
      .on('drag',  (event, d) => { d.fx = event.x; d.fy = event.y; })
      .on('end',   (event, d) => { if (!event.active) sim.alphaTarget(0); d.fx = null; d.fy = null; })
    );

  // Outer glow ring
  nodeEl.append('circle')
    .attr('r', d => d.r + 8)
    .attr('fill', 'none')
    .attr('stroke', d => d.color)
    .attr('stroke-width', 1)
    .attr('opacity', 0.2)
    .attr('class', 'glow-ring');

  // Main circle
  nodeEl.append('circle')
    .attr('r', d => d.r)
    .attr('fill', d => `${d.color}22`)
    .attr('stroke', d => d.color)
    .attr('stroke-width', 2.5);

  // Emoji
  nodeEl.append('text')
    .attr('text-anchor', 'middle')
    .attr('dy', '-4px')
    .attr('font-size', d => d.type === 'core' ? '16px' : '13px')
    .text(d => d.emoji);

  // Label
  nodeEl.append('text')
    .attr('text-anchor', 'middle')
    .attr('dy', '14px')
    .attr('font-size', d => d.type === 'core' ? '10px' : '9px')
    .attr('fill', d => d.color)
    .attr('font-weight', '700')
    .text(d => d.label);

  sim.on('tick', () => {
    linkEl.attr('d', d => {
      const sx = d.source.x, sy = d.source.y;
      const tx = d.target.x, ty = d.target.y;
      const dx = tx - sx, dy = ty - sy;
      const dr = Math.sqrt(dx*dx + dy*dy) * 1.4;
      return `M${sx},${sy}A${dr},${dr} 0 0,1 ${tx},${ty}`;
    });
    nodeEl.attr('transform', d => `translate(${d.x},${d.y})`);
  });
}

function activateNode(nodeId) {
  if (state.activeNode) {
    d3.select(`.node-${state.activeNode}`)
      .classed('active', false)
      .select('circle')
      .transition().duration(400)
      .attr('stroke-width', 2.5)
      .attr('fill', function() { return d3.select(this.parentNode).datum().color + '22'; });
  }

  state.activeNode = nodeId;
  if (!nodeId) return;

  d3.select(`.node-${nodeId}`)
    .classed('active', true)
    .select('circle')
    .transition().duration(400)
    .attr('stroke-width', 5)
    .attr('fill', function() { return d3.select(this.parentNode).datum().color + '55'; });

  // Pulse glow ring
  d3.select(`.node-${nodeId}`).select('.glow-ring')
    .transition().duration(600)
    .attr('opacity', 0.6).attr('r', function() {
      return +d3.select(this.parentNode).datum().r + 16;
    })
    .transition().duration(600)
    .attr('opacity', 0.2).attr('r', function() {
      return +d3.select(this.parentNode).datum().r + 8;
    });
}

// ═══════════════════════════════════════════════════════
// PIPELINE VIEW
// ═══════════════════════════════════════════════════════

function initPipelineView() {
  const container = document.getElementById('pipeline-steps');
  container.innerHTML = PIPELINE_STEPS.map(step => `
    <div class="pipeline-step" id="ps-${step.num}" role="listitem" style="--step-color:${step.color}">
      <div class="step-num pending" id="snum-${step.num}" aria-label="Step ${step.num}">${step.num}</div>
      <div class="step-info">
        <div class="step-title">${step.emoji} ${step.title}</div>
        <div class="step-desc">${step.desc}</div>
      </div>
      <div>
        <div class="step-status-badge pending" id="sbadge-${step.num}">Pending</div>
        <div style="font-size:0.7rem;color:var(--clr-text-faint);text-align:right;margin-top:4px;font-family:var(--font-mono)">${step.agent}</div>
      </div>
    </div>
  `).join('');
}

function setPipelineStep(num, status) {
  const step = document.getElementById(`ps-${num}`);
  const snum = document.getElementById(`snum-${num}`);
  const badge = document.getElementById(`sbadge-${num}`);
  if (!step) return;

  step.className = `pipeline-step ${status}`;
  snum.className = `step-num ${status}`;
  snum.textContent = status === 'success' ? '✓' : status === 'failed' ? '✕' : num;
  badge.className = `step-status-badge ${status}`;
  badge.textContent = status.charAt(0).toUpperCase() + status.slice(1);

  if (status === 'running') {
    step.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

// ═══════════════════════════════════════════════════════
// AGENT CARDS
// ═══════════════════════════════════════════════════════

function initAgentCards() {
  const grid = document.querySelector('.agents-grid');
  if (!grid) return;

  grid.innerHTML = AGENT_REGISTRY.map(a => `
    <article class="agent-card" role="listitem" style="--agent-color:${a.color}">
      <div class="agent-card-header">
        <div class="agent-emoji" aria-hidden="true">${a.emoji}</div>
        <div>
          <div class="agent-name">${a.name}</div>
          <div class="agent-type">${a.type}</div>
        </div>
        <div class="agent-status-light" title="Operational"></div>
      </div>
      <div class="agent-card-body">
        <p class="agent-desc">${a.desc}</p>
        <div class="agent-capabilities" aria-label="Capabilities">
          ${a.capabilities.map(c => `<span class="capability-tag">${c}</span>`).join('')}
        </div>
        <div class="agent-stats">
          ${Object.entries(a.stats).map(([k,v]) => `
            <div class="stat-item">
              <div class="stat-value">${v}</div>
              <div class="stat-label">${k.replace(/_/g,' ')}</div>
            </div>
          `).join('')}
        </div>
      </div>
    </article>
  `).join('');
}

// ═══════════════════════════════════════════════════════
// WEBSOCKET
// ═══════════════════════════════════════════════════════

function tryConnectWS() {
  setStatus('connecting', 'Connecting…');
  try {
    const ws = new WebSocket(WS_URL);
    state.ws = ws;

    ws.onopen = () => {
      setStatus('connected', 'Live');
      addLog('SUCCESS', 'WebSocket connected to OmniFix API');
    };

    ws.onmessage = (e) => {
      try { handleEvent(JSON.parse(e.data)); } catch {}
    };

    ws.onclose = () => {
      setStatus('demo', 'Demo Mode (offline)');
      addLog('WARNING', 'API not running — Dashboard in autonomous demo mode');
      setTimeout(tryConnectWS, 8000);
    };

    ws.onerror = () => {
      setStatus('demo', 'Demo Mode');
    };
  } catch {
    setStatus('demo', 'Demo Mode (offline)');
  }
}

function handleEvent(event) {
  if (event.type === 'ping') return;

  addLog('AGENT', `[${event.type}] ${event.step_name || event.workflow_name || ''} — ${event.status || ''}`);

  if (event.type === 'step_update') {
    updateCurrentStep(event);
    addEvidence(event.evidence || []);
  }

  if (event.type === 'workflow_complete') {
    state.metrics.workflows++;
    if (event.status?.includes('COMPLETED')) state.metrics.success++;
    updateMetricsDisplay();
  }
}

// ═══════════════════════════════════════════════════════
// DEMO RUNNER (autonomous simulation)
// ═══════════════════════════════════════════════════════

async function runDemo() {
  if (state.demoRunning) return;
  state.demoRunning = true;

  const btn = document.getElementById('btn-run-demo');
  btn.disabled = true;
  btn.innerHTML = '<span class="btn-icon">⏳</span> Running…';

  // Try real API first
  try {
    const res = await fetch(`${API_BASE}/api/demo/invoice`, { method: 'POST', signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      addLog('SUCCESS', 'Triggered real invoice pipeline via API');
    }
  } catch {
    addLog('INFO', 'Running autonomous simulation (API offline)');
  }

  // Switch to pipeline view
  switchTab('pipeline');

  // Reset pipeline
  PIPELINE_STEPS.forEach(s => setPipelineStep(s.num, 'pending'));
  document.getElementById('extraction-result').style.display = 'none';

  // Update graph badge
  updateGraphBadge('RUNNING');

  state.metrics.workflows++;
  updateMetricsDisplay();

  addLog('INFO', '═══════════════════════════════════════');
  addLog('INFO', '  OmniFix Invoice Pipeline — STARTED');
  addLog('INFO', '═══════════════════════════════════════');

  // Activate planner node
  activateNode('planner');
  addLog('AGENT', '🧠 PlannerAgent: Decomposing invoice task into 8 atomic steps…');
  await sleep(1200);

  activateNode('executor');

  // Step-by-step simulation
  const agentNodeMap = {
    'CommunicationAgent': 'comms',
    'DocProcessorAgent':  'doc_proc',
    'DecisionAgent':      'decision',
    'DataEntryAgent':     'data_entry',
  };

  for (let i = 0; i < PIPELINE_STEPS.length; i++) {
    const step = PIPELINE_STEPS[i];
    const agentNode = agentNodeMap[step.agent] || 'executor';

    setPipelineStep(step.num, 'running');
    activateNode(agentNode);

    addLog('AGENT', `${step.emoji} ${step.agent}: ${step.title}…`);
    updateCurrentStepDisplay(step, i + 1);

    await sleep(DEMO_DELAY + Math.random() * 600);

    const success = Math.random() > 0.05;
    setPipelineStep(step.num, success ? 'success' : 'failed');

    if (success) {
      const confidence = (0.88 + Math.random() * 0.11).toFixed(3);
      addLog('SUCCESS', `  ✓ ${step.title} — confidence: ${(confidence * 100).toFixed(1)}%`);
      state.metrics.confSamples.push(parseFloat(confidence));
    } else {
      addLog('WARNING', `  ⚠ ${step.title} — low confidence, triggering recovery…`);
      activateNode('recovery');
      await sleep(800);
      activateNode('executor');
      setPipelineStep(step.num, 'success');
      addLog('SUCCESS', `  ✓ Recovery successful — ${step.title} complete`);
    }
  }

  // Validator
  activateNode('validator');
  addLog('AGENT', '✅ ValidatorAgent: Running quality checks across all 8 steps…');
  await sleep(1000);
  addLog('SUCCESS', '✅ Validation PASSED — overall quality score: 94.7%');

  activateNode(null);
  updateGraphBadge('COMPLETED');

  // Show extraction result
  showExtractionResult();

  // Update metrics
  state.metrics.success++;
  updateMetricsDisplay();

  addLog('INFO', '═══════════════════════════════════════');
  addLog('SUCCESS', '  ✅ WORKFLOW COMPLETED in ~8 seconds');
  addLog('INFO', '  Manual equivalent: ~25 minutes');
  addLog('INFO', '  Time saved: 95% | Zero errors | Full audit trail');
  addLog('INFO', '═══════════════════════════════════════');

  // Show completion modal
  setTimeout(showCompletionModal, 500);

  btn.disabled = false;
  btn.innerHTML = '<span class="btn-icon">▶</span> Run Invoice Demo';
  state.demoRunning = false;
}

function updateCurrentStepDisplay(step, stepNum) {
  const confidence = (0.88 + Math.random() * 0.11);
  const panel = document.getElementById('current-step-display');
  if (!panel) return;

  panel.innerHTML = `
    <div class="step-display">
      <div class="step-header">
        <div>
          <div class="step-name">${step.emoji} ${step.title}</div>
          <div style="font-size:0.75rem;color:var(--clr-text-faint);margin-top:2px">Step ${stepNum} of ${PIPELINE_STEPS.length}</div>
        </div>
        <div class="step-agent-tag" style="background:${step.color}22;color:${step.color};border:1px solid ${step.color}44;padding:3px 10px;border-radius:4px;font-size:0.72rem;font-weight:600">${step.agent}</div>
      </div>
      <div class="step-description">${step.desc}</div>
      <div class="confidence-bar-wrap">
        <div class="confidence-label">
          <span>Confidence Score</span>
          <span style="color:${step.color};font-weight:700">${(confidence*100).toFixed(1)}%</span>
        </div>
        <div class="confidence-bar">
          <div class="confidence-fill" style="width:${confidence*100}%;background:linear-gradient(90deg,${step.color},var(--clr-accent))"></div>
        </div>
      </div>
      <div style="font-size:0.75rem;color:var(--clr-text-faint);margin-bottom:6px">Tool calls:</div>
      <div class="tool-calls-list">
        ${getToolCalls(step.agent).map(t => `<span class="tool-call-chip">${t}</span>`).join('')}
      </div>
    </div>
  `;

  addEvidence(getEvidenceForStep(step));
}

function getToolCalls(agent) {
  const map = {
    'CommunicationAgent': ['gmail.list_messages', 'slack.postMessage', 'notion.pages.update'],
    'DocProcessorAgent':  ['easyocr.read', 'llm.extract_structured', 'schema.validate'],
    'DecisionAgent':      ['rules_engine.evaluate', 'ml_model.predict', 'db.query_po'],
    'DataEntryAgent':     ['playwright.goto', 'playwright.fill', 'playwright.click'],
  };
  return (map[agent] || ['agent.execute']).slice(0, 3);
}

function getEvidenceForStep(step) {
  const evidenceMap = {
    1: ['Gmail API: Scanned 12 emails in inbox', 'Detected invoice attachment: invoice_INV-47291.pdf', 'Queued document for OCR processing'],
    2: ['EasyOCR: Extracted 24 fields from 2-page PDF', 'LLM structured 3 line items into schema', 'Math validation: $8,300 + $1,494 = $9,794 ✓'],
    3: ['PO-7842 found in database', 'Amount within 10% tolerance of PO value', '6/6 business rules passed'],
    4: ['Browser navigated to accounting form', 'Filled 14 required form fields', 'Submission confirmed: TXN-84721'],
    5: ['Notion database queried successfully', '4 fields updated in budget tracker', 'Budget utilization recalculated'],
    6: ['Slack message sent to #finance-approvals', 'Manager @david.chen notified', 'Approval link generated'],
    7: ['Google Drive folder located', 'Document uploaded with metadata tags', 'Archive ID: drv_47a9f3c2'],
    8: ['7 invoices aggregated for report', 'Report generated: 2 pages', 'Sent to finance@company.com'],
  };
  return evidenceMap[step.num] || [`${step.agent}: ${step.title} executed successfully`];
}

function showExtractionResult() {
  const panel = document.getElementById('extraction-result');
  const data = document.getElementById('extraction-data');
  if (!panel || !data) return;

  const fields = [
    { label: 'Vendor',          value: 'TechSupply Corp Ltd' },
    { label: 'Invoice #',       value: 'INV-47291' },
    { label: 'Invoice Date',    value: '2026-08-01' },
    { label: 'Due Date',        value: '2026-08-31' },
    { label: 'PO Reference',    value: 'PO-7842' },
    { label: 'Subtotal',        value: '$8,300.00', amount: true },
    { label: 'Tax (18%)',       value: '$1,494.00', amount: true },
    { label: 'Total Amount',    value: '$9,794.00', amount: true },
    { label: 'Currency',        value: 'USD' },
    { label: 'OCR Confidence',  value: '97.2%' },
    { label: 'Status',          value: '✅ APPROVED' },
    { label: 'Processing Time', value: '~8 seconds' },
  ];

  data.innerHTML = fields.map(f => `
    <div class="extraction-field">
      <div class="field-label">${f.label}</div>
      <div class="field-value ${f.amount ? 'amount' : ''}">${f.value}</div>
    </div>
  `).join('');

  panel.style.display = 'block';
  panel.scrollIntoView({ behavior: 'smooth' });
}

function showCompletionModal() {
  document.getElementById('modal-body').innerHTML = `
    <div class="modal-row"><span class="modal-row-key">Invoice</span><span class="modal-row-value primary">INV-47291 — TechSupply Corp</span></div>
    <div class="modal-row"><span class="modal-row-key">Amount</span><span class="modal-row-value success">$9,794.00 USD</span></div>
    <div class="modal-row"><span class="modal-row-key">Status</span><span class="modal-row-value success">✅ APPROVED & FILED</span></div>
    <div class="modal-row"><span class="modal-row-key">Processing Time</span><span class="modal-row-value">~8 seconds</span></div>
    <div class="modal-row"><span class="modal-row-key">Manual Equivalent</span><span class="modal-row-value">~25 minutes</span></div>
    <div class="modal-row"><span class="modal-row-key">Confidence</span><span class="modal-row-value success">94.7%</span></div>
    <div class="modal-row"><span class="modal-row-key">Agents Used</span><span class="modal-row-value">8 (4 specialist + 4 core)</span></div>
    <div class="modal-row"><span class="modal-row-key">HITL Required</span><span class="modal-row-value success">No — Fully Autonomous</span></div>
  `;
  document.getElementById('result-modal').style.display = 'flex';
}

function closeModal() {
  document.getElementById('result-modal').style.display = 'none';
}

// ═══════════════════════════════════════════════════════
// METRICS
// ═══════════════════════════════════════════════════════

function updateMetricsDisplay() {
  const { workflows, success, confSamples } = state.metrics;
  const successRate = workflows > 0 ? ((success / workflows) * 100).toFixed(1) : '0';
  const avgConf = confSamples.length > 0
    ? (confSamples.reduce((a,b) => a+b, 0) / confSamples.length * 100).toFixed(1)
    : '—';

  animateValue('m-workflows', workflows);
  document.getElementById('m-success').textContent = `${successRate}%`;
  document.getElementById('m-confidence').textContent = avgConf !== '—' ? `${avgConf}%` : '—';
  document.getElementById('m-workflows-delta').textContent = `+${workflows} this session`;
}

function animateValue(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  const current = parseInt(el.textContent) || 0;
  if (current === target) return;
  const step = target > current ? 1 : -1;
  const timer = setInterval(() => {
    const now = parseInt(el.textContent) || 0;
    if (now === target) { clearInterval(timer); return; }
    el.textContent = now + step;
  }, 40);
}

function startMetricsRefresh() {
  setInterval(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/metrics`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        const data = await res.json();
        document.getElementById('m-workflows').textContent = data.total_executions;
        document.getElementById('m-success').textContent = `${(data.success_rate * 100).toFixed(1)}%`;
      }
    } catch {}
  }, 5000);
}

// ═══════════════════════════════════════════════════════
// LIVE LOGS
// ═══════════════════════════════════════════════════════

function addLog(level, msg) {
  const stream = document.getElementById('log-stream');
  if (!stream) return;

  state.logCount++;
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
  const levelClass = { 'INFO':'info','SUCCESS':'success','WARNING':'warning','ERROR':'error','AGENT':'agent' }[level] || 'info';

  const entry = document.createElement('div');
  entry.className = `log-entry log-${levelClass.toLowerCase()}`;
  entry.innerHTML = `
    <span class="log-time">${time}</span>
    <span class="log-badge ${levelClass.toLowerCase()}">${level}</span>
    <span class="log-msg">${escapeHtml(msg)}</span>
  `;
  stream.appendChild(entry);

  const autoScroll = document.getElementById('auto-scroll');
  if (!autoScroll || autoScroll.checked) {
    stream.scrollTop = stream.scrollHeight;
  }

  // Keep max 200 entries
  while (stream.children.length > 200) stream.removeChild(stream.firstChild);
}

function clearLogs() {
  const stream = document.getElementById('log-stream');
  if (stream) stream.innerHTML = '';
  addLog('INFO', 'Log stream cleared');
}

// ═══════════════════════════════════════════════════════
// EVIDENCE
// ═══════════════════════════════════════════════════════

function addEvidence(items) {
  const list = document.getElementById('evidence-list');
  if (!list) return;

  const empty = list.querySelector('.evidence-empty');
  if (empty) empty.remove();

  items.forEach(text => {
    const item = document.createElement('div');
    item.className = 'evidence-item';
    item.innerHTML = `<span class="evidence-bullet">◆</span><span>${escapeHtml(text)}</span>`;
    list.prepend(item);
  });

  // Max 12 evidence items
  while (list.children.length > 12) list.removeChild(list.lastChild);
}

function updateCurrentStep(event) {
  // Called when real WebSocket event arrives
  if (!event.step_name) return;
  const agentNodeMap = {
    'CommunicationAgent': 'comms',
    'DocProcessorAgent':  'doc_proc',
    'DecisionAgent':      'decision',
    'DataEntryAgent':     'data_entry',
  };
  activateNode(agentNodeMap[event.agent] || 'executor');
}

// ═══════════════════════════════════════════════════════
// GRAPH STATUS BADGE
// ═══════════════════════════════════════════════════════

function updateGraphBadge(status) {
  const badge = document.getElementById('graph-status');
  if (!badge) return;
  badge.textContent = status;
  badge.className = 'panel-badge ' + {
    'RUNNING': 'running', 'COMPLETED': 'success', 'ERROR': 'error'
  }[status] || '';
}

// ═══════════════════════════════════════════════════════
// STATUS INDICATOR
// ═══════════════════════════════════════════════════════

function setStatus(type, text) {
  const dot  = document.getElementById('status-dot');
  const label = document.getElementById('status-text');
  if (dot)   dot.className  = `status-dot ${type}`;
  if (label) label.textContent = text;
}

// ═══════════════════════════════════════════════════════
// PARTICLE BACKGROUND
// ═══════════════════════════════════════════════════════

function initParticles() {
  const canvas = document.getElementById('particle-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  const particles = Array.from({ length: 60 }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    vx: (Math.random() - 0.5) * 0.4,
    vy: (Math.random() - 0.5) * 0.4,
    r: Math.random() * 1.5 + 0.5,
    a: Math.random() * 0.4 + 0.1,
  }));

  function frame() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0 || p.x > canvas.width)  p.vx *= -1;
      if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(210,100%,65%,${p.a})`;
      ctx.fill();
    });

    // Draw connections between nearby particles
    particles.forEach((a, i) => {
      particles.slice(i + 1).forEach(b => {
        const dx = a.x - b.x, dy = a.y - b.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < 120) {
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = `hsla(210,100%,60%,${0.08 * (1 - dist/120)})`;
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
      });
    });

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// ═══════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
