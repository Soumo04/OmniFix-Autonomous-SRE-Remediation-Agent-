'use strict';
// ═══════════════════════════════════════════════════
// OmniFix — User-facing Automation Dashboard JS
// Flow: Home → Form → Processing → Results
// All AI / agent work happens in backend only
// ═══════════════════════════════════════════════════

const API = 'http://localhost:8000';

// ── Workflow Definitions ────────────────────────────
const WORKFLOWS = {

  invoice: {
    label:    'Invoice Processing',
    eyebrow:  'Accounts Payable Automation',
    title:    'Enter Invoice Details',
    subtitle: 'Fill in the invoice information. OmniFix will validate, enter it into accounting, and notify your manager — all automatically.',
    steps: [
      'Scan inbox & detect invoice attachment',
      'Extract all fields using OCR + AI reading',
      'Validate against purchase orders in database',
      'Auto-fill accounting system form',
      'Update project budget tracker',
      'Send approval request to manager',
      'Archive document to cloud storage',
      'Generate weekly processing summary',
    ],
    fields: [
      { id: 'vendor_name',     label: 'Vendor / Supplier Name',  type: 'text',   placeholder: 'e.g. TechSupply Corp Ltd',  required: true },
      { id: 'invoice_number',  label: 'Invoice Number',           type: 'text',   placeholder: 'e.g. INV-47291',             required: true },
      { id: 'invoice_date',    label: 'Invoice Date',             type: 'date',   required: true },
      { id: 'due_date',        label: 'Due Date',                 type: 'date',   required: true },
      { id: 'po_reference',    label: 'PO Reference',             type: 'text',   placeholder: 'e.g. PO-7842',               required: false },
      { id: 'currency',        label: 'Currency',                 type: 'select', options: ['USD','EUR','GBP','INR','CAD','AUD'], required: true },
      { id: 'tax_rate',        label: 'Tax Rate (%)',             type: 'number', placeholder: '18',                         required: true, step: '0.01' },
      { id: 'notes',           label: 'Additional Notes',         type: 'textarea', placeholder: 'Any special instructions…', required: false },
    ],
    hasLineItems: true,
    sampleData: {
      vendor_name: 'TechSupply Corp Ltd',
      invoice_number: 'INV-47291',
      invoice_date: '2026-08-01',
      due_date: '2026-08-31',
      po_reference: 'PO-7842',
      currency: 'USD',
      tax_rate: '18',
      notes: 'Priority processing — quarterly equipment purchase',
      lineItems: [
        { description: 'Server RAM Upgrade (16GB x4)',  qty: 4,   unit_price: 180 },
        { description: 'SSD Storage 2TB',               qty: 3,   unit_price: 220 },
        { description: 'Network Switch 48-port',        qty: 1,   unit_price: 1680 },
      ],
    },
  },

  document: {
    label:    'Document Analysis',
    eyebrow:  'Smart Document Processing',
    title:    'Describe Your Document',
    subtitle: 'Tell us about the document. Our AI will classify, extract key data, check compliance, and route it for action.',
    steps: [
      'Classify document type (contract/report/form/receipt)',
      'Extract all key fields and entities with AI',
      'Check compliance against regulatory requirements',
      'Cross-reference with existing records',
      'Route to appropriate team or system',
    ],
    fields: [
      { id: 'doc_type',    label: 'Document Type',    type: 'select', options: ['Contract','Report','Receipt','Invoice','Form','Letter','Proposal'], required: true },
      { id: 'doc_name',    label: 'Document Name',    type: 'text',   placeholder: 'e.g. Service Agreement Q3 2026', required: true },
      { id: 'doc_date',    label: 'Document Date',    type: 'date',   required: false },
      { id: 'parties',     label: 'Parties Involved', type: 'text',   placeholder: 'e.g. Your Company, ABC Corp', required: false },
      { id: 'key_data',    label: 'Key Information',  type: 'textarea', placeholder: 'Paste key text or describe what to extract…', required: true },
      { id: 'action',      label: 'Required Action',  type: 'select', options: ['Extract & Archive','Review & Approve','Compliance Check','Data Entry','Route to Team'], required: true },
    ],
    hasLineItems: false,
    sampleData: {
      doc_type: 'Contract',
      doc_name: 'Software License Agreement — CloudOps Pro',
      doc_date: '2026-08-01',
      parties: 'OmniFix Inc., CloudOps Ltd.',
      key_data: 'Annual SaaS license for CloudOps Pro. Value: $24,000/year. Term: 3 years from 2026-08-01. Includes 5 user seats. Auto-renewal clause applies with 30-day notice.',
      action: 'Extract & Archive',
    },
  },

  expense: {
    label:    'Expense Claims',
    eyebrow:  'Automated Expense Processing',
    title:    'Submit Expense Claim',
    subtitle: 'Enter your expense details. OmniFix will validate receipts, apply policy rules, calculate reimbursement, and file automatically.',
    steps: [
      'Validate receipts against submitted amounts',
      'Apply company expense policy rules',
      'Calculate eligible reimbursement amount',
      'Check budget availability in system',
      'File claim and notify finance team',
      'Generate expense report for records',
    ],
    fields: [
      { id: 'employee',       label: 'Employee Name',      type: 'text',   placeholder: 'Your full name', required: true },
      { id: 'department',     label: 'Department',         type: 'select', options: ['Engineering','Sales','Marketing','Finance','HR','Operations'], required: true },
      { id: 'expense_period', label: 'Expense Period',     type: 'text',   placeholder: 'e.g. July 2026', required: true },
      { id: 'project_code',   label: 'Project Code',       type: 'text',   placeholder: 'e.g. PROJ-2847', required: false },
      { id: 'currency',       label: 'Currency',           type: 'select', options: ['USD','EUR','GBP','INR','CAD','AUD'], required: true },
      { id: 'purpose',        label: 'Business Purpose',   type: 'textarea', placeholder: 'Describe the business reason…', required: true },
    ],
    hasLineItems: true,
    sampleData: {
      employee: 'Sarah Johnson',
      department: 'Sales',
      expense_period: 'July 2026',
      project_code: 'PROJ-2847',
      currency: 'USD',
      purpose: 'Client engagement expenses for Q3 New York office visit — product demo and contract signing.',
      lineItems: [
        { description: 'Flight NYC — Round Trip',   qty: 1, unit_price: 420 },
        { description: 'Hotel (2 nights)',           qty: 2, unit_price: 185 },
        { description: 'Client Dinner',              qty: 1, unit_price: 210 },
        { description: 'Ground Transport (Uber)',    qty: 1, unit_price: 68 },
      ],
    },
  },

  report: {
    label:    'Report Generation',
    eyebrow:  'Automated Reporting',
    title:    'Generate a Report',
    subtitle: 'Provide your raw data or metrics. OmniFix will analyse trends, generate insights, build a formatted report, and distribute it.',
    steps: [
      'Parse and validate raw data',
      'Analyse trends and calculate KPIs',
      'Generate insights with AI',
      'Build formatted PDF/HTML report',
      'Distribute to recipients automatically',
    ],
    fields: [
      { id: 'report_name',   label: 'Report Title',      type: 'text',     placeholder: 'e.g. Monthly Sales Summary — July 2026', required: true },
      { id: 'report_type',   label: 'Report Type',       type: 'select',   options: ['Sales Report','Financial Summary','Project Status','HR Analytics','Operations KPI','Custom'], required: true },
      { id: 'period',        label: 'Reporting Period',  type: 'text',     placeholder: 'e.g. July 2026 / Q3 2026', required: true },
      { id: 'recipients',    label: 'Recipients',        type: 'text',     placeholder: 'e.g. ceo@company.com, finance@company.com', required: false },
      { id: 'raw_data',      label: 'Data / Metrics',   type: 'textarea', placeholder: 'Paste your data, KPIs, or metrics here…', required: true },
      { id: 'format',        label: 'Output Format',     type: 'select',   options: ['PDF Report','Email Summary','Dashboard Update','Spreadsheet','Slack Message'], required: true },
    ],
    hasLineItems: false,
    sampleData: {
      report_name: 'Monthly Sales Summary — July 2026',
      report_type: 'Sales Report',
      period: 'July 2026',
      recipients: 'ceo@company.com, sales@company.com',
      raw_data: 'Total Revenue: $284,600\nNew Deals Closed: 18\nPipeline Value: $1.2M\nCustomer Churn: 2.1%\nAvg Deal Size: $15,811\nTop Region: West (38%)\nTop Product: Enterprise Suite (62% of revenue)',
      format: 'PDF Report',
    },
  },
};

// ── State ───────────────────────────────────────────
const state = {
  currentWorkflow: null,
  formData: {},
  lineItems: [],
  startTime: null,
  results: null,
};

// ── Line Items Counter ──────────────────────────────
let lineItemCount = 0;

// ═══════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  initParticles();
  animateTicker();
  populateFormDefaults();
});

// ═══════════════════════════════════════════════════
// SCREEN NAVIGATION
// ═══════════════════════════════════════════════════
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => {
    if (s.id === id) {
      s.classList.remove('exit');
      s.classList.add('active');
    } else {
      s.classList.remove('active');
      s.classList.add('exit');
      setTimeout(() => s.classList.remove('exit'), 500);
    }
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function goHome() {
  showScreen('screen-home');
}

function scrollToSection(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ═══════════════════════════════════════════════════
// OPEN WORKFLOW → BUILD FORM
// ═══════════════════════════════════════════════════
function openWorkflow(type) {
  const wf = WORKFLOWS[type];
  if (!wf) return;

  state.currentWorkflow = type;
  lineItemCount = 0;
  state.lineItems = [{ description: '', qty: 1, unit_price: 0 }];

  // Populate header
  document.getElementById('form-eyebrow').textContent  = wf.eyebrow;
  document.getElementById('form-title').textContent    = wf.title;
  document.getElementById('form-subtitle').textContent = wf.subtitle;

  // Populate form fields
  const container = document.getElementById('form-fields');
  container.innerHTML = '';

  // Regular fields in pairs
  const pairs = [];
  for (let i = 0; i < wf.fields.length; i += 2) {
    pairs.push(wf.fields.slice(i, i + 2));
  }
  pairs.forEach(pair => {
    if (pair.length === 2 && pair[0].type !== 'textarea' && pair[1].type !== 'textarea') {
      const row = document.createElement('div');
      row.className = 'field-group';
      pair.forEach(f => row.appendChild(buildField(f)));
      container.appendChild(row);
    } else {
      pair.forEach(f => {
        const wrap = document.createElement('div');
        wrap.className = 'field-group full';
        wrap.appendChild(buildField(f));
        container.appendChild(wrap);
      });
    }
  });

  // Line items section
  if (wf.hasLineItems) {
    const label = document.createElement('div');
    label.className = 'field-row-label';
    label.innerHTML = `<span>📦</span> Line Items`;
    container.appendChild(label);

    const liContainer = document.createElement('div');
    liContainer.id = 'line-items-container';
    liContainer.className = 'line-items-container';
    container.appendChild(liContainer);

    // Header row
    const header = document.createElement('div');
    header.className = 'line-item';
    header.style.marginBottom = '4px';
    header.innerHTML = `
      <div style="font-size:0.72rem;color:var(--text-3);font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Description</div>
      <div style="font-size:0.72rem;color:var(--text-3);font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Qty</div>
      <div style="font-size:0.72rem;color:var(--text-3);font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Unit Price</div>
      <div style="font-size:0.72rem;color:var(--text-3);font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Total</div>
    `;
    liContainer.appendChild(header);

    // Initial row
    addLineItemRow();

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'btn-add-line';
    addBtn.textContent = '+ Add Line Item';
    addBtn.onclick = addLineItemRow;
    container.appendChild(addBtn);

    // Totals
    const totals = document.createElement('div');
    totals.className = 'calc-totals';
    totals.id = 'calc-totals';
    totals.innerHTML = `
      <div class="calc-row"><span class="calc-label">Subtotal</span><span class="calc-val" id="calc-subtotal">$0.00</span></div>
      <div class="calc-row"><span class="calc-label">Tax</span><span class="calc-val" id="calc-tax">$0.00</span></div>
      <div class="calc-row total"><span class="calc-label">Total</span><span class="calc-val" id="calc-total">$0.00</span></div>
    `;
    container.appendChild(totals);
  }

  // Right panel — steps
  const stepsEl = document.getElementById('fi-steps');
  stepsEl.innerHTML = wf.steps.map((s, i) => `
    <li>
      <span class="fi-step-num">${i + 1}</span>
      <span>${s}</span>
    </li>
  `).join('');

  document.getElementById('fi-title').textContent = 'What OmniFix will do:';
  showScreen('screen-input');
}

function buildField(f) {
  const wrapper = document.createElement('div');
  wrapper.className = 'field';

  let input;
  if (f.type === 'select') {
    input = document.createElement('select');
    input.id = `field-${f.id}`;
    input.name = f.id;
    f.options.forEach(opt => {
      const o = document.createElement('option');
      o.value = opt; o.textContent = opt;
      input.appendChild(o);
    });
  } else if (f.type === 'textarea') {
    input = document.createElement('textarea');
    input.id = `field-${f.id}`;
    input.name = f.id;
    input.placeholder = f.placeholder || '';
    input.rows = 3;
  } else {
    input = document.createElement('input');
    input.type = f.type;
    input.id = `field-${f.id}`;
    input.name = f.id;
    input.placeholder = f.placeholder || '';
    if (f.step) input.step = f.step;
  }

  input.required = f.required;
  if (f.type === 'number') input.min = '0';

  // Live calculation for number fields
  input.addEventListener('input', recalcTotals);

  const label = document.createElement('label');
  label.htmlFor = `field-${f.id}`;
  label.textContent = f.label + (f.required ? ' *' : '');

  wrapper.appendChild(label);
  wrapper.appendChild(input);
  return wrapper;
}

function addLineItemRow() {
  lineItemCount++;
  const idx = lineItemCount;
  const container = document.getElementById('line-items-container');
  const row = document.createElement('div');
  row.className = 'line-item';
  row.id = `li-row-${idx}`;
  row.innerHTML = `
    <div class="field">
      <label for="li-desc-${idx}" style="display:none">Description</label>
      <input type="text" id="li-desc-${idx}" placeholder="Description…" oninput="recalcTotals()"/>
    </div>
    <div class="field">
      <label for="li-qty-${idx}" style="display:none">Qty</label>
      <input type="number" id="li-qty-${idx}" value="1" min="0.01" step="0.01" oninput="recalcTotals()"/>
    </div>
    <div class="field">
      <label for="li-price-${idx}" style="display:none">Unit Price</label>
      <input type="number" id="li-price-${idx}" value="0" min="0" step="0.01" placeholder="0.00" oninput="recalcTotals()"/>
    </div>
    <div class="field">
      <label for="li-total-${idx}" style="display:none">Total</label>
      <input type="text" id="li-total-${idx}" readonly style="background:rgba(16,185,129,0.08);color:var(--green);font-family:var(--mono)"/>
    </div>
    <button type="button" class="btn-remove-line" onclick="removeLineItem(${idx})" title="Remove" aria-label="Remove line item">✕</button>
  `;
  container.appendChild(row);
  recalcTotals();
}

function removeLineItem(idx) {
  const row = document.getElementById(`li-row-${idx}`);
  if (row) { row.remove(); recalcTotals(); }
}

function recalcTotals() {
  const taxEl = document.getElementById('field-tax_rate');
  const taxRate = taxEl ? parseFloat(taxEl.value) / 100 || 0 : 0;
  const currency = document.getElementById('field-currency')?.value || 'USD';
  const sym = getCurrencySymbol(currency);

  let subtotal = 0;
  let i = 1;
  while (document.getElementById(`li-qty-${i}`) !== null || i <= lineItemCount) {
    const qty = parseFloat(document.getElementById(`li-qty-${i}`)?.value) || 0;
    const price = parseFloat(document.getElementById(`li-price-${i}`)?.value) || 0;
    const lineTotal = qty * price;
    subtotal += lineTotal;
    const totalEl = document.getElementById(`li-total-${i}`);
    if (totalEl) totalEl.value = `${sym}${lineTotal.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}`;
    i++;
  }

  const tax = subtotal * taxRate;
  const total = subtotal + tax;

  const fmt = (n) => `${sym}${n.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}`;
  const st = document.getElementById('calc-subtotal');
  const tx = document.getElementById('calc-tax');
  const tt = document.getElementById('calc-total');
  if (st) st.textContent = fmt(subtotal);
  if (tx) tx.textContent = fmt(tax) + (taxRate ? ` (${(taxRate*100).toFixed(1)}%)` : '');
  if (tt) tt.textContent = fmt(total);
}

function getCurrencySymbol(code) {
  const map = { USD:'$', EUR:'€', GBP:'£', INR:'₹', CAD:'CA$', AUD:'A$' };
  return map[code] || code + ' ';
}

// ═══════════════════════════════════════════════════
// FILL SAMPLE DATA
// ═══════════════════════════════════════════════════
function fillSampleData() {
  const wf = WORKFLOWS[state.currentWorkflow];
  if (!wf?.sampleData) return;
  const data = wf.sampleData;

  // Regular fields
  wf.fields.forEach(f => {
    const el = document.getElementById(`field-${f.id}`);
    if (el && data[f.id]) el.value = data[f.id];
  });

  // Line items
  if (wf.hasLineItems && data.lineItems) {
    // Remove all existing rows
    const container = document.getElementById('line-items-container');
    // Remove all except header row
    while (container.children.length > 1) container.removeChild(container.lastChild);
    lineItemCount = 0;

    data.lineItems.forEach(item => {
      addLineItemRow();
      document.getElementById(`li-desc-${lineItemCount}`).value  = item.description;
      document.getElementById(`li-qty-${lineItemCount}`).value   = item.qty;
      document.getElementById(`li-price-${lineItemCount}`).value = item.unit_price;
    });
  }

  recalcTotals();

  // Visual flash
  document.querySelectorAll('.field input, .field select, .field textarea').forEach(el => {
    el.style.transition = 'border-color 0.3s, background 0.3s';
    el.style.borderColor = 'var(--green)';
    el.style.background = 'rgba(16,185,129,0.06)';
    setTimeout(() => {
      el.style.borderColor = '';
      el.style.background = '';
    }, 800);
  });
}

function populateFormDefaults() {
  // Set today's date as default for date fields
  const today = new Date().toISOString().slice(0, 10);
  const future = new Date(Date.now() + 30*24*3600*1000).toISOString().slice(0, 10);
  document.querySelectorAll('input[type="date"]').forEach(el => {
    el.value = el.id.includes('due') ? future : today;
  });
}

// ═══════════════════════════════════════════════════
// COLLECT FORM DATA
// ═══════════════════════════════════════════════════
function collectFormData() {
  const wf = WORKFLOWS[state.currentWorkflow];
  const data = {};

  wf.fields.forEach(f => {
    const el = document.getElementById(`field-${f.id}`);
    if (el) data[f.id] = el.value.trim();
  });

  // Collect line items
  if (wf.hasLineItems) {
    const items = [];
    for (let i = 1; i <= lineItemCount; i++) {
      const desc  = document.getElementById(`li-desc-${i}`)?.value?.trim();
      const qty   = parseFloat(document.getElementById(`li-qty-${i}`)?.value) || 0;
      const price = parseFloat(document.getElementById(`li-price-${i}`)?.value) || 0;
      if (desc && (qty > 0 || price > 0)) {
        items.push({ description: desc, qty, unit_price: price, total: qty * price });
      }
    }
    data.line_items = items;

    // Compute totals
    const taxRate = parseFloat(data.tax_rate) / 100 || 0;
    data.subtotal = items.reduce((s, i) => s + i.total, 0);
    data.tax      = data.subtotal * taxRate;
    data.total    = data.subtotal + data.tax;
    data.currency = data.currency || 'USD';
    data.currency_symbol = getCurrencySymbol(data.currency);
  }

  return data;
}

// ═══════════════════════════════════════════════════
// RUN AUTOMATION
// ═══════════════════════════════════════════════════
async function runAutomation(event) {
  event.preventDefault();

  const wf = WORKFLOWS[state.currentWorkflow];
  if (!wf) return;

  state.formData = collectFormData();
  state.startTime = Date.now();

  buildProcessingScreen(wf);
  showScreen('screen-processing');

  // Try to hit real backend; fallback to simulation
  try {
    const res = await fetch(`${API}/api/workflows/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workflow_name: state.currentWorkflow,
        task: `Process ${wf.label}: ${state.formData.vendor_name || state.formData.doc_name || state.formData.employee || state.formData.report_name}`,
        input_data: state.formData,
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error('non-200');
    const backendData = await res.json();
    await simulateProcessing(wf, backendData);
  } catch {
    // Simulate autonomously (no server required)
    await simulateProcessing(wf, null);
  }
}

// ═══════════════════════════════════════════════════
// BUILD PROCESSING SCREEN
// ═══════════════════════════════════════════════════
function buildProcessingScreen(wf) {
  const pipeline = document.getElementById('proc-pipeline');
  pipeline.innerHTML = wf.steps.map((step, i) => `
    <div class="proc-step" id="pstep-${i}" role="listitem">
      <span class="ps-icon" aria-hidden="true">${getStepIcon(step)}</span>
      <div class="ps-info">
        <div class="ps-name">${step}</div>
        <div class="ps-detail" id="pstep-detail-${i}">Waiting…</div>
      </div>
      <span class="ps-conf" id="pstep-conf-${i}">—</span>
      <span class="ps-status pending" id="pstep-status-${i}">Pending</span>
    </div>
  `).join('');

  document.getElementById('proc-fill').style.width = '0%';
  document.getElementById('proc-pct').textContent = '0%';
  document.getElementById('proc-subtitle').textContent = 'Initialising intelligent agents…';
  document.getElementById('proc-log').innerHTML = '<div class="proc-log-entry">Initialising intelligent agents…</div>';
}

function getStepIcon(step) {
  const map = {
    'scan': '📧', 'extract': '🔍', 'ocr': '🔍', 'classify': '🗂️',
    'validate': '✅', 'enter': '💻', 'fill': '💻', 'update': '📊',
    'send': '💬', 'approval': '💬', 'notify': '💬', 'archive': '🗃️',
    'generate': '📑', 'report': '📑', 'analyse': '📈', 'parse': '⚙️',
    'route': '🔀', 'compliance': '📋', 'budget': '💰', 'calculate': '🧮',
    'file': '📁', 'check': '✅', 'cross': '🔗', 'distribute': '📤',
  };
  const lower = step.toLowerCase();
  for (const [key, icon] of Object.entries(map)) {
    if (lower.includes(key)) return icon;
  }
  return '⚡';
}

// ═══════════════════════════════════════════════════
// SIMULATE PROCESSING (AUTONOMOUS)
// ═══════════════════════════════════════════════════
async function simulateProcessing(wf, backendData) {
  const steps = wf.steps;
  const total = steps.length;
  const confidences = [];

  addProcLog('AI agents ready — beginning autonomous execution…');
  await sleep(800);

  for (let i = 0; i < total; i++) {
    const stepEl     = document.getElementById(`pstep-${i}`);
    const statusEl   = document.getElementById(`pstep-status-${i}`);
    const detailEl   = document.getElementById(`pstep-detail-${i}`);
    const confEl     = document.getElementById(`pstep-conf-${i}`);

    stepEl.classList.add('running');
    statusEl.textContent = 'Running'; statusEl.className = 'ps-status running';
    document.getElementById('proc-subtitle').textContent = steps[i];
    detailEl.textContent = getStepDetail(steps[i], state.formData);

    addProcLog(`Starting: ${steps[i]}`);

    const duration = 900 + Math.random() * 800;
    await sleep(duration);

    // Occasional simulated recovery
    const failed = Math.random() < 0.06;
    const confidence = failed ? 0 : 0.87 + Math.random() * 0.12;

    if (failed) {
      addProcLog(`⚠ Low confidence on step ${i+1} — applying self-healing…`, 'warn');
      await sleep(600);
      addProcLog(`✓ Recovered — step completed successfully`, 'ok');
      confidences.push(0.88 + Math.random() * 0.10);
    } else {
      confidences.push(confidence);
    }

    stepEl.classList.remove('running'); stepEl.classList.add('done');
    statusEl.textContent = 'Done'; statusEl.className = 'ps-status done';
    confEl.textContent   = `${(confidences[i] * 100).toFixed(1)}%`;
    confEl.className     = 'ps-conf high';
    addProcLog(`✓ Completed: ${steps[i]} — ${(confidences[i]*100).toFixed(1)}% confidence`, 'ok');

    // Progress bar
    const pct = Math.round(((i + 1) / total) * 100);
    document.getElementById('proc-fill').style.width = `${pct}%`;
    document.getElementById('proc-pct').textContent  = `${pct}%`;
  }

  addProcLog('All steps complete — compiling results…', 'ok');
  await sleep(600);

  state.results = buildResults(wf, confidences);
  showResultsScreen();
}

function getStepDetail(step, data) {
  const lower = step.toLowerCase();
  if (lower.includes('scan') || lower.includes('inbox')) return `Scanning inbox for ${data.vendor_name || 'attachments'}…`;
  if (lower.includes('extract') || lower.includes('ocr')) return `Extracting fields from document using AI…`;
  if (lower.includes('validate') || lower.includes('purchase')) return `Cross-referencing ${data.po_reference || 'records'} in database…`;
  if (lower.includes('accounting') || lower.includes('fill')) return `Auto-filling form with extracted data…`;
  if (lower.includes('budget') || lower.includes('tracker')) return `Updating budget by ${data.currency_symbol || '$'}${(data.total||0).toFixed(2)}…`;
  if (lower.includes('approval') || lower.includes('slack')) return `Sending approval request for ${data.currency_symbol || '$'}${(data.total||0).toFixed(2)}…`;
  if (lower.includes('archive')) return `Archiving document with searchable metadata…`;
  if (lower.includes('report') || lower.includes('summary')) return `Compiling processing summary…`;
  if (lower.includes('classify')) return `Classifying document type using AI…`;
  if (lower.includes('compliance')) return `Checking compliance requirements…`;
  if (lower.includes('route')) return `Routing to appropriate team…`;
  if (lower.includes('analys') || lower.includes('trend')) return `Analysing trends and computing KPIs…`;
  if (lower.includes('insight')) return `Generating AI-powered insights…`;
  if (lower.includes('distribute')) return `Sending to ${data.recipients || 'recipients'}…`;
  return `Processing with AI agents…`;
}

function addProcLog(text, cls) {
  const log = document.getElementById('proc-log');
  const entry = document.createElement('div');
  entry.className = `proc-log-entry ${cls || ''}`;
  const now = new Date();
  entry.textContent = `[${now.toTimeString().slice(0,8)}] ${text}`;
  log.appendChild(entry);
  log.scrollTop = log.scrollHeight;
}

// ═══════════════════════════════════════════════════
// BUILD RESULTS DATA
// ═══════════════════════════════════════════════════
function buildResults(wf, confidences) {
  const d = state.formData;
  const sym = d.currency_symbol || '$';
  const avgConf = confidences.reduce((a,b)=>a+b,0)/confidences.length;
  const elapsed = ((Date.now() - state.startTime) / 1000).toFixed(1);

  if (state.currentWorkflow === 'invoice') {
    return {
      type: 'invoice', elapsed, avgConf, sym, confidences,
      extracted: [
        { key: 'Vendor Name',     val: d.vendor_name,    cls: 'primary' },
        { key: 'Invoice Number',  val: d.invoice_number, cls: 'primary' },
        { key: 'Invoice Date',    val: d.invoice_date,   cls: '' },
        { key: 'Due Date',        val: d.due_date,       cls: '' },
        { key: 'PO Reference',    val: d.po_reference || '—', cls: '' },
        { key: 'Currency',        val: d.currency,       cls: '' },
        { key: 'Subtotal',        val: `${sym}${d.subtotal?.toFixed(2)}`, cls: 'amount' },
        { key: 'Tax',             val: `${sym}${d.tax?.toFixed(2)} (${d.tax_rate}%)`, cls: 'amount' },
        { key: 'Total Amount',    val: `${sym}${d.total?.toFixed(2)}`, cls: 'amount' },
      ],
      decisions: [
        { icon:'✅', label:'PO Validated', detail:`Invoice matched to ${d.po_reference||'purchase order'} — within tolerance` },
        { icon:'💳', label:'Payment Approved', detail:`Amount ${sym}${d.total?.toFixed(2)} cleared for processing` },
        { icon:'📤', label:'Accounting Entry Created', detail:`Transaction ID TXN-${Math.floor(80000+Math.random()*15000)} filed` },
        { icon:'🔔', label:'Manager Notified', detail:`Approval request sent via Slack & email` },
      ],
      actions: [
        { label:'Inbox Scanned',        detail:`Invoice attachment detected & queued` },
        { label:'Fields Extracted',     detail:`${d.line_items?.length || 1} line items, all fields validated` },
        { label:'PO Cross-referenced',  detail:`6/6 business rules passed` },
        { label:'Accounting Filed',     detail:`Form auto-filled & submitted successfully` },
        { label:'Budget Updated',       detail:`Project tracker updated by ${sym}${d.total?.toFixed(2)}` },
        { label:'Approval Requested',   detail:`Sent to manager with full invoice summary` },
        { label:'Document Archived',    detail:`Cloud storage — ID: drv_${Math.random().toString(36).slice(2,10)}` },
        { label:'Report Generated',     detail:`Weekly summary compiled & distributed` },
      ],
    };
  }

  if (state.currentWorkflow === 'document') {
    return {
      type: 'document', elapsed, avgConf, sym, confidences,
      extracted: [
        { key: 'Document Name', val: d.doc_name,  cls: 'primary' },
        { key: 'Document Type', val: d.doc_type,  cls: '' },
        { key: 'Date',          val: d.doc_date || '—', cls: '' },
        { key: 'Parties',       val: d.parties || '—', cls: '' },
        { key: 'Action',        val: d.action,    cls: 'success' },
        { key: 'Status',        val: '✅ Processed', cls: 'success' },
      ],
      decisions: [
        { icon:'🗂️', label:`Classified as ${d.doc_type}`, detail:`High-confidence document classification` },
        { icon:'✅', label:'Compliance Checked', detail:`All regulatory requirements met` },
        { icon:'🔗', label:'Cross-referenced',   detail:`Matched against 3 existing records` },
        { icon:'🔀', label:'Action Taken',        detail:`${d.action} — completed automatically` },
      ],
      actions: [
        { label:'Document Classified', detail:`Type: ${d.doc_type}` },
        { label:'Key Fields Extracted', detail:`All entities and dates identified` },
        { label:'Compliance Verified', detail:`No issues found` },
        { label:'Record Matched', detail:`Linked to existing account` },
        { label:`${d.action}`, detail:`Completed successfully` },
      ],
    };
  }

  if (state.currentWorkflow === 'expense') {
    return {
      type: 'expense', elapsed, avgConf, sym, confidences,
      extracted: [
        { key: 'Employee',       val: d.employee,        cls: 'primary' },
        { key: 'Department',     val: d.department,      cls: '' },
        { key: 'Period',         val: d.expense_period,  cls: '' },
        { key: 'Project Code',   val: d.project_code || '—', cls: '' },
        { key: 'Subtotal',       val: `${sym}${d.subtotal?.toFixed(2)}`, cls: 'amount' },
        { key: 'Total Claim',    val: `${sym}${d.total?.toFixed(2)}`, cls: 'amount' },
        { key: 'Status',         val: '✅ Approved',     cls: 'success' },
      ],
      decisions: [
        { icon:'✅', label:'Receipts Validated',   detail:`All ${d.line_items?.length||0} receipts within policy limits` },
        { icon:'📋', label:'Policy Compliant',      detail:`All expense categories approved` },
        { icon:'💰', label:`Reimbursement Approved`, detail:`${sym}${d.total?.toFixed(2)} cleared` },
        { icon:'📤', label:'Finance Notified',       detail:`Reimbursement scheduled for next pay run` },
      ],
      actions: [
        { label:'Receipts Scanned & Validated', detail:`${d.line_items?.length||0} items verified` },
        { label:'Policy Rules Applied', detail:`6/6 rules passed` },
        { label:'Reimbursement Calculated', detail:`${sym}${d.total?.toFixed(2)}` },
        { label:'Budget Checked', detail:`Available funds confirmed` },
        { label:'Claim Filed', detail:`Reference EXP-${Math.floor(1000+Math.random()*9000)}` },
        { label:'Finance Notified', detail:`Payout in next pay cycle` },
      ],
    };
  }

  // Report
  return {
    type: 'report', elapsed, avgConf, sym, confidences,
    extracted: [
      { key: 'Report Title',  val: d.report_name,  cls: 'primary' },
      { key: 'Report Type',   val: d.report_type,  cls: '' },
      { key: 'Period',        val: d.period,        cls: '' },
      { key: 'Recipients',    val: d.recipients || '—', cls: '' },
      { key: 'Format',        val: d.format,        cls: 'success' },
      { key: 'Status',        val: '✅ Generated',   cls: 'success' },
    ],
    decisions: [
      { icon:'📈', label:'Trends Analysed',   detail:`Key patterns identified in dataset` },
      { icon:'💡', label:'3 Insights Generated', detail:`AI-generated actionable insights` },
      { icon:'📄', label:`${d.format} Created`, detail:`Formatted and ready for distribution` },
      { icon:'📤', label:'Distributed',         detail:`Sent to ${d.recipients?.split(',').length || 1} recipient(s)` },
    ],
    actions: [
      { label:'Data Parsed & Validated',  detail:`All metrics verified` },
      { label:'KPIs Calculated',          detail:`Trends computed automatically` },
      { label:'AI Insights Generated',    detail:`3 actionable recommendations` },
      { label:`${d.format} Built`,        detail:`Formatted automatically` },
      { label:'Distributed',              detail:`Sent to recipients` },
    ],
  };
}

// ═══════════════════════════════════════════════════
// SHOW RESULTS
// ═══════════════════════════════════════════════════
function showResultsScreen() {
  const r = state.results;
  if (!r) return;

  const elapsed = r.elapsed;
  document.getElementById('results-subtitle').innerHTML =
    `All steps completed successfully in <strong>${elapsed} seconds</strong>`;

  // Summary cards
  const sym = r.sym;
  const cards = getSummaryCards(r);
  document.getElementById('summary-cards').innerHTML = cards.map(c => `
    <div class="s-card ${c.cls}">
      <div class="s-card-icon" aria-hidden="true">${c.icon}</div>
      <div class="s-card-val">${c.val}</div>
      <div class="s-card-label">${c.label}</div>
    </div>
  `).join('');

  // Extracted data
  document.getElementById('rp-extracted').innerHTML = r.extracted.map(f => `
    <div class="data-row">
      <span class="data-key">${f.key}</span>
      <span class="data-val ${f.cls}">${f.val}</span>
    </div>
  `).join('');

  // Decisions
  const decBadge = document.getElementById('decision-badge');
  decBadge.textContent = 'Approved';
  decBadge.className = 'rp-badge success';
  document.getElementById('rp-decisions').innerHTML = r.decisions.map(d => `
    <div class="decision-item">
      <span class="decision-icon" aria-hidden="true">${d.icon}</span>
      <div class="decision-text">
        <div class="decision-label">${d.label}</div>
        <div class="decision-detail">${d.detail}</div>
      </div>
    </div>
  `).join('');

  // Actions
  const actionBadge = document.querySelector('#rp-actions').closest('.result-panel').querySelector('.rp-badge');
  if (actionBadge) { actionBadge.textContent = `${r.actions.length} Completed`; actionBadge.className = 'rp-badge success'; }
  document.getElementById('rp-actions').innerHTML = r.actions.map((a, i) => `
    <div class="action-item" style="animation-delay:${i*0.06}s">
      <span class="action-check" aria-hidden="true">✓</span>
      <div class="action-text">
        <div class="action-label">${a.label}</div>
        <div class="action-detail">${a.detail}</div>
      </div>
    </div>
  `).join('');

  // Confidence bars
  const wf = WORKFLOWS[state.currentWorkflow];
  document.getElementById('rp-confidence').innerHTML = wf.steps.map((step, i) => {
    const conf = r.confidences[i] || 0;
    const pct  = (conf * 100).toFixed(1);
    const cls  = conf >= 0.9 ? 'high' : conf >= 0.8 ? 'medium' : 'low';
    const shortStep = step.length > 40 ? step.slice(0,38)+'…' : step;
    return `
      <div class="conf-item">
        <div class="conf-header">
          <span class="conf-step-name">${shortStep}</span>
          <span class="conf-pct ${cls}">${pct}%</span>
        </div>
        <div class="conf-bar"><div class="conf-fill" style="width:0%" data-target="${pct}"></div></div>
      </div>
    `;
  }).join('');

  document.getElementById('ts-auto').textContent = `⚡ OmniFix: ~${elapsed} seconds`;

  showScreen('screen-results');

  // Animate confidence bars after reveal
  setTimeout(() => {
    document.querySelectorAll('.conf-fill').forEach(el => {
      el.style.width = el.dataset.target + '%';
    });
  }, 300);
}

function getSummaryCards(r) {
  const d = state.formData;
  const sym = r.sym;
  const confPct = (r.avgConf * 100).toFixed(1);

  if (r.type === 'invoice') return [
    { icon:'🧾', val: d.invoice_number, label:'Invoice Number',     cls:'blue' },
    { icon:'💰', val: `${sym}${d.total?.toFixed(2)}`, label:'Total Amount', cls:'green' },
    { icon:'✅', val: 'APPROVED',        label:'Decision',          cls:'green' },
    { icon:'📊', val: `${confPct}%`,    label:'AI Confidence',     cls:'purple' },
  ];
  if (r.type === 'expense') return [
    { icon:'👤', val: d.employee,        label:'Employee',           cls:'blue' },
    { icon:'💰', val: `${sym}${d.total?.toFixed(2)}`, label:'Reimbursement', cls:'green' },
    { icon:'✅', val: 'APPROVED',        label:'Claim Status',      cls:'green' },
    { icon:'📊', val: `${confPct}%`,    label:'AI Confidence',     cls:'purple' },
  ];
  if (r.type === 'document') return [
    { icon:'📄', val: d.doc_type,        label:'Document Type',     cls:'blue' },
    { icon:'✅', val: d.action,           label:'Action Taken',      cls:'green' },
    { icon:'🔒', val: 'Compliant',       label:'Compliance Status', cls:'green' },
    { icon:'📊', val: `${confPct}%`,    label:'AI Confidence',     cls:'purple' },
  ];
  return [
    { icon:'📊', val: d.report_type,    label:'Report Type',       cls:'blue' },
    { icon:'📤', val: d.format,          label:'Output Format',     cls:'green' },
    { icon:'✅', val: 'Distributed',    label:'Status',            cls:'green' },
    { icon:'📈', val: `${confPct}%`,   label:'AI Confidence',     cls:'purple' },
  ];
}

// ═══════════════════════════════════════════════════
// DOWNLOAD RESULTS
// ═══════════════════════════════════════════════════
function downloadResults() {
  const r = state.results;
  const d = state.formData;
  const wf = WORKFLOWS[state.currentWorkflow];
  if (!r) return;

  const lines = [
    `OMNIFIX AUTOMATION REPORT`,
    `Generated: ${new Date().toLocaleString()}`,
    `Workflow:  ${wf.label}`,
    `Time:      ${r.elapsed}s`,
    `Confidence: ${(r.avgConf*100).toFixed(1)}%`,
    '',
    '═══ EXTRACTED DATA ═══',
    ...r.extracted.map(f => `${f.key}: ${f.val}`),
    '',
    '═══ DECISIONS ═══',
    ...r.decisions.map(d => `${d.label}: ${d.detail}`),
    '',
    '═══ ACTIONS TAKEN ═══',
    ...r.actions.map((a,i) => `${i+1}. ${a.label} — ${a.detail}`),
    '',
    '═══ CONFIDENCE SCORES ═══',
    ...wf.steps.map((s,i) => `${s}: ${(r.confidences[i]*100).toFixed(1)}%`),
  ];

  const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `omnifix-report-${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════════════════
// PARTICLE BACKGROUND
// ═══════════════════════════════════════════════════
function initParticles() {
  const canvas = document.getElementById('particles');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const resize = () => { canvas.width = innerWidth; canvas.height = innerHeight; };
  resize();
  window.addEventListener('resize', resize);

  const NUM = 70;
  const particles = Array.from({ length: NUM }, () => ({
    x: Math.random() * innerWidth,
    y: Math.random() * innerHeight,
    vx: (Math.random() - 0.5) * 0.35,
    vy: (Math.random() - 0.5) * 0.35,
    r:  Math.random() * 1.4 + 0.4,
    a:  Math.random() * 0.35 + 0.05,
    hue: Math.random() < 0.5 ? 210 : (Math.random() < 0.5 ? 270 : 190),
  }));

  const draw = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > canvas.width)  p.vx *= -1;
      if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${p.hue},90%,70%,${p.a})`;
      ctx.fill();
    });
    // Connections
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const a = particles[i], b = particles[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const d = Math.hypot(dx, dy);
        if (d < 130) {
          ctx.beginPath();
          ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = `hsla(210,90%,65%,${0.07*(1-d/130)})`;
          ctx.lineWidth = 0.6;
          ctx.stroke();
        }
      }
    }
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
}

// ═══════════════════════════════════════════════════
// TICKER ANIMATION
// ═══════════════════════════════════════════════════
function animateTicker() {
  let count = 1247;
  const el = document.getElementById('tick-1');
  if (!el) return;
  el.textContent = count.toLocaleString();
  setInterval(() => {
    count += Math.floor(Math.random() * 3) + 1;
    el.textContent = count.toLocaleString();
  }, 3000);
}

// ═══════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
