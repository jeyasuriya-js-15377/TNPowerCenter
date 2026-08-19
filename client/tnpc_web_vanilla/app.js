/* Tamil Nadu Power Center — client.
   Zero dependencies, zero build step. Deploys to Catalyst Slate as static files.
   The Catalyst Advanced I/O function is served from the same origin at
   /server/<function-name>, so the API base is relative by default. */

const API_BASE = window.TNPC_API_BASE || '/server/tnpc_api';

const state = { token: null, user: null, dashboard: null, complaints: [] };

/* ── tiny helpers ─────────────────────────────────────────────────── */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function toast(msg, kind = '') {
  const t = $('#toast');
  t.className = `toast ${kind}`;
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(t._t);
  t._t = setTimeout(() => { t.hidden = true; }, 5200);
}

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(API_BASE + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      // X-App-Token, never Authorization: Catalyst validates any
      // `Authorization: Bearer ...` sent to an AdvancedIO function as one of
      // its own OAuth tokens and returns 401 before our handler runs.
      ...(state.token ? { 'X-App-Token': state.token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok) {
    const err = new Error((data && data.error && data.error.message) || `Request failed (${res.status})`);
    err.payload = data && data.error;
    err.status = res.status;
    throw err;
  }
  return data;
}

/* ── semantics ────────────────────────────────────────────────────── */
const healthClass = (h) => ({
  HEALTHY: 'c-ok', WATCH: 'c-warn', AT_RISK: 'c-risk', CRITICAL: 'c-crit', DATA_GAP: 'c-gap',
}[h] || 'c-gap');
const healthBg = (h) => ({
  HEALTHY: 'bg-ok', WATCH: 'bg-warn', AT_RISK: 'bg-risk', CRITICAL: 'bg-crit', DATA_GAP: 'bg-gap',
}[h] || 'bg-gap');
const slaClass = (s) => ({
  BREACHED: 'c-crit', AT_RISK: 'c-risk', DUE: 'c-ok', RESOLVED: 'c-ok',
}[s] || 'muted');
const scoreClass = (n) => (n == null ? 'c-gap' : n >= 85 ? 'c-ok' : n >= 70 ? 'c-warn' : n >= 55 ? 'c-risk' : 'c-crit');
const stage = (s) => String(s || '').replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());

/* ── auth ─────────────────────────────────────────────────────────── */
$$('.demo-row').forEach((b) => b.addEventListener('click', () => {
  $('#email').value = b.dataset.e;
  $('#password').value = b.dataset.p;
}));

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#login-btn');
  const err = $('#login-error');
  err.hidden = true;
  btn.disabled = true;
  btn.textContent = 'Signing in…';
  try {
    const r = await api('/auth/login', {
      method: 'POST',
      body: { email: $('#email').value.trim(), password: $('#password').value },
    });
    state.token = r.token;
    state.user = r.user;
    sessionStorage.setItem('tnpc', JSON.stringify({ token: r.token, user: r.user }));
    enterApp();
  } catch (ex) {
    err.textContent = ex.message;
    err.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sign in';
  }
});

$('#logout').addEventListener('click', () => {
  sessionStorage.removeItem('tnpc');
  location.reload();
});
$('#refresh').addEventListener('click', () => loadDashboard(true));

function enterApp() {
  $('#login').hidden = true;
  $('#app').hidden = false;
  $('#who-name').textContent = state.user.name;
  $('#who-role').textContent = state.user.role.replace(/_/g, ' ');
  loadDashboard();
}

/* ── navigation ───────────────────────────────────────────────────── */
$$('.tab').forEach((tab) => tab.addEventListener('click', () => {
  $$('.tab').forEach((t) => t.classList.toggle('active', t === tab));
  $$('.view').forEach((v) => { v.hidden = v.id !== `view-${tab.dataset.view}`; });
  if (tab.dataset.view === 'complaints') loadComplaints();
  if (tab.dataset.view === 'directives') loadDirectives();
}));

/* ── command center ───────────────────────────────────────────────── */
async function loadDashboard(force) {
  if (force) toast('Refreshing from Zoho Projects…');
  $('#flags').innerHTML = '<div class="skeleton">Reading Zoho Projects…</div>';
  try {
    const d = await api('/dashboard');
    state.dashboard = d;
    renderPulse(d);
    renderFlags(d.redFlags);
    renderMatrix(d.scorecards);
    renderDistricts(d.districts);
    renderFreshness(d.freshness, d.scope);
    if (force) toast('Updated.', 'ok');
  } catch (ex) {
    $('#flags').innerHTML = `<div class="empty">Could not load the command center.<br><b>${esc(ex.message)}</b></div>`;
    toast(ex.message, 'bad');
  }
}

function renderPulse(d) {
  const p = d.pulse;
  $('#pulse-main').innerHTML = `
    <div class="pulse-label">State pulse</div>
    <div class="pulse-score ${scoreClass(p.score)}">${p.score ?? '—'}<span style="font-size:20px;color:var(--ink-3)">/100</span></div>
    <div class="pulse-state">
      <span class="pill ${healthClass(p.health)}">${p.health.replace('_', ' ')}</span>
    </div>
    <div class="pulse-state muted" style="font-size:12px">
      ${p.departmentsScored} of ${p.departmentsTotal} departments scored
      ${p.weakest ? `<br>Weakest: <b>${esc(p.weakest.short)}</b> (${p.weakest.score})` : ''}
    </div>`;

  $('#pulse-drivers').innerHTML = `<div class="pulse-label">What is driving the score</div>` +
    p.drivers.map((dr) => `
      <div class="driver">
        <div>
          <div class="driver-name">${esc(dr.label)} <em>weight ${Math.round(dr.weight * 100)}%</em></div>
          <div class="bar"><i class="${dr.value == null ? 'bg-gap' : healthBg(
            dr.value >= 85 ? 'HEALTHY' : dr.value >= 70 ? 'WATCH' : dr.value >= 55 ? 'AT_RISK' : 'CRITICAL'
          )}" style="width:${dr.value ?? 100}%"></i></div>
        </div>
        <div class="driver-val ${scoreClass(dr.value)}">${dr.value ?? '—'}</div>
      </div>`).join('');

  const t = d.totals;
  $('#pulse-totals').innerHTML = `
    <div class="pulse-label">Live counts</div>
    <div class="totals-grid">
      <div class="total-cell"><b>${t.complaints}</b><span>Complaints</span></div>
      <div class="total-cell"><b class="c-crit">${t.breached}</b><span>SLA breached</span></div>
      <div class="total-cell"><b class="c-risk">${t.atRisk}</b><span>At risk</span></div>
      <div class="total-cell"><b class="c-warn">${t.awaitingCitizen}</b><span>Awaiting citizen</span></div>
    </div>`;
}

function renderFlags(flags) {
  if (!flags || !flags.length) {
    $('#flags').innerHTML = '<div class="empty">Nothing currently requires executive attention.<br><span style="font-size:12px">The engine surfaces clusters and severe breaches only — an empty list is a real answer, not a missing one.</span></div>';
    return;
  }
  $('#flags').innerHTML = flags.map((f, i) => `
    <div class="flag sev-${esc(f.severity)}" data-flag="${i}">
      <div>
        <h3>${esc(f.title)}</h3>
        <p class="what">${esc(f.what)}</p>
        <p class="why">${esc(f.why)}</p>
        <div class="flag-meta">
          <span class="chip">${esc(f.department)}</span>
          <span class="chip">${esc(f.district)}</span>
          <span class="chip">${f.citizenImpact} citizens affected</span>
          <span class="chip">${esc(f.type.replace(/_/g, ' '))}</span>
        </div>
      </div>
      <div class="attention">
        <b class="${f.severity === 'CRITICAL' ? 'c-crit' : f.severity === 'HIGH' ? 'c-risk' : 'c-warn'}">${f.attentionScore}</b>
        <span>Attention</span>
      </div>
    </div>`).join('');

  $$('#flags .flag').forEach((el) =>
    el.addEventListener('click', () => openFlag(flags[Number(el.dataset.flag)])));
}

function renderMatrix(cards) {
  $('#matrix').innerHTML = cards.map((c, i) => `
    <div class="dept-row" data-dept="${i}">
      <div>
        <div class="dept-name">${esc(c.department)}</div>
        <div class="dept-sub">${c.counts.total} complaints · ${c.counts.breached} breached · ${c.counts.reopened} reopened</div>
      </div>
      <div><span class="pill ${healthClass(c.health)}">${c.health.replace('_', ' ')}</span></div>
      <div class="dept-score ${scoreClass(c.score)}">${c.score ?? '—'}</div>
    </div>`).join('');
  $$('#matrix .dept-row').forEach((el) =>
    el.addEventListener('click', () => openDepartment(cards[Number(el.dataset.dept)])));
}

function renderDistricts(list) {
  $('#districts').innerHTML = list.length ? list.map((d) => `
    <div class="district">
      <div>
        <div class="district-name">${esc(d.district)}</div>
        <div class="district-sub">${d.total} complaints · ${d.departments.length} departments${d.reopened ? ` · ${d.reopened} reopened` : ''}</div>
      </div>
      <div class="district-num ${d.breachRate >= 50 ? 'c-crit' : d.breachRate >= 25 ? 'c-risk' : 'c-ok'}">
        ${d.breachRate}%<div class="district-sub" style="text-align:right">breached</div>
      </div>
    </div>`).join('') : '<div class="empty">No district data.</div>';
}

function renderFreshness(f, scope) {
  $('#freshness').innerHTML = `
    <span><b class="c-ok">${esc(f.state)}</b> · source: ${esc(f.source)}</span>
    <span>Last read: ${new Date(f.lastUpdated).toLocaleTimeString()}</span>
    <span>Scope: ${scope.type === 'GLOBAL' ? 'Statewide' : `${scope.departmentIds.length} department(s)`}</span>
    ${f.dataGaps.length ? `<span class="c-gap"><b>${f.dataGaps.length} DATA GAP(S)</b> — reported, never counted as zero</span>` : ''}`;
}

/* ── drawer ───────────────────────────────────────────────────────── */
function openDrawer(html) {
  $('#drawer-body').innerHTML = html;
  $('#drawer').hidden = false;
  document.body.style.overflow = 'hidden';
}
function closeDrawer() {
  $('#drawer').hidden = true;
  document.body.style.overflow = '';
}
$$('[data-close]').forEach((el) => el.addEventListener('click', closeDrawer));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });

/* Red flag investigation — the CM's "what is wrong / who / what do I do" view. */
function openFlag(f) {
  const canIssue = state.user.permissions.includes('directive:issue');
  openDrawer(`
    <h2>${esc(f.title)}</h2>
    <div class="flag-meta" style="margin-bottom:6px">
      <span class="chip">Attention ${f.attentionScore}</span>
      <span class="chip">${esc(f.severity)}</span>
      <span class="chip">${esc(f.district)}</span>
    </div>

    <div class="dsec"><h4>What is happening</h4><p>${esc(f.what)}</p></div>
    <div class="dsec"><h4>Why it matters</h4><p>${esc(f.why)}</p></div>

    <div class="dsec">
      <h4>Who is accountable</h4>
      <dl class="kv">
        <dt>Department</dt><dd>${esc(f.department)}</dd>
        <dt>Political</dt><dd>${esc(f.accountability.political.holder)}</dd>
        <dt>Administrative</dt><dd>${esc(f.accountability.administrative.holder)}</dd>
      </dl>
      <p class="muted" style="font-size:12px;margin-top:8px">${esc(f.accountability.note)}</p>
    </div>

    <div class="dsec">
      <h4>Evidence — ${f.evidence.length} of ${f.citizenImpact} complaints</h4>
      ${f.evidence.map((e) => `
        <div class="evidence">
          <div class="e-title">${esc(e.title)}</div>
          <div class="e-meta">${esc(e.citizenRef || 'no reference')} ·
            <span class="${slaClass(e.sla)}">${esc(e.sla)}${e.breachHours ? ` by ${e.breachHours}h` : ''}</span>
            ${e.satisfaction === 'Unsatisfied' ? ' · <span class="c-crit">citizen rejected the resolution</span>' : ''}
          </div>
        </div>`).join('')}
    </div>

    <div class="dsec">
      <h4>Recommended action</h4>
      <div class="notice warn">${esc(f.recommendation)}</div>
    </div>

    <div class="dsec">
      <h4>Issue a CM directive</h4>
      ${canIssue ? `
        <form id="directive-form" style="display:grid;gap:11px">
          <label>Directive title
            <input id="d-title" value="${esc('Restore water service reliability in ' + f.district)}" required />
          </label>
          <label>Objective
            <textarea id="d-obj" rows="3" required>Resolve all breached complaints in ${esc(f.district)} under ${esc(f.department)} within 7 days, with field verification before any complaint is marked resolved. Report daily to the CM War Room.</textarea>
          </label>
          <label>Deadline
            <input id="d-deadline" type="date" required />
          </label>
          <button class="btn primary" type="submit">Issue directive</button>
          <p class="muted" style="font-size:12px;margin:0">This is a privileged, audited action. It creates a directive record and real execution work in the department's Zoho project.</p>
        </form>` : `
        <div class="notice bad">
          Your role (<b>${esc(state.user.role.replace(/_/g, ' '))}</b>) can investigate and prepare, but cannot issue a directive.
          Visibility and authority are deliberately separate, and the rule is enforced on the server — not by hiding this button.
        </div>`}
    </div>`);

  if (canIssue) {
    const dl = $('#d-deadline');
    const d = new Date(Date.now() + 7 * 864e5);
    dl.value = d.toISOString().slice(0, 10);

    $('#directive-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button');
      btn.disabled = true; btn.textContent = 'Issuing…';
      try {
        const r = await api('/directives', {
          method: 'POST',
          body: {
            title: $('#d-title').value,
            objective: $('#d-obj').value,
            departmentId: f.departmentId,
            deadline: $('#d-deadline').value,
            redFlagId: f.id,
          },
        });
        openDrawer(`
          <h2>Directive issued</h2>
          <div class="notice ok">The directive is recorded in Zoho Projects and execution work has been created in the department project.</div>
          <div class="dsec"><dl class="kv">
            <dt>Directive</dt><dd>${esc(r.directive.title)}</dd>
            <dt>Department</dt><dd>${esc(r.directive.department)}</dd>
            <dt>Status</dt><dd>${esc(r.directive.status)}</dd>
            <dt>Zoho task</dt><dd>${esc(r.execution.zohoTaskId || r.execution.detail)}</dd>
            <dt>Issued by</dt><dd>${esc(r.audit.actor)} (${esc(r.audit.role.replace(/_/g, ' '))})</dd>
            <dt>At</dt><dd>${new Date(r.audit.at).toLocaleString()}</dd>
          </dl></div>`);
        toast('Directive issued and pushed to Zoho Projects.', 'ok');
        loadDashboard();
      } catch (ex) {
        toast(ex.message, 'bad');
        btn.disabled = false; btn.textContent = 'Issue directive';
      }
    });
  }
}

/* Department 360 */
function openDepartment(c) {
  openDrawer(`
    <h2>${esc(c.department)}</h2>
    <div class="flag-meta" style="margin-bottom:6px">
      <span class="pill ${healthClass(c.health)}">${c.health.replace('_', ' ')}</span>
      <span class="chip">Score ${c.score ?? '—'}</span>
      <span class="chip">Coverage ${Math.round(c.coverage * 100)}%</span>
    </div>

    <div class="dsec">
      <h4>Accountability</h4>
      <dl class="kv">
        <dt>Political</dt><dd>${esc(c.minister)}</dd>
        <dt>Administrative</dt><dd>${esc(c.secretary)}</dd>
      </dl>
    </div>

    <div class="dsec">
      <h4>Scorecard breakdown</h4>
      ${Object.values(c.dimensions).map((d) => `
        <div class="driver" style="margin-bottom:12px">
          <div>
            <div class="driver-name">${esc(d.label)} <em>weight ${Math.round(d.weight * 100)}%</em></div>
            <div class="bar"><i class="${d.value == null ? 'bg-gap' : healthBg(
              d.value >= .85 ? 'HEALTHY' : d.value >= .7 ? 'WATCH' : d.value >= .55 ? 'AT_RISK' : 'CRITICAL')}"
              style="width:${d.value == null ? 100 : Math.round(d.value * 100)}%"></i></div>
            <div class="muted" style="font-size:11.5px;margin-top:4px">${esc(d.detail)}</div>
          </div>
          <div class="driver-val ${d.value == null ? 'c-gap' : scoreClass(Math.round(d.value * 100))}">
            ${d.value == null ? 'GAP' : Math.round(d.value * 100)}
          </div>
        </div>`).join('')}
      ${c.score == null ? '<div class="notice warn">Too little of this scorecard is backed by data to produce a score. This is reported as a DATA GAP — it is never shown as good performance.</div>' : ''}
    </div>

    <div class="dsec">
      <h4>Counts</h4>
      <dl class="kv">
        <dt>Total complaints</dt><dd>${c.counts.total}</dd>
        <dt>Open</dt><dd>${c.counts.open}</dd>
        <dt>SLA breached</dt><dd class="c-crit">${c.counts.breached}</dd>
        <dt>At risk</dt><dd class="c-risk">${c.counts.atRisk}</dd>
        <dt>Reopened by citizens</dt><dd class="c-crit">${c.counts.reopened}</dd>
        <dt>Awaiting validation</dt><dd>${c.counts.awaitingCitizen}</dd>
      </dl>
    </div>`);
}

/* ── complaints ───────────────────────────────────────────────────── */
async function loadComplaints() {
  const el = $('#complaints');
  el.innerHTML = '<div class="skeleton">Loading…</div>';
  const q = new URLSearchParams();
  if ($('#q').value.trim()) q.set('q', $('#q').value.trim());
  if ($('#f-sla').value) q.set('sla', $('#f-sla').value);
  if ($('#f-dept').value) q.set('departmentId', $('#f-dept').value);
  try {
    const r = await api(`/complaints${q.toString() ? `?${q}` : ''}`);
    state.complaints = r.data;
    renderComplaints(r.data);
    if (!$('#f-dept').options.length || $('#f-dept').options.length === 1) {
      const depts = [...new Map(r.data.map((c) => [c.departmentId, c.departmentName])).entries()];
      $('#f-dept').innerHTML = '<option value="">All departments</option>' +
        depts.map(([id, n]) => `<option value="${esc(id)}">${esc(n)}</option>`).join('');
    }
  } catch (ex) {
    el.innerHTML = `<div class="empty">${esc(ex.message)}</div>`;
  }
}
['#q', '#f-sla', '#f-dept'].forEach((s) => {
  const el = $(s);
  el.addEventListener(el.tagName === 'INPUT' ? 'input' : 'change', () => {
    clearTimeout(el._t);
    el._t = setTimeout(loadComplaints, 260);
  });
});

function renderComplaints(list) {
  if (!list.length) { $('#complaints').innerHTML = '<div class="empty">No complaints match.</div>'; return; }
  $('#complaints').innerHTML =
    `<div class="trow head"><div>Complaint</div><div>Department</div><div>District</div><div>SLA</div><div>Stage</div></div>` +
    list.map((c, i) => `
      <div class="trow" data-c="${i}">
        <div>
          <div class="t-title">${esc(c.title)}</div>
          <div class="t-sub">${esc(c.citizenRef || '')} · ${esc(c.category)} · ${esc(c.severity)}</div>
        </div>
        <div class="t-sub">${esc(c.departmentShort)}</div>
        <div class="t-sub">${esc(c.district)}</div>
        <div class="t-mono ${slaClass(c.sla.state)}">${c.sla.state === 'BREACHED' ? `+${c.sla.breachHours}h` : c.sla.state}</div>
        <div class="t-sub">${esc(stage(c.stage))}</div>
      </div>`).join('');
  $$('#complaints .trow[data-c]').forEach((el) =>
    el.addEventListener('click', () => openComplaint(list[Number(el.dataset.c)].id)));
}

async function openComplaint(id) {
  openDrawer('<div class="skeleton">Loading complaint…</div>');
  try {
    const r = await api(`/complaints/${id}`);
    const c = r.complaint;
    openDrawer(`
      <h2>${esc(c.title)}</h2>
      <div class="flag-meta" style="margin-bottom:6px">
        <span class="chip">${esc(c.key || c.id)}</span>
        <span class="chip ${slaClass(c.sla.state)}">${esc(c.sla.state)}${c.sla.breachHours ? ` +${c.sla.breachHours}h` : ''}</span>
        <span class="chip">${esc(stage(c.stage))}</span>
      </div>

      <div class="dsec"><h4>Citizen report</h4><p>${esc(c.description) || '<span class="muted">No description.</span>'}</p></div>

      <div class="dsec">
        <h4>Classification</h4>
        <dl class="kv">
          <dt>Department</dt><dd>${esc(c.departmentName)}</dd>
          <dt>Category</dt><dd>${esc(c.category)}</dd>
          <dt>Sentiment</dt><dd>${esc(c.sentiment)}</dd>
          <dt>Confidence</dt><dd>${c.aiConfidence != null ? `${Math.round(c.aiConfidence * 100)}%` : '—'}</dd>
        </dl>
        <p class="muted" style="font-size:12px;margin-top:8px">${esc(r.classification.note)}</p>
      </div>

      <div class="dsec">
        <h4>Accountability at the time of the incident</h4>
        <dl class="kv">
          <dt>Political</dt><dd>${esc(r.accountability.political.holder)}</dd>
          <dt>Administrative</dt><dd>${esc(r.accountability.administrative.holder)}</dd>
          <dt>Assigned officer</dt><dd>${esc(c.assignee ? c.assignee.name : 'Unassigned')}</dd>
        </dl>
      </div>

      <div class="dsec">
        <h4>SLA</h4>
        <dl class="kv">
          <dt>Reported</dt><dd>${c.reportedAt ? new Date(c.reportedAt).toLocaleString() : '—'}</dd>
          <dt>Deadline</dt><dd>${new Date(c.sla.dueAt).toLocaleString()}</dd>
          <dt>State</dt><dd class="${slaClass(c.sla.state)}">${esc(c.sla.state)}</dd>
          <dt>Citizen validation</dt><dd class="${c.satisfaction === 'Unsatisfied' ? 'c-crit' : c.satisfaction === 'Satisfied' ? 'c-ok' : ''}">${esc(c.satisfaction)}</dd>
        </dl>
      </div>

      ${r.timeline.length ? `<div class="dsec"><h4>Timeline</h4>${r.timeline.map((t) => `
        <div class="timeline-item">
          <div>${esc(t.content)}</div>
          <div class="ti-meta">${esc(t.by)} · ${t.at ? new Date(t.at).toLocaleString() : ''}</div>
        </div>`).join('')}</div>` : ''}

      <div class="dsec">
        <h4>Citizen validation</h4>
        ${c.isClosed
          ? '<div class="notice ok">Closed after the citizen confirmed the resolution.</div>'
          : `<p class="muted" style="font-size:12.5px">A department cannot close this complaint on its own. Closure requires the citizen to accept the resolution — administrative closure cannot erase dissatisfaction.</p>
             <div class="actions">
               <button class="btn small" id="fb-yes">Citizen accepts resolution</button>
               <button class="btn small" id="fb-no">Citizen rejects resolution</button>
             </div>`}
      </div>`);

    const submit = async (satisfied) => {
      try {
        const res = await api(`/complaints/${id}/feedback`, {
          method: 'POST',
          body: { satisfied, rating: satisfied ? 5 : 1 },
        });
        toast(res.message, satisfied ? 'ok' : 'bad');
        closeDrawer();
        loadComplaints();
        loadDashboard();
      } catch (ex) { toast(ex.message, 'bad'); }
    };
    if ($('#fb-yes')) $('#fb-yes').addEventListener('click', () => submit(true));
    if ($('#fb-no')) $('#fb-no').addEventListener('click', () => submit(false));
  } catch (ex) {
    openDrawer(`<div class="empty">${esc(ex.message)}</div>`);
  }
}

/* ── directives ───────────────────────────────────────────────────── */
async function loadDirectives() {
  const el = $('#directives');
  el.innerHTML = '<div class="skeleton">Loading…</div>';
  try {
    const r = await api('/directives');
    el.innerHTML = r.data.length
      ? `<div class="trow head"><div>Directive</div><div>Department</div><div>Accountable</div><div>Deadline</div><div>Status</div></div>` +
        r.data.map((d) => `
          <div class="trow">
            <div><div class="t-title">${esc(d.title)}</div><div class="t-sub">${esc(d.objective).slice(0, 110)}</div></div>
            <div class="t-sub">${esc(d.department)}</div>
            <div class="t-sub">${esc(d.accountableAuthority)}</div>
            <div class="t-mono">${esc(d.deadline || '—')}</div>
            <div><span class="pill c-ok">${esc(d.status)}</span></div>
          </div>`).join('')
      : '<div class="empty">No directives yet. Open a red flag on the Command Center to issue one.</div>';
  } catch (ex) {
    el.innerHTML = `<div class="empty">${esc(ex.message)}</div>`;
  }
}

/* ── citizen intake ───────────────────────────────────────────────── */
$('#intake-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button');
  btn.disabled = true; btn.textContent = 'Submitting…';
  try {
    const r = await api('/complaints', {
      method: 'POST',
      body: {
        title: $('#i-title').value.trim(),
        description: $('#i-desc').value.trim(),
        district: $('#i-district').value,
      },
    });
    const cl = r.classification;
    $('#intake-result').innerHTML = `
      <h2>Classification &amp; routing</h2>
      <div class="notice ok">Complaint <b>${esc(r.complaint.key || r.complaint.id)}</b> created in Zoho Projects.</div>
      <dl class="kv">
        <dt>Routed to</dt><dd>${esc(r.complaint.department)}</dd>
        <dt>Category</dt><dd>${esc(cl.category)}</dd>
        <dt>Priority</dt><dd>${esc(cl.severity)}</dd>
        <dt>Sentiment</dt><dd>${esc(cl.sentiment)}</dd>
        <dt>Confidence</dt><dd>${Math.round(cl.confidence * 100)}%</dd>
        <dt>Decision</dt><dd>${esc(cl.routing.replace(/_/g, ' '))}</dd>
        <dt>SLA deadline</dt><dd>${new Date(r.sla.dueAt).toLocaleString()} (${r.sla.resolutionHours}h)</dd>
      </dl>
      <div class="dsec">
        <h4>Why it was routed this way</h4>
        <p style="font-size:12.5px">Matched terms: ${cl.evidence.matchedTerms.length ? cl.evidence.matchedTerms.map((t) => `<span class="chip">${esc(t)}</span>`).join(' ') : '<span class="muted">none</span>'}</p>
        ${cl.evidence.urgencySignals.length ? `<p style="font-size:12.5px">Urgency signals: ${cl.evidence.urgencySignals.map((t) => `<span class="chip">${esc(t)}</span>`).join(' ')}</p>` : ''}
        ${cl.evidence.alternatives.length ? `<p style="font-size:12.5px" class="muted">Alternatives considered: ${cl.evidence.alternatives.map((a) => esc(a.category)).join(', ')}</p>` : ''}
        <p class="muted" style="font-size:12px">The classifier is a deterministic lexicon, not a black box — every routing decision shows the evidence that produced it and can be overridden by an officer.</p>
      </div>`;
    toast('Complaint filed and routed.', 'ok');
    e.target.reset();
    loadDashboard(false);
  } catch (ex) {
    toast(ex.message, 'bad');
  } finally {
    btn.disabled = false; btn.textContent = 'Submit complaint';
  }
});

/* ── boot ─────────────────────────────────────────────────────────── */
(() => {
  const saved = sessionStorage.getItem('tnpc');
  if (saved) {
    try {
      const s = JSON.parse(saved);
      state.token = s.token; state.user = s.user;
      enterApp();
    } catch { /* fall through to login */ }
  }
})();
