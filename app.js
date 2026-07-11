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
    btnClearFeed: document.getElementById('btn-clear-feed'),
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
    broadcastSliderContainer: document.getElementById('broadcast-slider-wrapper'),
    broadcastSliderFill: document.getElementById('broadcast-slider-fill'),
    broadcastSliderText: document.getElementById('broadcast-slider-text'),
    broadcastSliderThumb: document.getElementById('broadcast-slider-thumb'),
    broadcastAbortOverlay: document.getElementById('broadcast-abort-overlay'),
    broadcastCountdownText: document.getElementById('broadcast-countdown-text'),
    btnAbortBroadcast: document.getElementById('btn-abort-broadcast'),

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

    // Personnel header counter
    availCount: document.getElementById('avail-count'),
    deployedCount: document.getElementById('deployed-count'),
  };

  const ZONE_INFO = {
    A: { name: 'North Stand', capacity: 20000, current: 15000 },
    B: { name: 'East Stand', capacity: 18000, current: 8100 },
    C: { name: 'South Stand', capacity: 15000, current: 14203 }, // matching mockup
    D: { name: 'West Stand', capacity: 22500, current: 13500 },
  };

  const RISK_ICONS = { low: '✓', moderate: '⚠️', high: '⚠️', critical: '🚨' };
  const RISK_COLORS = { low: '#10B981', moderate: '#F59E0B', high: '#F59E0B', critical: '#EF4444' };

  // ----------------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------------
  function densityToRisk(pct) {
    if (pct >= 90) return 'critical';
    if (pct >= 80) return 'high';
    if (pct >= 60) return 'moderate';
    return 'low';
  }

  function formatTime(isoStr) {
    try {
      const d = new Date(isoStr);
      return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    } catch {
      return '--:--:--';
    }
  }

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
    if (!API_BASE) {
      if (path === '/api/events') {
        return {
          events: [
            { id: "EVT-001", zone: "A", title: "gate_congestion", severity: "high" },
            { id: "EVT-002", zone: "B", title: "match_event", severity: "low" },
            { id: "EVT-003", zone: "D", title: "medical_emergency", severity: "critical" },
            { id: "EVT-004", zone: "C", title: "halftime_concourse_crush", severity: "critical" },
            { id: "EVT-005", zone: "A", title: "turnstile_malfunction", severity: "high" },
            { id: "EVT-006", zone: "B", title: "post_match_egress", severity: "moderate" }
          ]
        };
      }
      if (path === '/api/audit') return { logs: [] };
      if (path.includes('/trigger')) {
         return {
           event: { zone_id: 'A', density_percent: 85 },
           decision: {
             event_id: `MOCK-${Date.now()}`,
             recommended_action: 'STATIC MOCK DISPATCH',
             reasoning: 'System running in UI-only static mode',
             risk_level: 'moderate',
             affected_zones: ['A'],
             timestamp: new Date().toISOString()
           }
         };
      }
      return {};
    }

    try {
      const resp = await fetch(`${API_BASE}${path}`, {
        headers: { 
          'Content-Type': 'application/json',
          'x-api-key': 'OPS-COPILOT-2026'
        },
        ...options,
      });
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }
      return await resp.json();
    } catch (err) {
      // Only show error toast if we actually expected a backend
      if (API_BASE) showToast(`API Connection Issue`, 'error');
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
        if (dom.wsStatus) {
          dom.wsStatus.dataset.connected = 'true';
          dom.wsStatus.innerHTML = '<div class="w-2 h-2 rounded-full bg-status-success animate-pulse"></div><span class="text-status-success text-sm font-bold tracking-wider">CONNECTED</span>';
          dom.wsStatus.className = 'flex items-center gap-2 bg-status-success/10 px-4 py-1.5 rounded-full border border-status-success/20';
        }
        if (state.wsReconnectTimer) {
          clearTimeout(state.wsReconnectTimer);
          state.wsReconnectTimer = null;
        }
      };

      state.ws.onmessage = (evt) => {
        try {
          const payload = JSON.parse(evt.data);
          
          if (payload.type === 'emergency_state') {
            handleEmergencyState(payload.data);
          } else if (payload.type === 'decision') {
            const decision = payload.data;
            if (!state.decisions.find(d => d.event_id === decision.event_id)) {
              handleDecision(decision);
            }
          } else {
            // Fallback for old payloads (just in case)
            if (!state.decisions.find(d => d.event_id === payload.event_id)) {
              handleDecision(payload);
            }
          }
        } catch {}
      };

      state.ws.onclose = () => {
        if (dom.wsStatus) {
          dom.wsStatus.dataset.connected = 'false';
          dom.wsStatus.innerHTML = '<div class="w-2 h-2 rounded-full bg-status-danger animate-pulse shadow-neon-danger"></div><span class="text-status-danger text-sm font-bold tracking-wider">OFFLINE</span>';
          dom.wsStatus.className = 'flex items-center gap-2 bg-status-danger/10 px-4 py-1.5 rounded-full border border-status-danger/20';
        }
        state.wsReconnectTimer = setTimeout(connectWebSocket, 3000);
      };
    } catch {}
  }

  // ----------------------------------------------------------------
  // Emergency State Handling
  // ----------------------------------------------------------------
  function handleEmergencyState(emergencyState) {
    if (emergencyState.current_level > 0) {
      document.body.classList.add('border-4', 'border-status-danger', 'box-border');
      const scramBtn = document.getElementById('btn-scram-trigger');
      if (scramBtn) {
        scramBtn.innerHTML = '<span class="material-symbols-outlined">shield_lock</span> RECOVER SCRAM';
        scramBtn.classList.remove('bg-status-danger', 'hover:bg-red-600');
        scramBtn.classList.add('bg-status-warning', 'hover:bg-yellow-600', 'text-black');
        scramBtn.onclick = recoverScram;
      }
      showToast(`SCRAM LEVEL ${emergencyState.current_level} ACTIVATED`, 'error');
    } else {
      document.body.classList.remove('border-4', 'border-status-danger', 'box-border');
      const scramBtn = document.getElementById('btn-scram-trigger');
      if (scramBtn) {
        scramBtn.innerHTML = '<span class="material-symbols-outlined">warning</span> SYSTEM SCRAM';
        scramBtn.classList.add('bg-status-danger', 'hover:bg-red-600');
        scramBtn.classList.remove('bg-status-warning', 'hover:bg-yellow-600', 'text-black');
        scramBtn.onclick = openScramModal;
      }
      showToast('System Recovered. AI Autonomy Restored.', 'success');
    }
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

    if (state.currentFilter !== 'audit') {
      addDecisionToFeed(decision);
    }
    updateMapAesthetics(decision, event);
    
    // Refresh view
    setActiveDivision(state.activeDivision);
    updateFooter();

    if (decision.risk_level === 'critical') {
      dom.srAnnouncements.textContent = `Alert: ${decision.recommended_action}`;
    }

    // Update personnel summary in header
    updatePersonnelSummary();
  }

  // ----------------------------------------------------------------
  // Action Feed Log Card
  // ----------------------------------------------------------------
  function addDecisionToFeed(decision) {
    if (dom.feedEmpty) dom.feedEmpty.style.display = 'none';

    const card = document.createElement('div');
    card.dataset.risk = decision.risk_level;
    card.dataset.hasStaff = (decision.staff_allocation && decision.staff_allocation.length > 0) ? 'true' : 'false';

    const timestampStr = decision.timestamp ? formatTime(decision.timestamp) : new Date().toLocaleTimeString('en-US', { hour12: false });
    
    const isCritical = decision.risk_level === 'critical';
    const borderClass = isCritical ? 'border-l-status-danger' : (decision.risk_level === 'high' ? 'border-l-status-warning' : 'border-l-primary');
    const textClass = isCritical ? 'text-status-danger' : (decision.risk_level === 'high' ? 'text-status-warning' : 'text-primary');

    card.className = `glass-panel p-4 rounded-panel bg-white/5 border border-white/10 border-l-4 ${borderClass} hover:bg-white/10 transition-all group cursor-pointer`;
    
    card.innerHTML = `
      <div class="flex justify-between items-center mb-1">
        <span class="${textClass} text-xs font-bold font-mono">${timestampStr}</span>
        ${decision.confidence_score ? `<span class="bg-white/10 px-2 py-0.5 rounded text-[10px] font-mono text-white opacity-80 border border-white/10" title="AI Confidence Score">CONF: ${decision.confidence_score}%</span>` : ''}
      </div>
      <p class="text-sm text-white font-bold uppercase tracking-wider">${escapeHtml(decision.recommended_action)}</p>
      <p class="text-xs text-muted mt-1 font-medium mb-2">${escapeHtml(decision.reasoning)}</p>
      
      ${decision.mission_objective ? `
        <div class="mt-2 p-2 bg-white/5 rounded border border-white/10">
          <p class="text-[10px] text-muted uppercase tracking-wider mb-1">Operational Model:</p>
          <p class="text-xs text-white/90 mb-1"><span class="text-white/50">Objective:</span> ${escapeHtml(decision.mission_objective)}</p>
          <p class="text-xs text-white/90"><span class="text-white/50">Expected Outcome:</span> ${escapeHtml(decision.expected_outcome)}</p>
        </div>
      ` : ''}
      
      ${decision.predicted_effects && Object.keys(decision.predicted_effects).length > 0 ? `
        <div class="mt-2 pt-2 border-t border-white/5">
          <p class="text-[10px] text-muted uppercase tracking-wider mb-1">Digital Twin Forecast:</p>
          <div class="grid grid-cols-2 gap-1">
            ${Object.entries(decision.predicted_effects).map(([key, val]) => `
              <div class="text-[10px]"><span class="text-white/50">${escapeHtml(key)}:</span> <span class="text-white/90">${escapeHtml(val)}</span></div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      ${decision.alternatives && decision.alternatives.length > 0 ? `
        <div class="mt-2 pt-2 border-t border-white/5">
          <p class="text-[10px] text-muted uppercase tracking-wider mb-1">Rejected Alternatives:</p>
          <ul class="list-disc list-inside text-xs text-muted/70">
            ${decision.alternatives.map(alt => `<li>${escapeHtml(alt)}</li>`).join('')}
          </ul>
        </div>
      ` : ''}
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
    
    dom.activeZoneBadge.className = `px-3 py-1 text-xs font-bold rounded border flex items-center gap-1 ${
      riskLvl === 'critical' ? 'bg-status-danger/20 text-status-danger border-status-danger/30' :
      (riskLvl === 'high' || riskLvl === 'moderate' ? 'bg-status-warning/20 text-status-warning border-status-warning/30' : 
      'bg-status-success/20 text-status-success border-status-success/30')
    }`;
    dom.activeZoneBadge.innerHTML = `<span class="material-symbols-outlined text-sm">${riskLvl === 'low' ? 'check_circle' : 'warning'}</span> ${riskLvl.toUpperCase()}`;

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
    if (!dom.activeIncidentsList) return;
    dom.activeIncidentsList.innerHTML = '';
    const zoneIncidents = state.incidents.filter(i => i.zone === zoneId);
    
    if (dom.activeIncidentsCount) {
      dom.activeIncidentsCount.textContent = zoneIncidents.length;
    }

    if (zoneIncidents.length === 0) {
      dom.activeIncidentsList.innerHTML = '<div class="text-sm text-muted p-4">No active incidents reported.</div>';
      if (dom.btnDispatchTrigger) dom.btnDispatchTrigger.disabled = true;
      return;
    }

    zoneIncidents.forEach(inc => {
      const item = document.createElement('div');
      
      const isSelected = inc.id === state.selectedIncidentId;
      const isCritical = inc.severity === 'critical';
      const borderClass = isCritical ? 'border-l-status-danger' : 'border-l-status-warning';
      const selectClass = isSelected ? 'bg-white/10 border-primary' : '';
      
      item.className = `glass-panel p-4 rounded-panel border-l-4 ${borderClass} ${selectClass} flex gap-4 items-start hover:bg-white/5 transition-colors cursor-pointer`;
      
      const iconText = isCritical ? 'error' : 'warning';
      const iconColor = isCritical ? 'text-status-danger' : 'text-status-warning';

      item.innerHTML = `
        <span class="material-symbols-outlined ${iconColor} text-xl">${iconText}</span>
        <div>
          <p class="text-sm text-white font-bold mb-1">${escapeHtml(inc.name)}</p>
          <p class="text-xs text-muted">${escapeHtml(inc.meta)}</p>
        </div>
      `;

      item.addEventListener('click', () => {
        state.selectedIncidentId = state.selectedIncidentId === inc.id ? null : inc.id;
        renderActiveIncidentsList(zoneId);
        if (dom.btnDispatchTrigger) dom.btnDispatchTrigger.disabled = state.selectedIncidentId === null;
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

    // Check for gate specifics
    const combinedText = ((event && event.description) || '') + ' ' + (decision.recommended_action || '') + ' ' + (decision.reasoning || '');
    const gateMatch = combinedText.match(/\b(G[1-4]|Turnstile [1-4])\b/i);
    
    if (gateMatch) {
      let gateId = gateMatch[1].toUpperCase();
      if (gateId.startsWith('TURNSTILE')) {
        gateId = 'G' + gateId.replace('TURNSTILE ', '');
      }
      
      const gateEl = document.getElementById(`gate-${gateId}`);
      if (gateEl) {
        gateEl.classList.add('animate-ping', 'stroke-status-danger');
        gateEl.setAttribute('r', '12');
        gateEl.style.transformOrigin = 'center';
      }
    }
  }

  function resetMapAesthetic() {
    ['A', 'B', 'C', 'D'].forEach(z => {
      const path = document.getElementById(`map-zone-${z}`);
      if (path) {
        path.className.baseVal = `zone-arc arc-nominal`;
      }
    });
    
    ['G1', 'G2', 'G3', 'G4'].forEach(g => {
      const gateEl = document.getElementById(`gate-${g}`);
      if (gateEl) {
        gateEl.classList.remove('animate-ping', 'stroke-status-danger');
        gateEl.setAttribute('r', '6');
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
    
    const getTradeoff = (person) => {
      const remaining = state.roster.filter(p => p.role === person.role && p.zone === person.zone && p.status === 'available' && p.id !== person.id).length;
      return remaining === 0 
        ? `<span class="text-status-danger font-bold uppercase tracking-wider">⚠ Warning: Leaves Zone ${person.zone} with 0 available ${person.role}s</span>`
        : `Leaves Zone ${person.zone} with ${remaining} available ${person.role}s`;
    };

    const getETA = (person) => {
      let baseEta = 5;
      if (person.zone === zone) baseEta = 2;
      else baseEta = Math.floor(Math.random() * 5) + 8; // 8-12 mins for cross-zone
      
      const history = state.zoneHistory[zone];
      const targetDensity = history ? history[history.length - 1] : 50;
      
      let densityPenalty = 0;
      if (targetDensity > 90) densityPenalty = 10;
      else if (targetDensity > 70) densityPenalty = 5;
      
      return baseEta + densityPenalty;
    };

    if (suggestedManager) {
      const conf = Math.floor(Math.random() * 15) + 80;
      const eta = getETA(suggestedManager);
      suggestions.push({ 
        ...suggestedManager, 
        reason: `<div class="flex flex-col gap-1"><span class="font-bold text-primary">✓ ETA: ${eta} mins (Zone ${suggestedManager.zone})</span><span>${getTradeoff(suggestedManager)}</span></div>`,
        conf
      });
    }
    
    if (suggestedVolunteer) {
      const conf = Math.floor(Math.random() * 15) + 70;
      const eta = getETA(suggestedVolunteer);
      suggestions.push({ 
        ...suggestedVolunteer, 
        reason: `<div class="flex flex-col gap-1"><span class="font-bold text-primary">✓ ETA: ${eta} mins (Matches Specialty)</span><span>${getTradeoff(suggestedVolunteer)}</span></div>`,
        conf
      });
    }

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
          <div class="flex items-center gap-2">
            <span class="suggested-badge">${s.role} matches</span>
            <span class="bg-primary/20 text-primary px-1.5 py-0.5 rounded text-[10px] font-mono border border-primary/30">CONF: ${s.conf}%</span>
          </div>
          <div class="personnel-name" style="margin-top: 4px;">${escapeHtml(s.name)}</div>
          <span class="personnel-meta">📍 Zone ${s.zone} | 🔧 ${s.specialty}</span>
        </div>
        <div style="text-align: right;">
          <span style="font-size: var(--font-xs); color: var(--text-muted); display: block; margin-bottom: 2px;">${s.reason}</span>
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

  async function confirmDispatch() {
    const zone = state.activeDivision;
    const dispatches = [];
    const roles = [];

    const manager = state.roster.find(p => p.id === state.selectedManagerId);
    if (manager) {
      manager.status = 'deployed';
      manager.zone = zone;
      dispatches.push(`${manager.name} (${manager.id})`);
      roles.push(manager.role);
    }

    const volunteer = state.roster.find(p => p.id === state.selectedVolunteerId);
    if (volunteer) {
      volunteer.status = 'deployed';
      volunteer.zone = zone;
      dispatches.push(`${volunteer.name} (${volunteer.id})`);
      roles.push(volunteer.role);
    }
    
    // Server-Authoritative Check
    const remaining = state.roster.filter(p => p.status === 'available').length;
    
    try {
      const resp = await fetch(`${API_BASE}/api/dispatch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': 'OPS-COPILOT-2026'
        },
        body: JSON.stringify({ zone, roles, remaining_reserve: remaining })
      });
      
      if (!resp.ok) {
        const errorData = await resp.json();
        throw new Error(errorData.detail || 'Dispatch rejected by Server Router');
      }

      // If approved, update UI
      state.incidents = state.incidents.filter(i => i.id !== state.activeIncidentId);

      const manualDecision = {
        event_id: `MAN-${Date.now()}`,
        recommended_action: `UNIT DISPATCHED TO ZONE ${zone}`,
        reasoning: `Manual Override [Operator ID: CMD-Alpha] • Assigned ${dispatches.join(' & ')} to Zone ${zone}`,
        risk_level: 'critical',
        affected_zones: [zone],
        staff_allocation: [],
        timestamp: new Date().toISOString()
      };

      handleDecision(manualDecision);
      closeDispatchModal();
      showToast(`Resources dispatched to Zone ${zone}`, 'success');
      updatePersonnelSummary();
      
    } catch (err) {
      // Revert local optimistic update
      if (manager) manager.status = 'available';
      if (volunteer) volunteer.status = 'available';
      showToast(`Dispatch Failed: ${err.message}`, 'error');
    }
  }

  // ----------------------------------------------------------------
  // Preset Alerts & Drag to Broadcast Slider
  // ----------------------------------------------------------------
  function selectPresetAlert(presetName) {
    state.activePreset = presetName;

    const presetGrid = document.getElementById('alert-preset-grid');
    if (presetGrid) {
      presetGrid.querySelectorAll('button').forEach(btn => {
        if (btn.dataset.preset === presetName) {
           btn.className = "glass-panel p-3 rounded-lg text-xs font-bold text-white hover:bg-white/10 transition-colors border-primary/30 bg-primary/10 text-left uppercase";
        } else {
           btn.className = "glass-panel p-3 rounded-lg text-xs font-bold text-muted hover:bg-white/10 transition-colors text-left uppercase";
        }
      });
    }

    renderAlertPreview();
  }

  function selectLanguageTab(lang) {
    state.activeLang = lang;

    const langContainer = document.getElementById('lang-tabs');
    if (langContainer) {
      langContainer.querySelectorAll('button').forEach(tab => {
        if (tab.dataset.lang === lang) {
          tab.className = "px-4 py-1.5 bg-primary text-background-dark rounded-full text-xs font-bold";
        } else {
          tab.className = "px-4 py-1.5 bg-white/5 hover:bg-white/10 text-muted rounded-full text-xs font-bold border border-white/10 transition-colors";
        }
      });
    }

    renderAlertPreview();
  }

  function renderAlertPreview() {
    const alert = PRESET_ALERTS[state.activePreset];
    if (alert && dom.alertPreviewText) {
      dom.alertPreviewText.textContent = `"${alert[state.activeLang] || alert['en']}"`;
    }
  }

  let broadcastTimer = null;
  let broadcastCountdown = 3;

  function resetBroadcastSlider() {
    const nativeSlider = document.getElementById('broadcastSlider');
    nativeSlider.value = 0;
    
    // Hide overlay
    if (dom.broadcastAbortOverlay) {
      dom.broadcastAbortOverlay.style.opacity = '0';
      dom.broadcastAbortOverlay.style.pointerEvents = 'none';
    }
    
    // Reset wrapper style
    if (dom.broadcastSliderContainer) {
      dom.broadcastSliderContainer.classList.remove('bg-status-success/20', 'border-status-success');
    }
    
    if (dom.broadcastSliderText) {
      dom.broadcastSliderText.innerHTML = 'DRAG TO BROADCAST <span class="material-symbols-outlined text-lg ml-2 animate-pulse">double_arrow</span>';
      dom.broadcastSliderText.classList.add('text-status-danger', 'opacity-60');
      dom.broadcastSliderText.classList.remove('text-status-success', 'opacity-100');
    }

    if (broadcastTimer) {
      clearInterval(broadcastTimer);
      broadcastTimer = null;
    }
  }

  function setupSliderBroadcast() {
    const nativeSlider = document.getElementById('broadcastSlider');
    if (nativeSlider) {
      const onRelease = () => {
        if (nativeSlider.value >= 85) {
          nativeSlider.value = 100;
          
          if (broadcastTimer) return; // Prevent double trigger
          
          // Show overlay and start countdown
          if (dom.broadcastAbortOverlay) {
            dom.broadcastAbortOverlay.style.opacity = '1';
            dom.broadcastAbortOverlay.style.pointerEvents = 'auto';
          }
          
          broadcastCountdown = 3;
          if (dom.broadcastCountdownText) dom.broadcastCountdownText.textContent = broadcastCountdown;
          
          broadcastTimer = setInterval(() => {
            broadcastCountdown--;
            if (dom.broadcastCountdownText) dom.broadcastCountdownText.textContent = broadcastCountdown;
            
            if (broadcastCountdown <= 0) {
              clearInterval(broadcastTimer);
              broadcastTimer = null;
              
              // Hide overlay, show success state
              if (dom.broadcastAbortOverlay) {
                dom.broadcastAbortOverlay.style.opacity = '0';
                dom.broadcastAbortOverlay.style.pointerEvents = 'none';
              }
              
              if (dom.broadcastSliderText) {
                dom.broadcastSliderText.innerHTML = 'BROADCAST ACTIVE';
                dom.broadcastSliderText.classList.remove('text-status-danger', 'opacity-60');
                dom.broadcastSliderText.classList.add('text-status-success', 'opacity-100');
              }
              if (dom.broadcastSliderContainer) {
                dom.broadcastSliderContainer.classList.add('bg-status-success/20', 'border-status-success');
              }
              
              triggerBroadcastAlert();
              
              setTimeout(resetBroadcastSlider, 3000);
            }
          }, 1000);
        } else {
          nativeSlider.value = 0;
        }
      };
      
      nativeSlider.addEventListener('mouseup', onRelease);
      nativeSlider.addEventListener('touchend', onRelease);
      
      // Abort handlers
      if (dom.btnAbortBroadcast) {
        dom.btnAbortBroadcast.addEventListener('click', () => {
          if (broadcastTimer) {
            handleDecision({
              event_id: `ABT-${Date.now()}`,
              recommended_action: `BROADCAST ABORTED`,
              reasoning: `Manual Override [Operator ID: CMD-Alpha] • Operator cancelled broadcast transmission prior to execution.`,
              risk_level: 'moderate',
              affected_zones: [state.activeDivision],
              staff_allocation: [],
              timestamp: new Date().toISOString()
            });
            showToast('Broadcast aborted', 'info');
            resetBroadcastSlider();
          }
        });
      }

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && broadcastTimer) {
          dom.btnAbortBroadcast.click();
        }
      });
    }
  }

  function triggerBroadcastAlert() {
    const alert = PRESET_ALERTS[state.activePreset];
    if (!alert) return;

    const manualDecision = {
      event_id: `BCST-${Date.now()}`,
      recommended_action: `STADIUM ALERT BROADCASTED`,
      reasoning: `Manual Override [Operator ID: CMD-Alpha] • Operational Alert [${alert.title}] successfully transmitted to digital signage and PA announcers in Zone ${state.activeDivision}. Broadcast language pool: ${state.activeLang.toUpperCase()}`,
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
        filterBtns.forEach(b => {
          b.setAttribute('aria-pressed', 'false');
          b.className = 'feed-filter-btn flex-1 py-2 text-xs font-bold text-muted hover:text-white transition-colors rounded';
        });
        btn.setAttribute('aria-pressed', 'true');
        btn.className = 'feed-filter-btn flex-1 py-2 text-xs font-bold bg-white/10 text-white rounded shadow-sm';
        state.currentFilter = btn.dataset.filter;
        applyFeedFilter();
      });
    });
  }

  async function applyFeedFilter() {
    if (state.currentFilter === 'audit') {
      try {
        const data = await apiFetch('/api/audit');
        dom.actionFeed.innerHTML = '';
        
        if (data.logs.length === 0) {
          dom.actionFeed.innerHTML = '<div class="text-center text-muted p-4">No operational audit logs</div>';
          return;
        }

        data.logs.slice().reverse().forEach(log => {
          const card = document.createElement('div');
          card.className = `glass-panel p-4 rounded-panel bg-black/50 border border-white/20 hover:bg-white/5 transition-all mb-3`;
          const ts = new Date(log.timestamp).toLocaleTimeString('en-US', { hour12: false });
          card.innerHTML = `
            <div class="flex justify-between items-center mb-2 border-b border-white/10 pb-2">
              <span class="text-muted text-xs font-bold font-mono">${escapeHtml(log.event_id)}</span>
              <span class="text-white text-xs font-bold font-mono">${ts}</span>
            </div>
            <div class="flex items-center gap-2 mb-2">
              <span class="material-symbols-outlined text-status-warning text-sm">verified_user</span>
              <span class="text-xs font-bold text-status-warning uppercase tracking-wider">${escapeHtml(log.action)}</span>
            </div>
            <p class="text-sm text-white font-medium mb-1">${escapeHtml(log.reason)}</p>
            <div class="flex justify-between mt-2 text-xs text-muted">
              <span>Op: ${escapeHtml(log.operator_id)}</span>
              <span>State: ${log.previous_state} → ${log.new_state}</span>
            </div>
          `;
          dom.actionFeed.appendChild(card);
        });
      } catch (err) {
        showToast('Failed to load audit log', 'error');
      }
      return;
    }

    // Rebuild standard action feed
    dom.actionFeed.innerHTML = '<div id="feed-empty" style="display:none;" class="text-center text-muted p-4">No recent actions</div>';
    dom.feedEmpty = document.getElementById('feed-empty');
    state.decisions.forEach(d => addDecisionToFeed(d));

    const cards = dom.actionFeed.querySelectorAll('[data-risk]');
    let visibleCount = 0;

    cards.forEach(card => {
      let show = true;
      if (state.currentFilter === 'critical') {
        show = card.dataset.risk === 'critical' || card.dataset.risk === 'high';
      } else if (state.currentFilter === 'staff') {
        show = card.textContent.includes('DISPATCH') || card.textContent.includes('Manual') || card.dataset.hasStaff === 'true';
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
    if (!dom.eventButtons) return;
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
    if (!dom.eventButtons) return;
    const buttons = dom.eventButtons.querySelectorAll('.btn-event');
    buttons.forEach(btn => {
      const idx = parseInt(btn.dataset.index, 10);
      btn.dataset.triggered = state.triggeredEvents.has(idx) ? 'true' : 'false';
    });
  }

  function updateEventPreview() {
    if (!dom.eventPreview) return;
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
  // SCRAM Modal Logic
  // ----------------------------------------------------------------
  window.openScramModal = function() {
    const modal = document.getElementById('scram-modal');
    const input = document.getElementById('scram-confirm-input');
    const btnExecute = document.getElementById('btn-execute-scram');
    
    // Reset modal state
    input.value = '';
    btnExecute.disabled = true;
    document.querySelectorAll('input[name="scram_level"]').forEach(r => r.checked = false);
    
    modal.classList.remove('opacity-0', 'pointer-events-none');
    
    input.oninput = (e) => {
      const levelSelected = document.querySelector('input[name="scram_level"]:checked');
      btnExecute.disabled = !(e.target.value === 'SCRAM' && levelSelected);
    };
    
    document.querySelectorAll('input[name="scram_level"]').forEach(r => {
      r.onchange = () => {
        btnExecute.disabled = !(input.value === 'SCRAM' && r.checked);
      };
    });
  };

  window.closeScramModal = function() {
    document.getElementById('scram-modal').classList.add('opacity-0', 'pointer-events-none');
  };

  window.executeScram = async function() {
    const levelSelected = document.querySelector('input[name="scram_level"]:checked');
    if (!levelSelected) return;
    
    if (!API_BASE) {
      // Simulate SCRAM for Static Github Pages Demo
      const levelNum = parseInt(levelSelected.value);
      const riskLevel = levelNum >= 3 ? 'critical' : 'high';
      
      const manualDecision = {
        event_id: `SCRAM-${Date.now()}`,
        recommended_action: `SYSTEM SCRAM LEVEL ${levelNum} INITIATED`,
        reasoning: `Manual Override [Operator ID: CMD-Alpha] • Emergency lockdown protocols engaged. AI auto-responses suspended.`,
        mission_objective: 'Absolute Containment',
        expected_outcome: 'All operations frozen pending manual review',
        risk_level: riskLevel,
        affected_zones: ['A', 'B', 'C', 'D'],
        staff_allocation: [],
        timestamp: new Date().toISOString()
      };
      handleDecision(manualDecision);
      
      document.body.classList.add('border-8', 'border-status-danger', 'box-border');
      if (dom.wsStatus) dom.wsStatus.innerHTML = `<span class="material-symbols-outlined text-white animate-pulse">crisis_alert</span><span class="text-white text-sm font-bold tracking-wider">SCRAM ACTIVE</span>`;
      if (dom.wsStatus) dom.wsStatus.classList.replace('bg-status-danger/10', 'bg-status-danger');
      if (dom.footerStatus) dom.footerStatus.textContent = `SCRAM LEVEL ${levelNum}`;
      if (dom.footerStatus) dom.footerStatus.classList.replace('text-status-success', 'text-status-danger');
      
      closeScramModal();
      showToast(`SCRAM LEVEL ${levelNum} ENGAGED`, 'warning');
      return;
    }

    try {
      const resp = await fetch(`${API_BASE}/api/emergency/scram`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': 'OPS-COPILOT-2026'
        },
        body: JSON.stringify({ level: parseInt(levelSelected.value), operator_id: 'CMD-Alpha' })
      });
      if (resp.ok) {
        closeScramModal();
      } else {
        throw new Error('Server rejected SCRAM');
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  window.recoverScram = async function() {
    if (!API_BASE) {
      document.body.classList.remove('border-8', 'border-status-danger', 'box-border');
      if (dom.wsStatus) dom.wsStatus.innerHTML = `<div class="w-2 h-2 rounded-full bg-status-danger animate-pulse shadow-neon-danger"></div><span class="text-status-danger text-sm font-bold tracking-wider">LIVE</span>`;
      if (dom.wsStatus) dom.wsStatus.classList.replace('bg-status-danger', 'bg-status-danger/10');
      if (dom.footerStatus) dom.footerStatus.textContent = `NOMINAL`;
      if (dom.footerStatus) dom.footerStatus.classList.replace('text-status-danger', 'text-status-success');
      showToast('System recovered from SCRAM', 'success');
      return;
    }

    try {
      const resp = await fetch(`${API_BASE}/api/emergency/recover`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': 'OPS-COPILOT-2026'
        }
      });
      if (!resp.ok) {
        const errData = await resp.json();
        throw new Error(errData.detail || 'Recovery failed');
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

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

    // Clear feed trigger
    dom.btnClearFeed?.addEventListener('click', () => {
      state.decisions = [];
      applyFeedFilter();
      showToast('Action feed cleared', 'info');
    });

    // Quick action buttons for bottleneck response
    document.querySelectorAll('.quick-action-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        const zone = state.activeDivision;
        
        if (action === 'lock-gate') {
          btn.disabled = true;
          executeMultiStageLock(zone, btn);
          return;
        }

        const QUICK_ACTION_MAP = {
          'open-overflow': { action: `OVERFLOW GATES OPENED — ZONE ${zone}`, reasoning: `Manual Override [Operator ID: CMD-Alpha] • Emergency gate capacity expanded to relieve bottleneck at Zone ${zone} entry points`, level: 'high' },
          'reverse-flow': { action: `CROWD FLOW REVERSED — ZONE ${zone}`, reasoning: `Manual Override [Operator ID: CMD-Alpha] • Pedestrian flow direction reversed at Zone ${zone} concourse to redistribute density`, level: 'high' },
          'deploy-barriers': { action: `BARRIERS DEPLOYED — ZONE ${zone}`, reasoning: `Manual Override [Operator ID: CMD-Alpha] • Physical crowd barriers activated at Zone ${zone} chokepoints for flow separation`, level: 'moderate' },
        };
        const info = QUICK_ACTION_MAP[action];
        if (!info) return;

        const quickDecision = {
          event_id: `QA-${Date.now()}`,
          recommended_action: info.action,
          reasoning: info.reasoning,
          mission_objective: 'Crowd redistribution',
          expected_outcome: 'Pressure equalized',
          predicted_effects: { 'Adjacent Sector': '+15% capacity' },
          risk_level: info.level,
          affected_zones: [zone],
          staff_allocation: [],
          timestamp: new Date().toISOString()
        };
        handleDecision(quickDecision);
        
        // Visual feedback on button
        btn.classList.add('ring-2', 'ring-primary/50');
        setTimeout(() => btn.classList.remove('ring-2', 'ring-primary/50'), 1500);
        
        showToast(`${info.action}`, 'success');
      });
    });

  function simulateMomentum(zone) {
    if (!state.zoneHistory[zone]) return;
    
    // Simulate crowd inertia pushing against closed gates over the next few seconds
    let spikes = [5, 3, 2]; // density bumps
    let delay = 0;
    
    spikes.forEach(bump => {
      delay += 1000;
      setTimeout(() => {
        const history = state.zoneHistory[zone];
        const current = history[history.length - 1] || 50;
        const newVal = Math.min(100, current + bump);
        handleDecision({
          event_id: `INERTIA-${Date.now()}`,
          recommended_action: `DENSITY SURGE: ZONE ${zone}`,
          reasoning: `Crowd Momentum Effect • Residual pressure building due to blocked flow.`,
          mission_objective: 'Monitor bottleneck',
          expected_outcome: 'Density stabilization pending',
          risk_level: 'critical',
          affected_zones: [zone],
          timestamp: new Date().toISOString()
        }, { zone_id: zone, density_percent: newVal });
      }, delay);
    });
  }

  function executeMultiStageLock(zone, btn) {
    const sequence = [
      { delay: 0, action: `RESTRICTED ENTRY — ZONE ${zone}`, reason: `Stage 1/4: Admissions slowed.` },
      { delay: 1500, action: `EXIT ONLY — ZONE ${zone}`, reason: `Stage 2/4: Turnstiles reversed.` },
      { delay: 3000, action: `REROUTE SIGNAGE — ZONE ${zone}`, reason: `Stage 3/4: Digital signage hijacked to cut off exterior flow.` },
      { delay: 4500, action: `SECTOR GATE LOCKED — ZONE ${zone}`, reason: `Stage 4/4: Physical gate hard-locked.` }
    ];

    sequence.forEach(stage => {
      setTimeout(() => {
        const quickDecision = {
          event_id: `STAGE-${Date.now()}`,
          recommended_action: stage.action,
          reasoning: `Manual Override [Operator ID: CMD-Alpha] • ${stage.reason}`,
          mission_objective: 'Pre-crush mitigation',
          expected_outcome: stage.delay === 4500 ? 'Sector sealed securely' : 'Transitioning sector state',
          predicted_effects: { 'Transit Hub': '+12% delay', 'Zone D': '+8% density' },
          risk_level: 'critical',
          affected_zones: [zone],
          staff_allocation: [],
          timestamp: new Date().toISOString()
        };
        handleDecision(quickDecision);
        showToast(stage.action, 'warning');
        
        if (stage.delay === 4500) {
          btn.disabled = false;
          btn.classList.add('ring-2', 'ring-status-danger/50');
          setTimeout(() => btn.classList.remove('ring-2', 'ring-status-danger/50'), 1500);
          simulateMomentum(zone);
        }
      }, stage.delay);
    });
  }

    // Preset alerts selector clicks
    const presetGrid = document.getElementById('alert-preset-grid');
    if (presetGrid) {
      const presets = ['shelter', 'exits', 'medical', 'concourse'];
      presetGrid.querySelectorAll('button').forEach((btn, i) => {
        btn.dataset.preset = presets[i];
        btn.addEventListener('click', () => selectPresetAlert(btn.dataset.preset));
      });
    }

    // Language tabs clicks
    const langContainer = document.getElementById('lang-tabs');
    if (langContainer) {
      langContainer.querySelectorAll('button').forEach(tab => {
        tab.dataset.lang = tab.textContent.trim().toLowerCase();
        tab.addEventListener('click', () => selectLanguageTab(tab.dataset.lang));
      });
    }

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

    // Simulate Mass Rush — trigger next event in sequence
    dom.btnNext?.addEventListener('click', () => {
      if (state.currentEventIndex < state.events.length) {
        triggerEvent(state.currentEventIndex);
      } else {
        showToast('All simulation events exhausted. Reset to restart.', 'info');
      }
    });
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
      updatePersonnelSummary();
      showToast('Ops Copilot initialized.', 'info');
    } catch (err) {
      console.error('Init error:', err);
      // Graceful fallback — still show the UI even without backend
      if (API_BASE) {
        showToast('Backend offline — UI in static mode', 'error');
      }
    }
  }

  function updatePersonnelSummary() {
    const available = state.roster.filter(p => p.status === 'available').length;
    const deployed = state.roster.filter(p => p.status === 'deployed').length;
    if (dom.availCount) dom.availCount.textContent = available;
    if (dom.deployedCount) dom.deployedCount.textContent = deployed;
  }

  init();
})();
