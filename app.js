/**
 * Stadium Ops Copilot — Dashboard Application
 *
 * Coordinates real-time sensors, incident list selecting, manual resource dispatches,
 * preset alerts, and the interactive Drag-to-Broadcast slider with full keyboard a11y support.
 */

(() => {
  'use strict';

  const API_BASE = window.location.origin;
  const WS_URL = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`;

  // ----------------------------------------------------------------
  // Roster database
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

  const PRESET_ALERTS = {
    shelter: {
      title: 'SHELTER IN PLACE',
      en: 'Attention: Please shelter in place immediately. Await further instructions from stadium personnel.',
      es: 'Atención: Por favor, refúgiese en el lugar de inmediato. Espere instrucciones del personal.',
      fr: 'Attention: Veuillez vous abriter sur place immédiatement. Attendez les instructions du personnel.',
      ar: 'تنبيه: يرجى الاحتماء في مكانكم فوراً. انتظروا المزيد من التعليمات من موظفي الملعب.',
      pt: 'Atenção: Por favor, abrigue-se no local imediatamente. Aguarde instruções dos funcionários.'
    },
    exits: {
      title: 'SEEK EXITS',
      en: 'Phased evacuation active. Please proceed calmly to your nearest emergency exit.',
      es: 'Evacuación controlada activa. Diríjase con calma a la salida de emergencia más cercana.',
      fr: 'Évacuation progressive active. Veuillez vous diriger calmement vers la sortie la plus proche.',
      ar: 'إخلاء تدريجي نشط. يرجى التوجه بهدوء إلى أقرب مخرج طوارئ.',
      pt: 'Evacuação faseada ativa. Por favor, dirija-se calmamente à saída de emergência mais próxima.'
    },
    medical: {
      title: 'MEDICAL INCIDENT',
      en: 'First aid responders are en route. Please clear the area to allow access.',
      es: 'Equipos de primeros auxilios en camino. Por favor, despeje el área para permitir el acceso.',
      fr: 'Les secouristes sont en route. Veuillez libérer la zone pour faciliter l’accès.',
      ar: 'مسعفو الإسعافات الأولية في الطريق. يرجى إخلاء المنطقة لتسهيل الوصول.',
      pt: 'Equipes de primeiros socorros a caminho. Por favor, desobstrua a área para permitir o acesso.'
    },
    concourse: {
      title: 'CLEAR CONCOURSES',
      en: 'Please avoid congregating in concourses. Keep walk pathways clear.',
      es: 'Evite congregarse en los pasillos. Mantenga despejadas las vías de paso.',
      fr: 'Veuillez éviter de vous rassembler dans les halls. Laissez les passages libres.',
      ar: 'يرجى تجنب التجمع في الممرات. حافظوا على خلو مسارات المشي.',
      pt: 'Por favor, evite aglomerações nos corredores. Mantenha os caminhos livres.'
    }
  };

  const INITIAL_INCIDENTS = [
    { id: 'INC-001', zone: 'C', name: 'Turnstile 4 Blockage', severity: 'moderate', meta: 'Detected 4m ago via Cam-C4' },
    { id: 'INC-002', zone: 'C', name: 'Density Threshold Exceeded', severity: 'critical', meta: 'Sector C-Lower • 1m ago' },
    { id: 'INC-003', zone: 'A', name: 'Gate G1 Congestion', severity: 'moderate', meta: 'Queue time > 15 mins' },
    { id: 'INC-004', zone: 'D', name: 'Medical Emergency', severity: 'critical', meta: 'Medical assistance requested at MP2' }
  ];

  // ----------------------------------------------------------------
  // State (Prepopulated with the 3 logs from the Stitch mockup)
  // ----------------------------------------------------------------
  const state = {
    events: [],
    decisions: [
      {
        event_id: 'EVT-MOCK-3',
        recommended_action: 'ROUTINE SWEEP INITIATED',
        reasoning: 'Automated System Check • Zone A',
        risk_level: 'low',
        affected_zones: ['A'],
        timestamp: new Date(Date.now() - 17 * 60 * 1000).toISOString()
      },
      {
        event_id: 'EVT-MOCK-2',
        recommended_action: 'ZONE C DENSITY ALERT (85%)',
        reasoning: 'Auto-detected • Sector C-Lower',
        risk_level: 'high',
        affected_zones: ['C'],
        timestamp: new Date(Date.now() - 4 * 60 * 1000).toISOString()
      },
      {
        event_id: 'EVT-MOCK-1',
        recommended_action: 'UNIT 7 DISPATCHED TO GATE C',
        reasoning: 'Manual Override • Operator: JD-04',
        risk_level: 'critical',
        affected_zones: ['C'],
        timestamp: new Date(Date.now() - 12 * 1000).toISOString()
      }
    ],
    currentEventIndex: 0,
    triggeredEvents: new Set(),
    currentFilter: 'all',
    latestDecision: null,
    ws: null,
    wsReconnectTimer: null,
    isProcessing: false,
    
    // Active UI context
    activeDivision: 'C', // Default zone C to match mockup screenshot
    incidents: JSON.parse(JSON.stringify(INITIAL_INCIDENTS)),
    selectedIncidentId: 'INC-001', // Pre-select Turnstile 4 Blockage to enable Dispatch button on start

    // Roster Status
    roster: JSON.parse(JSON.stringify(DEFAULT_ROSTER)),
    selectedManagerId: null,
    selectedVolunteerId: null,
    modalSearch: '',

    // Density history tracker for the 4 zones
    zoneHistory: {
      A: [20, 25, 30, 42, 50, 60, 68, 70, 75],
      B: [10, 12, 15, 20, 25, 30, 40, 45, 45],
      C: [25, 35, 40, 52, 65, 78, 85, 90, 94], // zone C starts at 94% matching mockup
      D: [12, 15, 18, 22, 28, 35, 40, 50, 60],
    },

    // Broadcast Presets
    activePreset: 'shelter',
    activeLang: 'en',
    sliderValueKeyboard: 0, // for keyboard slider a11y
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
    clockDisplay: document.getElementById('clock-display'),

    // Left Panel Details
    activeZoneTitle: document.getElementById('active-zone-title'),
    activeZoneBadge: document.getElementById('active-zone-badge'),
    activePopulation: document.getElementById('active-population'),
    activeCapacity: document.getElementById('active-capacity'),
    activeDensityPct: document.getElementById('active-density-pct'),
    activeDensityFill: document.getElementById('active-density-fill'),
    activeZoneSparkline: document.getElementById('active-zone-sparkline'),
    activeIncidentsCount: document.getElementById('active-incidents-count'),
    activeIncidentsList: document.getElementById('active-incidents-list'),
    btnDispatchTrigger: document.getElementById('btn-dispatch-trigger'),

    // Map Overlays
    mapZoneBadgeOverlay: document.getElementById('map-zone-badge-overlay'),
    mapZoneBadgeText: document.getElementById('map-zone-badge-text'),

    // Broadcast Alerts
    alertPreviewText: document.getElementById('alert-preview-text'),
    broadcastSliderContainer: document.getElementById('broadcast-slider-container'),
    broadcastSliderFill: document.getElementById('broadcast-slider-fill'),
    broadcastSliderThumb: document.getElementById('broadcast-slider-thumb'),

    // Modal
    dispatchModal: document.getElementById('dispatch-modal'),
    modalTitle: document.getElementById('modal-title'),
    modalSubtitle: document.getElementById('modal-subtitle'),
    modalSuggestions: document.getElementById('modal-suggestions'),
    modalSearchInput: document.getElementById('modal-search-input'),
    modalManagersGrid: document.getElementById('modal-managers-grid'),
    modalVolunteersGrid: document.getElementById('modal-volunteers-grid'),
    btnConfirmDispatch: document.getElementById('btn-confirm-dispatch'),
    btnCancelDispatch: document.getElementById('btn-cancel-dispatch'),
    btnCloseModal: document.getElementById('btn-close-modal'),
  };

  const ZONE_INFO = {
    A: { name: 'North Stand', capacity: 20000, current: 15000 },
    B: { name: 'East Stand', capacity: 18000, current: 8100 },
    C: { name: 'South Stand', capacity: 15000, current: 14203 }, // matching mockup
    D: { name: 'West Stand', capacity: 22500, current: 13500 },
  };

  const RISK_ICONS = { low: '✓', moderate: '⚠️', high: '⚠️', critical: '🚨' };
  const RISK_COLORS = { low: 'var(--risk-low)', moderate: 'var(--risk-moderate)', high: 'var(--risk-high)', critical: 'var(--risk-critical)' };

  // ----------------------------------------------------------------
  // Real-time Clock
  // ----------------------------------------------------------------
  function updateClock() {
    if (dom.clockDisplay) {
      const now = new Date();
      const timeStr = now.toISOString().replace('T', ' ').substring(11, 19) + ' UTC';
      dom.clockDisplay.textContent = timeStr;
    }
  }

  // ----------------------------------------------------------------
  // Toast notifications
  // ----------------------------------------------------------------
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.textContent = message;
    dom.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
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
        throw new Error(`HTTP ${resp.status}`);
      }
      return await resp.json();
    } catch (err) {
      showToast(`API Connection Issue`, 'error');
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
    btn.disabled = true;

    try {
      const data = await apiFetch(`/api/events/${index}/trigger`, { method: 'POST' });
      state.triggeredEvents.add(index);

      while (state.currentEventIndex < state.events.length &&
             state.triggeredEvents.has(state.currentEventIndex)) {
        state.currentEventIndex++;
      }

      handleDecision(data.decision, data.event);
      updateEventButtons();
      updateEventPreview();
      updateFooter();
      showToast(`Event triggered`, 'success');
    } catch (err) {
      // handled
    } finally {
      state.isProcessing = false;
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

      // Reset state
      state.roster = JSON.parse(JSON.stringify(DEFAULT_ROSTER));
      state.incidents = JSON.parse(JSON.stringify(INITIAL_INCIDENTS));
      state.selectedIncidentId = 'INC-001';
      state.zoneHistory = {
        A: [20, 25, 30, 42, 50, 60, 68, 70, 75],
        B: [10, 12, 15, 20, 25, 30, 40, 45, 45],
        C: [25, 35, 40, 52, 65, 78, 85, 90, 94],
        D: [12, 15, 18, 22, 28, 35, 40, 50, 60],
      };

      // Reset UI
      dom.actionFeed.innerHTML = '';
      resetMapAesthetic();
      setActiveDivision('C');
      updateEventButtons();
      updateEventPreview();
      updateFooter();
      showToast('Simulation reset complete', 'info');
    } catch (err) {
      // handled
    }
  }

  // ----------------------------------------------------------------
  // WebSocket setup
  // ----------------------------------------------------------------
  function connectWebSocket() {
    if (state.ws && state.ws.readyState === WebSocket.OPEN) return;

    try {
      state.ws = new WebSocket(WS_URL);
      state.ws.onopen = () => {
        dom.wsStatus.dataset.connected = 'true';
        dom.wsStatus.textContent = '● Connected';
        if (state.wsReconnectTimer) {
          clearTimeout(state.wsReconnectTimer);
          state.wsReconnectTimer = null;
        }
      };

      state.ws.onmessage = (evt) => {
        try {
          const decision = JSON.parse(evt.data);
          if (!state.decisions.find(d => d.event_id === decision.event_id)) {
            handleDecision(decision);
          }
        } catch {}
      };

      state.ws.onclose = () => {
        dom.wsStatus.dataset.connected = 'false';
        dom.wsStatus.textContent = '● Disconnected';
        state.wsReconnectTimer = setTimeout(connectWebSocket, 3000);
      };
    } catch {}
  }

  // ----------------------------------------------------------------
  // Core Decision Broadcast Receiver
  // ----------------------------------------------------------------
  function handleDecision(decision, event) {
    if (state.decisions.find(d => d.event_id === decision.event_id)) return;

    state.decisions.push(decision);
    state.latestDecision = decision;

    // 1. Process dynamic density update
    if (event && event.zone_id && event.density_percent !== undefined) {
      const zid = event.zone_id.toUpperCase();
      if (state.zoneHistory[zid]) {
        const val = Math.round(event.density_percent);
        state.zoneHistory[zid].push(val);
        if (state.zoneHistory[zid].length > 15) {
          state.zoneHistory[zid].shift();
        }
        ZONE_INFO[zid].current = Math.round((val / 100) * ZONE_INFO[zid].capacity);

        // Append incident if critical or high
        if (val >= 85) {
          const exists = state.incidents.find(i => i.zone === zid && i.name.includes('Threshold'));
          if (!exists) {
            state.incidents.push({
              id: `INC-${Date.now()}`,
              zone: zid,
              name: 'Density Threshold Exceeded',
              severity: val >= 90 ? 'critical' : 'moderate',
              meta: `Sector ${zid}-Lower • 1m ago`
            });
          }
        }
      }
    }

    // 2. Process manager / volunteer state modifications
    if (decision.staff_allocation && decision.staff_allocation.length > 0) {
      decision.staff_allocation.forEach(alloc => {
        const role = alloc.role === 'security' ? 'manager' : 'volunteer';
        let member = state.roster.find(p => p.role === role && p.zone === alloc.from_zone && p.status === 'available');
        if (!member) {
          member = state.roster.find(p => p.role === role && p.status === 'available');
        }
        if (member) {
          member.zone = alloc.to_zone;
          member.status = 'deployed';
        }
      });
    }

    addDecisionToFeed(decision);
    updateMapAesthetics(decision, event);
    
    // Refresh view
    setActiveDivision(state.activeDivision);
    updateFooter();

    if (decision.risk_level === 'critical') {
      dom.srAnnouncements.textContent = `Alert: ${decision.recommended_action}`;
    }
  }

  // ----------------------------------------------------------------
  // Action Feed Log Card
  // ----------------------------------------------------------------
  function addDecisionToFeed(decision) {
    if (dom.feedEmpty) dom.feedEmpty.style.display = 'none';

    const card = document.createElement('div');
    card.className = 'decision-card';
    card.dataset.risk = decision.risk_level;
    card.dataset.hasStaff = (decision.staff_allocation && decision.staff_allocation.length > 0) ? 'true' : 'false';

    const timestampStr = decision.timestamp ? formatTime(decision.timestamp) : new Date().toLocaleTimeString();

    card.innerHTML = `
      <div class="decision-card-header">
        <div class="decision-card-zones">[${timestampStr}] ${decision.affected_zones.map(z => `Zone ${z}`).join(' / ')}</div>
      </div>
      <p class="decision-action">${escapeHtml(decision.recommended_action)}</p>
      <p class="decision-reasoning">${escapeHtml(decision.reasoning)}</p>
    `;

    dom.actionFeed.insertBefore(card, dom.actionFeed.firstChild);
  }

  // ----------------------------------------------------------------
  // Active Division View Updates (Left Column Details & sparkline)
  // ----------------------------------------------------------------
  function updateActiveZoneDetails() {
    const zid = state.activeDivision;
    const info = ZONE_INFO[zid];
    const history = state.zoneHistory[zid];
    const currentDensity = history[history.length - 1] || 0;
    const riskLvl = densityToRisk(currentDensity);

    dom.activeZoneTitle.textContent = `ZONE ${zid}`;
    
    dom.activeZoneBadge.className = `risk-badge risk-badge--${riskLvl}`;
    dom.activeZoneBadge.textContent = `${RISK_ICONS[riskLvl]} ${riskLvl.toUpperCase()}`;

    dom.activePopulation.textContent = info.current.toLocaleString();
    dom.activeCapacity.textContent = `/ ${info.capacity.toLocaleString()}`;

    dom.activeDensityPct.textContent = `${currentDensity}%`;
    dom.activeDensityFill.style.width = `${currentDensity}%`;
    dom.activeDensityFill.style.background = RISK_COLORS[riskLvl];

    // Redraw Mini Sparkline Trend Graph
    drawMiniSparkline(history);

    // Filter and display active incidents for this zone
    renderActiveIncidentsList(zid);
  }

  function drawMiniSparkline(history) {
    const width = 240;
    const height = 80;
    const maxVal = 100;
    const pointsCount = history.length;

    const coords = history.map((val, index) => {
      const x = (index / (pointsCount - 1)) * width;
      const y = height - 5 - ((val / maxVal) * (height - 20));
      return { x, y };
    });

    let linePath = `M ${coords[0].x} ${coords[0].y}`;
    for (let i = 1; i < coords.length; i++) {
      const prev = coords[i - 1];
      const curr = coords[i];
      const cpX = prev.x + (curr.x - prev.x) / 2;
      linePath += ` C ${cpX} ${prev.y}, ${cpX} ${curr.y}, ${curr.x} ${curr.y}`;
    }

    const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`;

    const areaEl = dom.activeZoneSparkline.querySelector('.sparkline-area');
    const lineEl = dom.activeZoneSparkline.querySelector('.sparkline-line');

    if (areaEl) areaEl.setAttribute('d', areaPath);
    if (lineEl) lineEl.setAttribute('d', linePath);
  }

  function renderActiveIncidentsList(zoneId) {
    dom.activeIncidentsList.innerHTML = '';
    const zoneIncidents = state.incidents.filter(i => i.zone === zoneId);
    
    dom.activeIncidentsCount.textContent = zoneIncidents.length;

    if (zoneIncidents.length === 0) {
      dom.activeIncidentsList.innerHTML = '<div class="alert-empty" style="padding: 15px 0;">No active incidents reported.</div>';
      dom.btnDispatchTrigger.disabled = true;
      return;
    }

    zoneIncidents.forEach(inc => {
      const item = document.createElement('div');
      item.className = 'incident-item';
      if (inc.id === state.selectedIncidentId) item.classList.add('selected');
      
      const icon = inc.severity === 'critical' ? '🔴' : '⚠️';

      item.innerHTML = `
        <span class="incident-icon">${icon}</span>
        <div class="incident-details">
          <span class="incident-name">${escapeHtml(inc.name)}</span>
          <span class="incident-meta">${escapeHtml(inc.meta)}</span>
        </div>
      `;

      item.addEventListener('click', () => {
        state.selectedIncidentId = state.selectedIncidentId === inc.id ? null : inc.id;
        renderActiveIncidentsList(zoneId);
        dom.btnDispatchTrigger.disabled = state.selectedIncidentId === null;
      });

      dom.activeIncidentsList.appendChild(item);
    });
  }

  // ----------------------------------------------------------------
  // Interactive Map Aesthetics & Hover Badge
  // ----------------------------------------------------------------
  function updateMapAesthetics(decision, event) {
    if (!decision) return;
    decision.affected_zones.forEach(z => {
      const path = document.getElementById(`map-zone-${z}`);
      if (path) {
        path.className.baseVal = `zone-arc arc-${decision.risk_level}`;
      }
    });
  }

  function resetMapAesthetic() {
    ['A', 'B', 'C', 'D'].forEach(z => {
      const path = document.getElementById(`map-zone-${z}`);
      if (path) {
        path.className.baseVal = `zone-arc arc-nominal`;
      }
    });
  }

  function setActiveDivision(zoneId) {
    state.activeDivision = zoneId;
    state.selectedIncidentId = null;

    // Reset path outlines
    ['A', 'B', 'C', 'D'].forEach(z => {
      const path = document.getElementById(`map-zone-${z}`);
      if (path) path.classList.remove('active-division');
    });

    const activePath = document.getElementById(`map-zone-${zoneId}`);
    if (activePath) activePath.classList.add('active-division');

    // Update floating badge coordinates and content over the active path
    const info = ZONE_INFO[zoneId];
    const history = state.zoneHistory[zoneId];
    const currentDensity = history[history.length - 1] || 0;
    const riskLvl = densityToRisk(currentDensity);

    if (riskLvl !== 'low' && dom.mapZoneBadgeOverlay) {
      dom.mapZoneBadgeOverlay.style.display = '';
      dom.mapZoneBadgeOverlay.className = `map-overlay-badge risk-badge--${riskLvl}`;
      
      // Position badge close to the active SVG path
      if (zoneId === 'A') { dom.mapZoneBadgeOverlay.style.top = '15%'; dom.mapZoneBadgeOverlay.style.left = '50%'; }
      else if (zoneId === 'B') { dom.mapZoneBadgeOverlay.style.top = '50%'; dom.mapZoneBadgeOverlay.style.left = '75%'; }
      else if (zoneId === 'C') { dom.mapZoneBadgeOverlay.style.top = '80%'; dom.mapZoneBadgeOverlay.style.left = '50%'; }
      else if (zoneId === 'D') { dom.mapZoneBadgeOverlay.style.top = '50%'; dom.mapZoneBadgeOverlay.style.left = '25%'; }

      dom.mapZoneBadgeText.textContent = `${RISK_ICONS[riskLvl]} ${riskLvl.toUpperCase()}`;
    } else if (dom.mapZoneBadgeOverlay) {
      dom.mapZoneBadgeOverlay.style.display = 'none';
    }

    updateActiveZoneDetails();
  }

  function setupMapClickHandlers() {
    ['A', 'B', 'C', 'D'].forEach(z => {
      const path = document.getElementById(`map-zone-${z}`);
      if (path) {
        path.addEventListener('click', () => setActiveDivision(z));
      }
    });
  }

  // ----------------------------------------------------------------
  // Supervisor Dispatch Modal Dialog
  // ----------------------------------------------------------------
  function openDispatchModal(incidentId) {
    const incident = state.incidents.find(i => i.id === incidentId);
    // fallback to feed decision if triggered via card button
    let title = 'Manual Incident';
    let subtitle = `Dispatch override for Division ${state.activeDivision}`;
    let zone = state.activeDivision;

    if (incident) {
      title = incident.name;
      subtitle = incident.meta;
      zone = incident.zone;
    } else {
      const dec = state.decisions.find(d => d.event_id === incidentId);
      if (dec) {
        title = dec.recommended_action;
        subtitle = dec.reasoning;
        zone = dec.affected_zones[0] || state.activeDivision;
      }
    }

    state.activeIncidentId = incidentId;
    state.selectedManagerId = null;
    state.selectedVolunteerId = null;
    state.modalSearch = '';

    dom.modalTitle.textContent = `Dispatch response to ${title}`;
    dom.modalSubtitle.textContent = `${subtitle} (Target: Zone ${zone})`;
    if (dom.modalSearchInput) dom.modalSearchInput.value = '';

    renderModalRoster();
    generateSmartSuggestions(title, zone);

    dom.dispatchModal.setAttribute('aria-hidden', 'false');
    dom.dispatchModal.classList.add('active');
    updateConfirmBtnState();
  }

  function closeDispatchModal() {
    dom.dispatchModal.setAttribute('aria-hidden', 'true');
    dom.dispatchModal.classList.remove('active');
    state.activeIncidentId = null;
    state.selectedManagerId = null;
    state.selectedVolunteerId = null;
  }

  function generateSmartSuggestions(title, zone) {
    dom.modalSuggestions.innerHTML = '';
    const descLower = title.toLowerCase();

    // Recommendation rules
    let suggestedManager = state.roster.find(p => p.role === 'manager' && p.status === 'available' && p.zone === zone);
    if (!suggestedManager) {
      if (descLower.includes('medical')) {
        suggestedManager = state.roster.find(p => p.role === 'manager' && p.status === 'available' && p.specialty.includes('Emergency'));
      } else {
        suggestedManager = state.roster.find(p => p.role === 'manager' && p.status === 'available');
      }
    }

    let suggestedVolunteer = state.roster.find(p => p.role === 'volunteer' && p.status === 'available' && p.zone === zone);
    if (!suggestedVolunteer) {
      if (descLower.includes('medical')) {
        suggestedVolunteer = state.roster.find(p => p.role === 'volunteer' && p.status === 'available' && p.specialty.includes('First Aid'));
      } else if (descLower.includes('congest') || descLower.includes('surge') || descLower.includes('block')) {
        suggestedVolunteer = state.roster.find(p => p.role === 'volunteer' && p.status === 'available' && p.specialty.includes('Crowd') || p.specialty.includes('Barrier'));
      } else {
        suggestedVolunteer = state.roster.find(p => p.role === 'volunteer' && p.status === 'available');
      }
    }

    const suggestions = [];
    if (suggestedManager) suggestions.push({ ...suggestedManager, reason: `Located in Zone ${suggestedManager.zone} (Fastest Arrival)` });
    if (suggestedVolunteer) suggestions.push({ ...suggestedVolunteer, reason: `Matches specialty / Available` });

    if (suggestions.length === 0) {
      dom.modalSuggestions.innerHTML = '<div class="alert-empty">All suggested units are deployed.</div>';
      return;
    }

    suggestions.forEach(s => {
      const card = document.createElement('div');
      card.className = 'suggested-card';
      card.dataset.id = s.id;
      card.innerHTML = `
        <div>
          <span class="suggested-badge">${s.role} matches</span>
          <div class="personnel-name" style="margin-top: 4px;">${escapeHtml(s.name)}</div>
          <span class="personnel-meta">📍 Zone ${s.zone} | 🔧 ${s.specialty}</span>
        </div>
        <div style="text-align: right;">
          <span style="font-size: var(--font-xs); color: var(--accent); display: block; margin-bottom: 2px;">${s.reason}</span>
          <span class="status-dot status-dot--available"></span>
        </div>
      `;

      card.addEventListener('click', () => {
        if (s.role === 'manager') {
          selectManager(s.id);
        } else {
          selectVolunteer(s.id);
        }
      });
      dom.modalSuggestions.appendChild(card);
    });
  }

  function selectManager(id) {
    state.selectedManagerId = state.selectedManagerId === id ? null : id;
    const cards = dom.modalSuggestions.querySelectorAll('.suggested-card');
    cards.forEach(c => {
      const cId = c.dataset.id;
      const r = state.roster.find(p => p.id === cId);
      if (r && r.role === 'manager') {
        c.classList.toggle('selected', cId === state.selectedManagerId);
      }
    });
    renderModalRoster();
    updateConfirmBtnState();
  }

  function selectVolunteer(id) {
    state.selectedVolunteerId = state.selectedVolunteerId === id ? null : id;
    const cards = dom.modalSuggestions.querySelectorAll('.suggested-card');
    cards.forEach(c => {
      const cId = c.dataset.id;
      const r = state.roster.find(p => p.id === cId);
      if (r && r.role === 'volunteer') {
        c.classList.toggle('selected', cId === state.selectedVolunteerId);
      }
    });
    renderModalRoster();
    updateConfirmBtnState();
  }

  function renderModalRoster() {
    dom.modalManagersGrid.innerHTML = '';
    dom.modalVolunteersGrid.innerHTML = '';
    const query = state.modalSearch.toLowerCase().trim();

    state.roster.forEach(p => {
      const matchesSearch = p.name.toLowerCase().includes(query) ||
                            p.specialty.toLowerCase().includes(query) ||
                            p.zone.toLowerCase().includes(query) ||
                            p.id.toLowerCase().includes(query);
      if (!matchesSearch) return;

      const isSelected = p.id === state.selectedManagerId || p.id === state.selectedVolunteerId;
      const card = document.createElement('div');
      card.className = `personnel-card ${p.status}`;
      if (isSelected) card.classList.add('selected');
      if (p.status === 'deployed') card.classList.add('deployed');

      card.innerHTML = `
        <div class="personnel-info">
          <span class="personnel-name">${escapeHtml(p.name)} <span style="font-size: 10px; color: var(--text-muted);">(${p.id})</span></span>
          <span class="personnel-meta">📍 Zone ${p.zone} | 🔧 ${p.specialty}</span>
        </div>
        <span class="personnel-status-badge">
          <span class="status-dot status-dot--${p.status}"></span>
          ${p.status.toUpperCase()}
        </span>
      `;

      if (p.status === 'available') {
        card.addEventListener('click', () => {
          if (p.role === 'manager') {
            selectManager(p.id);
          } else {
            selectVolunteer(p.id);
          }
        });
      }

      if (p.role === 'manager') {
        dom.modalManagersGrid.appendChild(card);
      } else {
        dom.modalVolunteersGrid.appendChild(card);
      }
    });
  }

  function updateConfirmBtnState() {
    dom.btnConfirmDispatch.disabled = !(state.selectedManagerId || state.selectedVolunteerId);
  }

  function confirmDispatch() {
    const zone = state.activeDivision;
    const dispatches = [];

    const manager = state.roster.find(p => p.id === state.selectedManagerId);
    if (manager) {
      manager.status = 'deployed';
      manager.zone = zone;
      dispatches.push(`${manager.name} (${manager.id})`);
    }

    const volunteer = state.roster.find(p => p.id === state.selectedVolunteerId);
    if (volunteer) {
      volunteer.status = 'deployed';
      volunteer.zone = zone;
      dispatches.push(`${volunteer.name} (${volunteer.id})`);
    }

    // Remove dispatched incident from lists
    state.incidents = state.incidents.filter(i => i.id !== state.activeIncidentId);

    // Build log card with exact timestamps
    const manualDecision = {
      event_id: `MAN-${Date.now()}`,
      recommended_action: `UNIT DISPATCHED TO GATE ${zone}`,
      reasoning: `Manual Override • Operator assigned ${dispatches.join(' & ')} to Zone ${zone}`,
      risk_level: 'critical',
      affected_zones: [zone],
      staff_allocation: [],
      timestamp: new Date().toISOString()
    };

    handleDecision(manualDecision);
    closeDispatchModal();
    showToast(`Resources dispatched to Zone ${zone}`, 'success');
  }

  // ----------------------------------------------------------------
  // Preset Alerts & Drag to Broadcast Slider
  // ----------------------------------------------------------------
  function selectPresetAlert(presetName) {
    state.activePreset = presetName;

    // Reset button style
    document.querySelectorAll('.alert-preset-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.preset === presetName);
    });

    renderAlertPreview();
  }

  function selectLanguageTab(lang) {
    state.activeLang = lang;

    document.querySelectorAll('.lang-tab').forEach(tab => {
      tab.setAttribute('aria-selected', tab.dataset.lang === lang ? 'true' : 'false');
    });

    renderAlertPreview();
  }

  function renderAlertPreview() {
    const alert = PRESET_ALERTS[state.activePreset];
    if (alert && dom.alertPreviewText) {
      dom.alertPreviewText.textContent = `"${alert[state.activeLang] || alert['en']}"`;
    }
  }

  function setupSliderBroadcast() {
    const slider = dom.broadcastSliderThumb;
    const container = dom.broadcastSliderContainer;
    const fill = dom.broadcastSliderFill;

    if (!slider || !container) return;

    let isDragging = false;
    let startX = 0;
    
    function getMaxDrag() {
      return container.clientWidth - slider.clientWidth - 4;
    }

    function onDragStart(e) {
      isDragging = true;
      startX = (e.type === 'touchstart') ? e.touches[0].clientX : e.clientX;
      slider.style.transition = 'none';
      if (fill) fill.style.transition = 'none';
    }

    function onDragMove(e) {
      if (!isDragging) return;
      const clientX = (e.type === 'touchmove') ? e.touches[0].clientX : e.clientX;
      let diff = clientX - startX;
      const maxDrag = getMaxDrag();
      
      if (diff < 0) diff = 0;
      if (diff > maxDrag) diff = maxDrag;

      slider.style.transform = `translateX(${diff}px)`;
      const pct = (diff / maxDrag) * 100;
      slider.setAttribute('aria-valuenow', Math.round(pct));
      if (fill) {
        fill.style.width = `${pct}%`;
      }
    }

    function onDragEnd(e) {
      if (!isDragging) return;
      isDragging = false;

      const clientX = (e.type === 'touchend') ? e.changedTouches[0].clientX : e.clientX;
      const diff = clientX - startX;
      const maxDrag = getMaxDrag();

      if (diff >= maxDrag * 0.9) {
        triggerBroadcastAlert();
      }

      resetSliderVisuals();
    }

    function resetSliderVisuals() {
      state.sliderValueKeyboard = 0;
      slider.setAttribute('aria-valuenow', 0);
      slider.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)';
      slider.style.transform = 'translateX(0px)';
      if (fill) {
        fill.style.transition = 'width 0.3s ease';
        fill.style.width = '0%';
      }
    }

    slider.addEventListener('mousedown', onDragStart);
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragEnd);

    slider.addEventListener('touchstart', onDragStart);
    document.addEventListener('touchmove', onDragMove);
    document.addEventListener('touchend', onDragEnd);

    // Keyboard support for accessibility (Arrow keys)
    slider.addEventListener('keydown', (e) => {
      let val = state.sliderValueKeyboard;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
        val = Math.min(100, val + 10);
        e.preventDefault();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
        val = Math.max(0, val - 10);
        e.preventDefault();
      } else {
        return;
      }

      state.sliderValueKeyboard = val;
      slider.setAttribute('aria-valuenow', val);
      
      const maxDrag = getMaxDrag();
      const offset = (val / 100) * maxDrag;
      slider.style.transform = `translateX(${offset}px)`;
      if (fill) fill.style.width = `${val}%`;

      if (val === 100) {
        setTimeout(() => {
          triggerBroadcastAlert();
          resetSliderVisuals();
        }, 150);
      }
    });
  }

  function triggerBroadcastAlert() {
    const alert = PRESET_ALERTS[state.activePreset];
    if (!alert) return;

    const manualDecision = {
      event_id: `BCST-${Date.now()}`,
      recommended_action: `STADIUM ALERT BROADCASTED`,
      reasoning: `Operational Alert [${alert.title}] successfully transmitted to digital signage and PA announcers in Zone ${state.activeDivision}. Broadcast language pool: ${state.activeLang.toUpperCase()}`,
      risk_level: 'critical',
      affected_zones: [state.activeDivision],
      staff_allocation: [],
      timestamp: new Date().toISOString()
    };

    handleDecision(manualDecision);
    showToast('Alert broadcast transmission complete', 'success');
  }

  // ----------------------------------------------------------------
  // Feed Filters
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
        show = card.textContent.includes('DISPATCH') || card.textContent.includes('Manual');
      }
      card.style.display = show ? '' : 'none';
      if (show) visibleCount++;
    });

    if (dom.feedEmpty) {
      dom.feedEmpty.style.display = (state.decisions.length === 0 || visibleCount === 0) ? '' : 'none';
    }
  }

  // ----------------------------------------------------------------
  // Footer state counter labels
  // ----------------------------------------------------------------
  function updateFooter() {
    if (dom.footerEventCount) {
      dom.footerEventCount.textContent = `Events: ${state.triggeredEvents.size}/${state.events.length} triggered`;
    }
    if (dom.footerDecisions) {
      dom.footerDecisions.textContent = `Decisions: ${state.decisions.length}`;
    }
  }

  function renderEventButtons() {
    dom.eventButtons.innerHTML = '';
    state.events.forEach((evt, i) => {
      const btn = document.createElement('button');
      btn.className = 'btn-event';
      btn.dataset.index = i;
      btn.textContent = `EVT-${i + 1}`;
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
  }

  function updateEventPreview() {
    if (state.currentEventIndex < state.events.length) {
      const evt = state.events[state.currentEventIndex];
      dom.eventPreview.textContent = `Next Event: ${evt.title} (Zone ${evt.zone})`;
    } else {
      dom.eventPreview.textContent = 'All events completed.';
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  // ----------------------------------------------------------------
  // Initialization & Event registrations
  // ----------------------------------------------------------------
  function setupEvents() {
    // Left panel dispatch trigger
    dom.btnDispatchTrigger?.addEventListener('click', () => {
      if (state.selectedIncidentId) {
        openDispatchModal(state.selectedIncidentId);
      }
    });

    // Preset alerts selector clicks
    document.querySelectorAll('.alert-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => selectPresetAlert(btn.dataset.preset));
    });

    // Language tabs clicks
    document.querySelectorAll('.lang-tab').forEach(tab => {
      tab.addEventListener('click', () => selectLanguageTab(tab.dataset.lang));
    });

    // Modal Close handlers
    dom.btnCloseModal?.addEventListener('click', closeDispatchModal);
    dom.btnCancelDispatch?.addEventListener('click', closeDispatchModal);
    dom.btnConfirmDispatch?.addEventListener('click', confirmDispatch);

    dom.modalSearchInput?.addEventListener('input', (e) => {
      state.modalSearch = e.target.value;
      renderModalRoster();
    });

    // Close modal on escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && dom.dispatchModal.classList.contains('active')) {
        closeDispatchModal();
      }
    });

    // Demo reset button
    dom.btnReset?.addEventListener('click', resetDemo);
  }

  async function init() {
    try {
      setInterval(updateClock, 1000);
      updateClock();

      await loadEvents();
      connectWebSocket();
      setupMapClickHandlers();
      setupEvents();
      setupSliderBroadcast();
      setupFeedFilters();

      // Configure preset alert initial values
      selectPresetAlert('shelter');
      selectLanguageTab('en');

      // Default active division is Zone C matching Stitch screenshot
      setActiveDivision('C');
      
      // Manually force Turnstile 4 Blockage to show up selected in the rendering
      state.selectedIncidentId = 'INC-001';
      renderActiveIncidentsList('C');

      updateFooter();
      showToast('Ops Copilot initialized.', 'info');
    } catch (err) {
      dom.eventPreview.textContent = 'Backend connection issue. Is backend started?';
    }
  }

  init();
})();
