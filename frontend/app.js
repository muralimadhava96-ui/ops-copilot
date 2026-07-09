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
  // State
  // ----------------------------------------------------------------
  const state = {
    events: [],
    decisions: [],
    currentEventIndex: 0,
    triggeredEvents: new Set(),
    currentLang: 'en',
    currentFilter: 'all',
    latestDecision: null,
    ws: null,
    wsReconnectTimer: null,
    isProcessing: false,
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
    alertPanel: document.getElementById('alert-panel'),
    wsStatus: document.getElementById('ws-status'),
    toastContainer: document.getElementById('toast-container'),
    srAnnouncements: document.getElementById('sr-announcements'),
    footerEventCount: document.getElementById('footer-event-count'),
    footerDecisions: document.getElementById('footer-decisions'),
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
      resetAlertPanel();
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
    updateAlertPanel(decision);
    updateFooter();

    // Screen reader announcement for critical alerts
    if (decision.risk_level === 'critical') {
      dom.srAnnouncements.textContent =
        `Critical alert: ${decision.recommended_action}`;
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
  // Multilingual Alert Panel
  // ----------------------------------------------------------------

  function updateAlertPanel(decision) {
    if (!decision) return;

    // Update content for all language tabs
    state.latestDecision = decision;
    renderAlertContent(state.currentLang);
  }

  function renderAlertContent(lang) {
    const d = state.latestDecision;
    if (!d) {
      dom.alertPanel.innerHTML = '<span class="alert-empty">No alerts broadcast yet.</span>';
      return;
    }

    let text = '';
    if (lang === 'en') {
      text = d.alert_text_en;
    } else {
      text = (d.alert_translations && d.alert_translations[lang]) || d.alert_text_en;
    }

    dom.alertPanel.textContent = text;
    dom.alertPanel.setAttribute('lang', lang);
  }

  function setupLangTabs() {
    const tabs = document.querySelectorAll('.lang-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.setAttribute('aria-selected', 'false'));
        tab.setAttribute('aria-selected', 'true');
        state.currentLang = tab.dataset.lang;
        dom.alertPanel.setAttribute('aria-labelledby', tab.id);
        renderAlertContent(state.currentLang);
      });

      // Keyboard: arrow keys between tabs
      tab.addEventListener('keydown', (e) => {
        const tabArr = Array.from(tabs);
        const idx = tabArr.indexOf(tab);
        let newIdx = idx;

        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          newIdx = (idx + 1) % tabArr.length;
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          newIdx = (idx - 1 + tabArr.length) % tabArr.length;
        } else if (e.key === 'Home') {
          e.preventDefault();
          newIdx = 0;
        } else if (e.key === 'End') {
          e.preventDefault();
          newIdx = tabArr.length - 1;
        }

        if (newIdx !== idx) {
          tabArr[newIdx].click();
          tabArr[newIdx].focus();
        }
      });
    });
  }

  function resetAlertPanel() {
    dom.alertPanel.innerHTML = '<span class="alert-empty">No alerts broadcast yet.</span>';
    dom.alertPanel.removeAttribute('lang');
    state.currentLang = 'en';
    const tabs = document.querySelectorAll('.lang-tab');
    tabs.forEach(t => t.setAttribute('aria-selected', 'false'));
    document.getElementById('tab-en')?.setAttribute('aria-selected', 'true');
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
      setupLangTabs();
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
