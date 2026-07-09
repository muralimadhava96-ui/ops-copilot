/**
 * Stadium Ops Copilot — Dashboard Application
 *
 * Handles API communication, WebSocket real-time updates,
 * DOM rendering, and user interactions.
 *
 * No external dependencies — pure vanilla JavaScript.
 */

(() => {
  'use strict';

  // ----------------------------------------------------------------
  // Configuration
  // ----------------------------------------------------------------
  const API_BASE = window.location.origin;
  const WS_URL = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`;

  // ----------------------------------------------------------------
  // ----------------------------------------------------------------
  // State
  // ----------------------------------------------------------------
  const DEFAULT_ROSTER = [
    { id: 'M-01', name: 'Commander Marcus Vance', role: 'manager', status: 'available', zone: 'A', specialty: 'Crowd Control' },
    { id: 'M-02', name: 'Chief Sarah Jenkins', role: 'manager', status: 'available', zone: 'B', specialty: 'Emergency Ops' },
    { id: 'M-03', name: 'Director Elena Rostova', role: 'manager', status: 'deployed', zone: 'C', specialty: 'Crisis Comm' },
    { id: 'M-04', name: 'Marshal David Kim', role: 'manager', status: 'available', zone: 'D', specialty: 'Tactical Lead' },
    { id: 'V-01', name: 'Rapid Team Alpha', role: 'volunteer', status: 'deployed', zone: 'A', specialty: 'Crowd Guiding' },
    { id: 'V-02', name: 'Rapid Team Beta', role: 'volunteer', status: 'available', zone: 'A', specialty: 'Crowd Guiding' },
    { id: 'V-03', name: 'Support Team 3', role: 'volunteer', status: 'available', zone: 'B', specialty: 'Info Desk' },
    { id: 'V-04', name: 'Support Team 4', role: 'volunteer', status: 'available', zone: 'B', specialty: 'Info Desk' },
    { id: 'V-05', name: 'Crowd Team 5', role: 'volunteer', status: 'available', zone: 'C', specialty: 'Barrier Control' },
    { id: 'V-06', name: 'Crowd Team 6', role: 'volunteer', status: 'deployed', zone: 'C', specialty: 'Barrier Control' },
    { id: 'V-07', name: 'Medical Unit 1', role: 'volunteer', status: 'available', zone: 'A', specialty: 'First Aid' },
    { id: 'V-08', name: 'Medical Unit 2', role: 'volunteer', status: 'available', zone: 'C', specialty: 'First Aid' },
    { id: 'V-09', name: 'Assist Team 9', role: 'volunteer', status: 'available', zone: 'D', specialty: 'Logistics' },
    { id: 'V-10', name: 'Assist Team 10', role: 'volunteer', status: 'available', zone: 'D', specialty: 'Logistics' },
    { id: 'V-11', name: 'Response Team 11', role: 'volunteer', status: 'deployed', zone: 'B', specialty: 'De-escalation' },
    { id: 'V-12', name: 'Response Team 12', role: 'volunteer', status: 'available', zone: 'D', specialty: 'De-escalation' },
  ];

  const state = {
    events: [],
    decisions: [],
    currentEventIndex: 0,
    triggeredEvents: new Set(),
    currentFilter: 'all',
    latestDecision: null,
    ws: null,
    wsReconnectTimer: null,
    isProcessing: false,
    roster: JSON.parse(JSON.stringify(DEFAULT_ROSTER)),
    rosterSearch: '',
    rosterFilter: 'all',
  };

  // ----------------------------------------------------------------
  // DOM References
  // ----------------------------------------------------------------
  const dom = {
    eventButtons: document.getElementById('event-buttons'),
    btnNext: document.getElementById('btn-next'),
    btnReset: document.getElementById('btn-reset'),
    eventPreview: document.getElementById('event-preview'),
    actionFeed: document.getElementById('action-feed'),
    feedEmpty: document.getElementById('feed-empty'),
    wsStatus: document.getElementById('ws-status'),
    toastContainer: document.getElementById('toast-container'),
    srAnnouncements: document.getElementById('sr-announcements'),
    footerEventCount: document.getElementById('footer-event-count'),
    footerDecisions: document.getElementById('footer-decisions'),
    
    // Dispatcher
    dispatchZone: document.getElementById('dispatch-zone'),
    dispatchIssue: document.getElementById('dispatch-issue'),
    dispatchManager: document.getElementById('dispatch-manager'),
    dispatchVolunteer: document.getElementById('dispatch-volunteer'),
    btnDispatch: document.getElementById('btn-dispatch-action'),
    
    // Roster
    personnelSearch: document.getElementById('personnel-search'),
    managersGrid: document.getElementById('managers-grid'),
    volunteersGrid: document.getElementById('volunteers-grid'),
  };

  // ----------------------------------------------------------------
  // Utilities
  // ----------------------------------------------------------------

  const RISK_ICONS = {
    low: '✓',
    moderate: '⚠',
    high: '⬆',
    critical: '🔴',
  };

  const RISK_LABELS = {
    low: 'LOW',
    moderate: 'MODERATE',
    high: 'HIGH',
    critical: 'CRITICAL',
  };

  const TREND_ARROWS = {
    rising: '↑',
    stable: '→',
    falling: '↓',
  };

  const RISK_COLORS = {
    low: 'var(--risk-low)',
    moderate: 'var(--risk-moderate)',
    high: 'var(--risk-high)',
    critical: 'var(--risk-critical)',
  };

  function densityToRisk(pct) {
    if (pct >= 90) return 'critical';
    if (pct >= 80) return 'high';
    if (pct >= 60) return 'moderate';
    return 'low';
  }

  function formatTime(isoStr) {
    try {
      const d = new Date(isoStr);
      return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return isoStr;
    }
  }

  // ----------------------------------------------------------------
  // Toast Notifications
  // ----------------------------------------------------------------

  function showToast(message, type = 'info', durationMs = 4000) {
    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.textContent = message;
    toast.setAttribute('role', 'alert');
    dom.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, durationMs);
  }

  // ----------------------------------------------------------------
  // API Layer
  // ----------------------------------------------------------------

  async function apiFetch(path, options = {}) {
    try {
      const resp = await fetch(`${API_BASE}${path}`, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
      });
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.detail || `HTTP ${resp.status}`);
      }
      return await resp.json();
    } catch (err) {
      showToast(`API Error: ${err.message}`, 'error');
      throw err;
    }
  }

  async function loadEvents() {
    const data = await apiFetch('/api/events');
    state.events = data.events;
    renderEventButtons();
    updateEventPreview();
  }

  async function triggerEvent(index) {
    if (state.isProcessing) return;
    state.isProcessing = true;

    const btn = dom.btnNext;
    btn.classList.add('btn--loading');
    btn.disabled = true;

    try {
      const data = await apiFetch(`/api/events/${index}/trigger`, { method: 'POST' });
      state.triggeredEvents.add(index);

      // Advance currentEventIndex to the next untriggered event
      while (state.currentEventIndex < state.events.length &&
             state.triggeredEvents.has(state.currentEventIndex)) {
        state.currentEventIndex++;
      }

      // Process decision (WebSocket might also deliver it — dedup by event_id)
      handleDecision(data.decision, data.event);

      updateEventButtons();
      updateEventPreview();
      updateFooter();
      showToast(`Event ${index + 1} processed`, 'success', 2500);
    } catch (err) {
      // Error already shown by apiFetch
    } finally {
      state.isProcessing = false;
      btn.classList.remove('btn--loading');
      btn.disabled = false;
    }
  }

  async function resetDemo() {
    try {
      await apiFetch('/api/decisions', { method: 'DELETE' });
      state.decisions = [];
      state.triggeredEvents.clear();
      state.currentEventIndex = 0;
      state.latestDecision = null;

      // Reset UI
      dom.actionFeed.innerHTML = '';
      dom.actionFeed.appendChild(dom.feedEmpty);
      dom.feedEmpty.style.display = '';
      resetZoneCards();
      resetStadiumMap();
      resetRoster();
      updateEventButtons();
      updateEventPreview();
      updateFooter();
      showToast('Demo reset — all decisions cleared', 'info');
    } catch (err) {
      // Error shown by apiFetch
    }
  }

  // ----------------------------------------------------------------
  // WebSocket
  // ----------------------------------------------------------------

  function connectWebSocket() {
    if (state.ws && state.ws.readyState === WebSocket.OPEN) return;

    try {
      state.ws = new WebSocket(WS_URL);

      state.ws.onopen = () => {
        dom.wsStatus.dataset.connected = 'true';
        dom.wsStatus.textContent = '● Connected';
        dom.wsStatus.setAttribute('aria-label', 'WebSocket connected');
        if (state.wsReconnectTimer) {
          clearTimeout(state.wsReconnectTimer);
          state.wsReconnectTimer = null;
        }
      };

      state.ws.onmessage = (evt) => {
        try {
          const decision = JSON.parse(evt.data);
          // Dedup: skip if we already handled this event_id
          if (!state.decisions.find(d => d.event_id === decision.event_id)) {
            handleDecision(decision);
          }
        } catch {
          // Ignore malformed messages
        }
      };

      state.ws.onclose = () => {
        dom.wsStatus.dataset.connected = 'false';
        dom.wsStatus.textContent = '● Disconnected';
        dom.wsStatus.setAttribute('aria-label', 'WebSocket disconnected');
        // Auto-reconnect after 3 seconds
        state.wsReconnectTimer = setTimeout(connectWebSocket, 3000);
      };

      state.ws.onerror = () => {
        // onclose will fire after onerror
      };
    } catch {
      // WebSocket not available — will use polling fallback (POST responses)
    }
  }

  // ----------------------------------------------------------------
  // Decision Handling
  // ----------------------------------------------------------------

  function handleDecision(decision, event) {
    // Dedup check
    if (state.decisions.find(d => d.event_id === decision.event_id)) return;

    state.decisions.push(decision);
    state.latestDecision = decision;

    // Update all UI panels
    addDecisionToFeed(decision);
    updateZoneFromDecision(decision, event);
    updateStadiumMap(decision);
    updateRosterFromDecision(decision);
    updateFooter();

    // Screen reader announcement for critical alerts
    if (decision.risk_level === 'critical') {
      dom.srAnnouncements.textContent =
        `Critical alert: ${decision.recommended_action}`;
    }
  }

  function updateRosterFromDecision(decision) {
    if (decision.staff_allocation && decision.staff_allocation.length > 0) {
      decision.staff_allocation.forEach(alloc => {
        const role = alloc.role === 'security' ? 'manager' : 'volunteer';
        
        // Find available team of this role in from_zone
        let member = state.roster.find(p => p.role === role && p.zone === alloc.from_zone && p.status === 'available');
        if (!member) {
          // Try to find any available team of this role
          member = state.roster.find(p => p.role === role && p.status === 'available');
        }

        if (member) {
          member.zone = alloc.to_zone;
          member.status = 'deployed';
        }
      });
      renderRoster();
      populateDispatchSelectors();
    }
  }

  // ----------------------------------------------------------------
  // Action Feed Rendering
  // ----------------------------------------------------------------

  function addDecisionToFeed(decision) {
    // Hide empty state
    if (dom.feedEmpty) dom.feedEmpty.style.display = 'none';

    const card = document.createElement('article');
    card.className = 'glass-panel decision-card';
    card.dataset.risk = decision.risk_level;
    card.dataset.hasStaff = (decision.staff_allocation && decision.staff_allocation.length > 0) ? 'true' : 'false';
    card.setAttribute('aria-label',
      `${decision.risk_level} risk decision for zones ${decision.affected_zones.join(', ')}`);

    // Staff allocation HTML
    let staffHtml = '';
    if (decision.staff_allocation && decision.staff_allocation.length > 0) {
      const moves = decision.staff_allocation.map(a =>
        `<span class="staff-move">👤 ${a.count} ${a.role} Zone ${a.from_zone} → ${a.to_zone}</span>`
      ).join('');
      staffHtml = `<div class="decision-staff">${moves}</div>`;
    }

    // Conflict resolution HTML
    let conflictHtml = '';
    if (decision.conflict_resolution) {
      conflictHtml = `<div class="conflict-note">${escapeHtml(decision.conflict_resolution)}</div>`;
    }

    card.innerHTML = `
      <div class="decision-card-header">
        <div class="decision-card-zones">
          <span class="risk-badge risk-badge--${decision.risk_level}" aria-label="Risk: ${RISK_LABELS[decision.risk_level]}">
            ${RISK_ICONS[decision.risk_level]} ${RISK_LABELS[decision.risk_level]}
          </span>
          ${decision.affected_zones.map(z => `<span class="zone-tag">Zone ${z}</span>`).join('')}
        </div>
        <time class="decision-timestamp" datetime="${decision.timestamp}">${formatTime(decision.timestamp)}</time>
      </div>
      <p class="decision-action">${escapeHtml(decision.recommended_action)}</p>
      <p class="decision-reasoning">${escapeHtml(decision.reasoning)}</p>
      ${staffHtml}
      ${conflictHtml}
    `;

    // Prepend (newest first)
    dom.actionFeed.insertBefore(card, dom.actionFeed.firstChild);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  // ----------------------------------------------------------------
  // Zone Card Updates
  // ----------------------------------------------------------------

  function updateZoneFromDecision(decision, event) {
    if (!event && !decision) return;

    const zones = decision.affected_zones || [];
    const eventZone = event ? event.zone_id : (zones[0] || null);
    const density = event ? event.density_percent : null;
    const trend = event ? event.trend : null;

    // Update the primary event zone
    if (eventZone && density !== null) {
      updateZoneCard(eventZone, density, trend, decision.risk_level);
    }

    // Also highlight all affected zones
    zones.forEach(z => {
      if (z !== eventZone) {
        // For non-primary zones, use the decision risk level but don't change density
        highlightZone(z, decision.risk_level);
      }
    });
  }

  function updateZoneCard(zoneId, density, trend, riskLevel) {
    const risk = riskLevel || densityToRisk(density);

    // Density bar
    const fill = document.getElementById(`density-fill-${zoneId}`);
    const pct = document.getElementById(`density-pct-${zoneId}`);
    const bar = fill?.parentElement;

    if (fill) {
      fill.style.width = `${density}%`;
      fill.dataset.level = risk;
    }
    if (pct) pct.textContent = `${Math.round(density)}%`;
    if (bar) {
      bar.setAttribute('aria-valuenow', Math.round(density));
    }

    // Risk badge
    const badge = document.getElementById(`risk-badge-${zoneId}`);
    if (badge) {
      badge.className = `risk-badge risk-badge--${risk}`;
      badge.textContent = `${RISK_ICONS[risk]} ${RISK_LABELS[risk]}`;
      badge.setAttribute('aria-label', `Risk level: ${RISK_LABELS[risk]}`);
    }

    // Trend
    if (trend) {
      const trendIcon = document.getElementById(`trend-icon-${zoneId}`);
      const trendText = document.getElementById(`trend-text-${zoneId}`);
      if (trendIcon) {
        trendIcon.textContent = TREND_ARROWS[trend] || '→';
        trendIcon.className = `trend-icon trend-icon--${trend}`;
        trendIcon.setAttribute('aria-label', `Trend: ${trend}`);
      }
      if (trendText) trendText.textContent = trend.charAt(0).toUpperCase() + trend.slice(1);
    }
  }

  function highlightZone(zoneId, risk) {
    const badge = document.getElementById(`risk-badge-${zoneId}`);
    if (badge) {
      badge.className = `risk-badge risk-badge--${risk}`;
      badge.textContent = `${RISK_ICONS[risk]} ${RISK_LABELS[risk]}`;
      badge.setAttribute('aria-label', `Risk level: ${RISK_LABELS[risk]}`);
    }
  }

  function resetZoneCards() {
    ['A', 'B', 'C', 'D'].forEach(z => {
      updateZoneCard(z, 0, 'stable', 'low');
    });
  }

  // ----------------------------------------------------------------
  // Stadium Map Updates
  // ----------------------------------------------------------------

  function updateStadiumMap(decision) {
    if (!decision) return;

    decision.affected_zones.forEach(z => {
      const path = document.getElementById(`map-zone-${z}`);
      if (path) {
        const color = RISK_COLORS[decision.risk_level] || RISK_COLORS.low;
        path.setAttribute('fill', color);
        path.setAttribute('opacity', decision.risk_level === 'critical' ? '0.6' : '0.45');

        // Flash animation for non-reduced-motion users
        const mq = window.matchMedia('(prefers-reduced-motion: no-preference)');
        if (mq.matches) {
          path.style.animation = 'zoneFlash 0.6s ease-in-out 2';
          setTimeout(() => { path.style.animation = ''; }, 1200);
        }
      }
    });
  }

  function resetStadiumMap() {
    ['A', 'B', 'C', 'D'].forEach(z => {
      const path = document.getElementById(`map-zone-${z}`);
      if (path) {
        path.setAttribute('fill', 'var(--risk-low)');
        path.setAttribute('opacity', '0.35');
      }
    });
  }

  // ----------------------------------------------------------------
  // Personnel Roster & Dispatcher
  // ----------------------------------------------------------------

  function renderRoster() {
    if (!dom.managersGrid || !dom.volunteersGrid) return;

    dom.managersGrid.innerHTML = '';
    dom.volunteersGrid.innerHTML = '';

    const query = state.rosterSearch.toLowerCase().trim();
    const filter = state.rosterFilter; // 'all', 'available', 'deployed'

    const filtered = state.roster.filter(p => {
      // Search matches
      const matchesSearch = p.name.toLowerCase().includes(query) ||
                            p.specialty.toLowerCase().includes(query) ||
                            p.zone.toLowerCase().includes(query) ||
                            p.id.toLowerCase().includes(query);

      // Status filter matches
      const matchesFilter = filter === 'all' || p.status === filter;

      return matchesSearch && matchesFilter;
    });

    filtered.forEach(p => {
      const card = document.createElement('div');
      card.className = `personnel-card ${p.status}`;
      card.innerHTML = `
        <div class="personnel-info">
          <span class="personnel-name">${escapeHtml(p.name)} <span style="font-size: 10px; color: var(--text-muted);">(${p.id})</span></span>
          <span class="personnel-meta">
            <span>📍 Zone ${p.zone}</span>
            <span>🔧 ${escapeHtml(p.specialty)}</span>
          </span>
        </div>
        <span class="personnel-status-badge">
          <span class="status-dot status-dot--${p.status}"></span>
          ${p.status.toUpperCase()}
        </span>
      `;

      if (p.role === 'manager') {
        dom.managersGrid.appendChild(card);
      } else {
        dom.volunteersGrid.appendChild(card);
      }
    });

    // Handle empty roster states
    if (dom.managersGrid.children.length === 0) {
      dom.managersGrid.innerHTML = '<div class="alert-empty" style="padding: 10px 0;">No managers found.</div>';
    }
    if (dom.volunteersGrid.children.length === 0) {
      dom.volunteersGrid.innerHTML = '<div class="alert-empty" style="padding: 10px 0;">No volunteer teams found.</div>';
    }
  }

  function populateDispatchSelectors() {
    if (!dom.dispatchManager || !dom.dispatchVolunteer) return;

    // Save selected values
    const prevManager = dom.dispatchManager.value;
    const prevVolunteer = dom.dispatchVolunteer.value;

    dom.dispatchManager.innerHTML = '<option value="">-- Auto Select --</option>';
    dom.dispatchVolunteer.innerHTML = '<option value="">-- Auto Select Team --</option>';

    state.roster.forEach(p => {
      if (p.status === 'available') {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = `${p.name} (Zone ${p.zone})`;

        if (p.role === 'manager') {
          dom.dispatchManager.appendChild(opt);
        } else {
          dom.dispatchVolunteer.appendChild(opt);
        }
      }
    });

    // Restore previous selection if still available
    if (dom.dispatchManager.querySelector(`option[value="${prevManager}"]`)) {
      dom.dispatchManager.value = prevManager;
    }
    if (dom.dispatchVolunteer.querySelector(`option[value="${prevVolunteer}"]`)) {
      dom.dispatchVolunteer.value = prevVolunteer;
    }
  }

  function handleManualDispatch() {
    const zone = dom.dispatchZone.value;
    const issueVal = dom.dispatchIssue.value;
    const managerId = dom.dispatchManager.value;
    const volunteerId = dom.dispatchVolunteer.value;

    // Find actual entities or auto-assign first available
    let manager = state.roster.find(p => p.id === managerId);
    let volunteer = state.roster.find(p => p.id === volunteerId);

    if (!manager && managerId === '') {
      manager = state.roster.find(p => p.role === 'manager' && p.status === 'available');
    }
    if (!volunteer && volunteerId === '') {
      volunteer = state.roster.find(p => p.role === 'volunteer' && p.status === 'available');
    }

    if (!manager && !volunteer) {
      showToast('All personnel are currently deployed. Cannot dispatch.', 'error');
      return;
    }

    const issueLabels = {
      crowd_surge: 'Crowd Surge Mitigation',
      gate_congest: 'Gate Throughput Assistance',
      medical_emergency: 'Medical First-Response',
      disturbance: 'De-escalation Support',
    };

    const dispatches = [];
    const staffAllocations = [];

    if (manager) {
      manager.status = 'deployed';
      const from = manager.zone;
      manager.zone = zone;
      dispatches.push(`${manager.name} (${manager.id})`);
      staffAllocations.push({
        role: 'security',
        count: 1,
        from_zone: from,
        to_zone: zone,
      });
    }

    if (volunteer) {
      volunteer.status = 'deployed';
      const from = volunteer.zone;
      volunteer.zone = zone;
      dispatches.push(`${volunteer.name} (${volunteer.id})`);
      staffAllocations.push({
        role: 'volunteers',
        count: 1,
        from_zone: from,
        to_zone: zone,
      });
    }

    // Build manual decision card in Feed
    const manualDecision = {
      event_id: `MAN-${Date.now()}`,
      recommended_action: `Manual Dispatch: ${issueLabels[issueVal]} in Zone ${zone}`,
      reasoning: `Manual override triggered by supervisor. Deployed ${dispatches.join(' and ')} to Zone ${zone} to manage active issue.`,
      risk_level: 'moderate',
      affected_zones: [zone],
      staff_allocation: staffAllocations,
      timestamp: new Date().toISOString(),
    };

    handleDecision(manualDecision);
    renderRoster();
    populateDispatchSelectors();
    showToast(`Dispatched resources to Zone ${zone}`, 'success');
  }

  function setupRosterControls() {
    // Search Roster
    dom.personnelSearch?.addEventListener('input', (e) => {
      state.rosterSearch = e.target.value;
      renderRoster();
    });

    // Filter status pills
    const pills = document.querySelectorAll('.filter-pill');
    pills.forEach(pill => {
      pill.addEventListener('click', () => {
        pills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        state.rosterFilter = pill.dataset.filter;
        renderRoster();
      });
    });

    // Dispatch button click
    dom.btnDispatch?.addEventListener('click', handleManualDispatch);
  }

  function resetRoster() {
    state.roster = JSON.parse(JSON.stringify(DEFAULT_ROSTER));
    renderRoster();
    populateDispatchSelectors();
  }

  // ----------------------------------------------------------------
  // Event Buttons
  // ----------------------------------------------------------------

  function renderEventButtons() {
    dom.eventButtons.innerHTML = '';
    state.events.forEach((evt, i) => {
      const btn = document.createElement('button');
      btn.className = 'btn btn-event';
      btn.dataset.index = i;
      btn.dataset.severity = evt.severity;
      btn.textContent = `${i + 1}`;
      btn.setAttribute('aria-label', `Event ${i + 1}: ${evt.title}`);
      btn.title = evt.title;

      btn.addEventListener('click', () => triggerEvent(i));
      dom.eventButtons.appendChild(btn);
    });
  }

  function updateEventButtons() {
    const buttons = dom.eventButtons.querySelectorAll('.btn-event');
    buttons.forEach(btn => {
      const idx = parseInt(btn.dataset.index, 10);
      btn.dataset.triggered = state.triggeredEvents.has(idx) ? 'true' : 'false';
    });

    // Disable "Next" if all events triggered
    dom.btnNext.disabled = state.currentEventIndex >= state.events.length;
  }

  function updateEventPreview() {
    if (state.currentEventIndex < state.events.length) {
      const evt = state.events[state.currentEventIndex];
      dom.eventPreview.textContent = `Next: ${evt.title} (Zone ${evt.zone})`;
    } else {
      dom.eventPreview.textContent = 'All events completed — demo finished.';
    }
  }

  // ----------------------------------------------------------------
  // Event Listeners
  // ----------------------------------------------------------------

  dom.btnNext.addEventListener('click', () => {
    if (state.currentEventIndex < state.events.length) {
      triggerEvent(state.currentEventIndex);
    }
  });

  dom.btnReset.addEventListener('click', resetDemo);

  // ----------------------------------------------------------------
  // Feed Filter Tabs
  // ----------------------------------------------------------------

  function setupFeedFilters() {
    const filterBtns = document.querySelectorAll('.feed-filter-btn');
    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.setAttribute('aria-pressed', 'false'));
        btn.setAttribute('aria-pressed', 'true');
        state.currentFilter = btn.dataset.filter;
        applyFeedFilter();
      });
    });
  }

  function applyFeedFilter() {
    const cards = dom.actionFeed.querySelectorAll('.decision-card');
    let visibleCount = 0;

    cards.forEach(card => {
      let show = true;
      if (state.currentFilter === 'critical') {
        show = card.dataset.risk === 'critical' || card.dataset.risk === 'high';
      } else if (state.currentFilter === 'staff') {
        show = card.dataset.hasStaff === 'true';
      }
      card.style.display = show ? '' : 'none';
      if (show) visibleCount++;
    });

    // Show empty state if no cards match filter
    if (dom.feedEmpty) {
      dom.feedEmpty.style.display = (state.decisions.length === 0 || visibleCount === 0) ? '' : 'none';
      if (state.decisions.length > 0 && visibleCount === 0) {
        dom.feedEmpty.querySelector('.feed-empty-text').textContent =
          `No ${state.currentFilter} decisions yet.`;
      }
    }
  }

  // ----------------------------------------------------------------
  // Footer Counter Updates
  // ----------------------------------------------------------------

  function updateFooter() {
    if (dom.footerEventCount) {
      dom.footerEventCount.textContent = `Events: ${state.triggeredEvents.size}/${state.events.length} triggered`;
    }
    if (dom.footerDecisions) {
      dom.footerDecisions.textContent = `Decisions: ${state.decisions.length}`;
    }
  }

  // ----------------------------------------------------------------
  // Initialization
  // ----------------------------------------------------------------

  async function init() {
    try {
      await loadEvents();
      connectWebSocket();
      setupRosterControls();
      renderRoster();
      populateDispatchSelectors();
      setupFeedFilters();
      updateFooter();
      showToast('Dashboard ready — trigger events to begin', 'info', 3000);
    } catch (err) {
      showToast('Failed to connect to backend. Is the server running?', 'error', 8000);
      dom.eventPreview.textContent = 'Backend unavailable — start the server and refresh.';
    }
  }

  init();
})();
