<template>
  <div v-if="!content.portalTarget || (content.portalTarget === 'admin' && (!content.userRole || content.userRole === 'platform_admin'))" class="spread-dp">
    <!-- Gate: no credentials -->
    <div v-if="!content.accessToken || !content.userId" class="spread-dp__gate">
      <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      <p class="spread-dp__gate-text">Admin access required</p>
    </div>

    <!-- Permission gate -->
    <div v-else-if="permissionChecked && !hasPlatformAdmin" class="spread-dp__gate spread-dp__gate--perm">
      <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
      <p class="spread-dp__gate-text">Platform admin role required</p>
    </div>

    <template v-else>
      <!-- Header -->
      <div class="spread-dp__header">
        <div>
          <h2 class="spread-dp__title">Data Pipeline</h2>
          <p class="spread-dp__subtitle">Monitor and manage geo dataset sync jobs</p>
        </div>
        <div class="spread-dp__header-actions">
          <div v-if="loading" class="spread-dp__spinner" aria-label="Loading"></div>
          <button class="spread-dp__btn spread-dp__btn--ghost" @click="loadPipeline" :disabled="loading">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            Refresh
          </button>
        </div>
      </div>

      <!-- Error -->
      <div v-if="error" class="spread-dp__error" role="alert">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        {{ error }}
        <button class="spread-dp__dismiss" @click="error = null" aria-label="Dismiss error">×</button>
      </div>

      <!-- Summary pills -->
      <div v-if="datasets.length" class="spread-dp__summary-bar">
        <div class="spread-dp__pill spread-dp__pill--ok">
          <span class="spread-dp__pill-dot spread-dp__pill-dot--ok"></span>
          {{ sloSummary.ok }} healthy
        </div>
        <div v-if="sloSummary.warn" class="spread-dp__pill spread-dp__pill--warn">
          <span class="spread-dp__pill-dot spread-dp__pill-dot--warn"></span>
          {{ sloSummary.warn }} stale
        </div>
        <div v-if="sloSummary.crit" class="spread-dp__pill spread-dp__pill--crit">
          <span class="spread-dp__pill-dot spread-dp__pill-dot--crit"></span>
          {{ sloSummary.crit }} critical
        </div>
        <div v-if="sloSummary.never" class="spread-dp__pill spread-dp__pill--never">
          <span class="spread-dp__pill-dot spread-dp__pill-dot--never"></span>
          {{ sloSummary.never }} never synced
        </div>
      </div>

      <!-- Skeleton -->
      <div v-if="loading && !datasets.length" class="spread-dp__skeleton">
        <div v-for="i in 4" :key="i" class="spread-dp__skeleton-row"></div>
      </div>

      <!-- Dataset table -->
      <div v-else-if="datasets.length" class="spread-dp__table-wrap">
        <div class="spread-dp__table">
          <div class="spread-dp__row spread-dp__row--head">
            <span>Dataset</span>
            <span>Status</span>
            <span>Rows</span>
            <span>Features</span>
            <span>Last success</span>
            <span>Source URL</span>
            <span>Actions</span>
          </div>
          <div v-for="ds in datasets" :key="ds.id" class="spread-dp__row" :class="`spread-dp__row--slo-${sloClass(ds)}`">
            <!-- Dataset name + mode -->
            <div class="spread-dp__cell-name">
              <span class="spread-dp__dataset-name">{{ ds.dataset_name }}</span>
              <span class="spread-dp__mode-badge">{{ ds.import_mode || 'auto' }}</span>
            </div>

            <!-- Status -->
            <span class="spread-dp__status-badge" :class="`spread-dp__status-badge--${ds.status}`">{{ ds.status }}</span>

            <!-- Rows / Features -->
            <span class="spread-dp__num">{{ (ds.row_count ?? 0).toLocaleString() }}</span>
            <span class="spread-dp__num">{{ (ds.processed_features ?? 0).toLocaleString() }}</span>

            <!-- Last success -->
            <span class="spread-dp__last-success" :class="{ 'spread-dp__last-success--stale': sloClass(ds) !== 'ok' }">
              <span>{{ formatDate(ds.last_success_at) }}</span>
              <span class="spread-dp__age-tag" v-if="sloClass(ds) !== 'ok'">{{ ageLabel(ds.last_success_at) }}</span>
            </span>

            <!-- Source URL (inline edit) -->
            <div class="spread-dp__url-cell">
              <template v-if="editingUrlId === ds.id">
                <input
                  class="spread-dp__url-input"
                  type="text"
                  :ref="'urlInput_' + ds.id"
                  v-model="editingUrlValue"
                  @keydown.enter="saveUrl(ds)"
                  @keydown.esc="cancelUrlEdit"
                />
                <button class="spread-dp__url-save" @click="saveUrl(ds)" :disabled="savingUrlId === ds.id" title="Save">
                  <div v-if="savingUrlId === ds.id" class="spread-dp__inline-spinner"></div>
                  <svg v-else viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
                </button>
                <button class="spread-dp__url-cancel" @click="cancelUrlEdit" title="Cancel">
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </template>
              <template v-else>
                <span class="spread-dp__url-text" :title="ds.source_url">{{ truncateUrl(ds.source_url) }}</span>
                <button class="spread-dp__url-edit" @click="startUrlEdit(ds)" title="Edit URL">
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
              </template>
            </div>

            <!-- Actions -->
            <div class="spread-dp__action-cell">
              <button
                class="spread-dp__action-btn spread-dp__action-btn--sync"
                :class="{ 'spread-dp__action-btn--loading': syncingId === ds.id }"
                @click="promptResync(ds)"
                :disabled="syncingId === ds.id || ds.status === 'running'"
                title="Force resync"
              >
                <div v-if="syncingId === ds.id" class="spread-dp__inline-spinner"></div>
                <svg v-else viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
              </button>
              <button
                class="spread-dp__action-btn spread-dp__action-btn--alerts"
                @click="openErrorDrawer(ds)"
                :class="{ 'spread-dp__action-btn--has-alerts': (alertCountByDataset[ds.dataset_name] || 0) > 0 }"
                title="View alerts"
              >
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                <span v-if="(alertCountByDataset[ds.dataset_name] || 0) > 0" class="spread-dp__alert-count">{{ alertCountByDataset[ds.dataset_name] }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Empty -->
      <div v-else class="spread-dp__empty">
        <p>No datasets found. Pipeline has not been configured yet.</p>
      </div>

      <!-- ── Resync confirmation modal ─────────────────────────────── -->
      <div v-if="confirmResyncDataset" class="spread-dp__modal-overlay" role="dialog" aria-modal="true">
        <div class="spread-dp__confirm-box">
          <p class="spread-dp__confirm-title">Force resync?</p>
          <p class="spread-dp__confirm-body">This will queue a full resync of <strong>{{ confirmResyncDataset.dataset_name }}</strong>. Existing rows will be replaced. This may take several minutes.</p>
          <div class="spread-dp__confirm-actions">
            <button class="spread-dp__btn spread-dp__btn--ghost" @click="confirmResyncDataset = null">Cancel</button>
            <button class="spread-dp__btn spread-dp__btn--primary" :disabled="!!syncingId" @click="executeResync">
              <div v-if="syncingId" class="spread-dp__inline-spinner spread-dp__inline-spinner--white"></div>
              <span v-else>Yes, resync</span>
            </button>
          </div>
        </div>
      </div>

      <!-- ── Error drawer ──────────────────────────────────────────── -->
      <div v-if="drawerDataset" class="spread-dp__drawer-overlay" @click.self="closeDrawer">
        <div class="spread-dp__drawer" role="dialog" aria-modal="true">
          <div class="spread-dp__drawer-header">
            <h3 class="spread-dp__drawer-title">Alerts — {{ drawerDataset.dataset_name }}</h3>
            <button class="spread-dp__drawer-close" @click="closeDrawer" aria-label="Close">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="spread-dp__drawer-body">
            <div v-if="loadingDrawer" class="spread-dp__loading-msg">
              <div class="spread-dp__spinner spread-dp__spinner--sm"></div>
              Loading alerts…
            </div>
            <div v-else-if="!drawerAlerts.length" class="spread-dp__empty">✓ No unresolved alerts for this dataset.</div>
            <ul v-else class="spread-dp__alert-list">
              <li
                v-for="alert in drawerAlerts"
                :key="alert.id"
                class="spread-dp__alert-item"
                :class="`spread-dp__alert-item--${alert.severity || 'info'}`"
                :data-id="alert.id"
              >
                <div class="spread-dp__alert-top">
                  <span class="spread-dp__sev-badge" :class="`spread-dp__sev-badge--${alert.severity}`">{{ alert.severity }}</span>
                  <span class="spread-dp__alert-type">{{ alert.alert_type }}</span>
                  <span class="spread-dp__alert-time">{{ relativeTime(alert.created_at) }}</span>
                  <button class="spread-dp__ack-btn" @click="acknowledgeAlert(alert)" :disabled="acknowledgingId === alert.id">
                    <div v-if="acknowledgingId === alert.id" class="spread-dp__inline-spinner"></div>
                    <span v-else>Acknowledge</span>
                  </button>
                </div>
                <p class="spread-dp__alert-msg">{{ alert.message }}</p>
                <pre v-if="alert.context" class="spread-dp__alert-ctx">{{ formatContext(alert.context) }}</pre>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script>
/* ── Mock ──────────────────────────────────────────────────────────────── */
const MOCK_DATASETS = [
  { id: '11111111-0000-0000-0000-000000000001', dataset_name: 'nsw_localities', status: 'idle', source_url: 'https://geo.data.gov.au/nsw_localities.geojson', row_count: 12581, processed_features: 12581, last_success_at: new Date(Date.now() - 3600000 * 6).toISOString(), import_mode: 'auto', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), last_error: null },
  { id: '11111111-0000-0000-0000-000000000002', dataset_name: 'qld_postcodes', status: 'idle', source_url: 'https://geo.data.gov.au/qld_postcodes.geojson', row_count: 8234, processed_features: 8234, last_success_at: new Date(Date.now() - 3600000 * 24 * 10).toISOString(), import_mode: 'manual', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), last_error: null },
  { id: '11111111-0000-0000-0000-000000000003', dataset_name: 'vic_suburbs', status: 'error', source_url: 'https://geo.data.gov.au/vic_suburbs.geojson', row_count: 0, processed_features: 0, last_success_at: null, import_mode: 'auto', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), last_error: 'HTTP 404: source not found' },
];

/* ── Inline client ─────────────────────────────────────────────────────── */
function createSpreadClient(url, anonKey, token) {
  const headers = { 'Content-Type': 'application/json', apikey: anonKey };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return {
    async rpc(fn, params = {}) {
      const res = await fetch(`${url}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(params) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || res.statusText); }
      return res.json();
    },
    async patch(table, filters, body) {
      const qs = `${url}/rest/v1/${table}?${filters}`;
      const res = await fetch(qs, { method: 'PATCH', headers: { ...headers, 'Prefer': 'return=representation' }, body: JSON.stringify(body) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || res.statusText); }
      return res.json();
    },
  };
}

export default {
  props: {
    /* wwEditor:start */
    wwEditorState: { type: Object, required: true },
    /* wwEditor:end */
    content:        { type: Object, required: true },
    wwFrontState:   { type: Object, required: true },
    wwElementState: { type: Object, required: true },
  },
  emits: ['trigger-event', 'update:content'],

  setup() {
    const { value: datasetCount, setValue: setDatasetCount } =
      wwLib.wwVariable.useComponentVariable({ uid: 'datasetCount', name: 'Dataset Count', type: 'number', defaultValue: 0 });
    return { datasetCount, setDatasetCount };
  },

  data() {
    return {
      loading:              false,
      permissionChecked:    false,
      hasPlatformAdmin:     false,
      datasets:             [],
      error:                null,
      _pollTimer:           null,
      // URL edit
      editingUrlId:         null,
      editingUrlValue:      '',
      savingUrlId:          null,
      // Resync
      confirmResyncDataset: null,
      syncingId:            null,
      // Drawer
      drawerDataset:        null,
      drawerAlerts:         [],
      loadingDrawer:        false,
      acknowledgingId:      null,
      alertCountByDataset:  {},
    };
  },

  computed: {
    /* wwEditor:start */
    isEditorMode() { return !!this.wwEditorState; },
    /* wwEditor:end */
    sloSummary() {
      const s = { ok: 0, warn: 0, crit: 0, never: 0 };
      this.datasets.forEach(ds => { s[this.sloClass(ds)]++; });
      return s;
    },
  },

  watch: {
    'content.refreshTrigger'() { this.loadPipeline(); },
    'content.refreshInterval'() { clearInterval(this._pollTimer); this._startPolling(); },
    datasets(v) { this.setDatasetCount(v.length); },
  },

  mounted() {
    /* wwEditor:start */
    if (this.isEditorMode) {
      this.hasPlatformAdmin = true;
      this.permissionChecked = true;
      this.datasets = MOCK_DATASETS;
      this.setDatasetCount(MOCK_DATASETS.length);
      return;
    }
    /* wwEditor:end */
    this.checkRole().then(() => { if (this.hasPlatformAdmin) { this.loadPipeline(); this._startPolling(); } });
  },

  beforeUnmount() { clearInterval(this._pollTimer); },

  methods: {
    client() {
      return createSpreadClient(this.content?.supabaseUrl, this.content?.supabaseAnonKey, this.content?.accessToken);
    },

    async checkRole() {
      try {
        const ok = await this.client().rpc('has_role', { p_user_id: this.content.userId, p_role_key: 'platform_admin' });
        this.hasPlatformAdmin = !!ok;
      } catch (_) { this.hasPlatformAdmin = true; } // fail-open
      this.permissionChecked = true;
    },

    _startPolling() {
      const ms = (this.content.refreshInterval || 120) * 1000;
      this._pollTimer = setInterval(() => this.loadPipeline(), ms);
    },

    async loadPipeline() {
      if (!this.content.accessToken || !this.content.userId) return;
      this.loading = true;
      this.error   = null;
      try {
        const result = await this.client().rpc('get_pipeline_dashboard', { p_user_id: this.content.userId });
        this.datasets = Array.isArray(result) ? result : [];
        this.setDatasetCount(this.datasets.length);
        this.$emit('trigger-event', { name: 'pipeline:loaded', event: { count: this.datasets.length } });
      } catch (e) {
        this.error = e.message || 'Failed to load pipeline data';
        this.$emit('trigger-event', { name: 'pipeline:error', event: { message: this.error } });
      } finally { this.loading = false; }
    },

    sloClass(ds) {
      if (!ds.last_success_at) return 'never';
      const ageDays = (Date.now() - new Date(ds.last_success_at).getTime()) / 86400000;
      if (ageDays > 14) return 'crit';
      if (ageDays > 8)  return 'warn';
      return 'ok';
    },

    ageLabel(ts) {
      if (!ts) return 'never';
      const ageDays = (Date.now() - new Date(ts).getTime()) / 86400000;
      if (ageDays >= 1) return `${Math.floor(ageDays)}d ago`;
      return `${Math.floor(ageDays * 24)}h ago`;
    },

    truncateUrl(url) {
      if (!url) return '—';
      try { const u = new URL(url); return u.hostname + u.pathname.slice(0, 30) + (u.pathname.length > 30 ? '…' : ''); } catch (_) { return url.length > 50 ? url.slice(0, 50) + '…' : url; }
    },

    startUrlEdit(ds) {
      this.editingUrlId    = ds.id;
      this.editingUrlValue = ds.source_url || '';
      this.$nextTick(() => {
        const ref = this.$refs['urlInput_' + ds.id];
        if (ref) { (Array.isArray(ref) ? ref[0] : ref).focus(); }
      });
    },

    cancelUrlEdit() {
      this.editingUrlId    = null;
      this.editingUrlValue = '';
    },

    async saveUrl(ds) {
      const newUrl = this.editingUrlValue.trim();
      if (!newUrl || newUrl === ds.source_url) { this.cancelUrlEdit(); return; }
      this.savingUrlId = ds.id;
      try {
        // Try dedicated RPC first; fall back to PostgREST direct PATCH
        try {
          await this.client().rpc('update_dataset_source_url', {
            p_user_id:   this.content.userId,
            p_dataset_id: ds.id,
            p_source_url: newUrl,
          });
        } catch (rpcErr) {
          if (String(rpcErr.message).includes('does not exist') || String(rpcErr.message).includes('404')) {
            await this.client().patch('geo_datasets', `id=eq.${ds.id}`, { source_url: newUrl });
          } else throw rpcErr;
        }
        const idx = this.datasets.findIndex(d => d.id === ds.id);
        if (idx !== -1) {
          const updated = [...this.datasets];
          updated[idx] = { ...updated[idx], source_url: newUrl };
          this.datasets = updated;
        }
        this.cancelUrlEdit();
        this.$emit('trigger-event', { name: 'pipeline:urlUpdated', event: { datasetId: ds.id, newUrl } });
      } catch (e) { this.error = e.message || 'Failed to update URL'; } finally { this.savingUrlId = null; }
    },

    promptResync(ds) { this.confirmResyncDataset = ds; },

    async executeResync() {
      if (!this.confirmResyncDataset) return;
      const ds = this.confirmResyncDataset;
      this.syncingId = ds.id;
      this.confirmResyncDataset = null;
      try {
        await this.client().rpc('force_dataset_resync', {
          p_user_id:    this.content.userId,
          p_dataset_id: ds.id,  // UUID — no coercion needed
        });
        const idx = this.datasets.findIndex(d => d.id === ds.id);
        if (idx !== -1) { const copy = [...this.datasets]; copy[idx] = { ...copy[idx], status: 'running' }; this.datasets = copy; }
        this.$emit('trigger-event', { name: 'pipeline:resyncTriggered', event: { datasetId: ds.id, datasetName: ds.dataset_name } });
      } catch (e) { this.error = e.message || 'Resync failed'; } finally { this.syncingId = null; }
    },

    async openErrorDrawer(ds) {
      this.drawerDataset = ds;
      this.drawerAlerts  = [];
      this.loadingDrawer = true;
      try {
        const alerts = await this.client().rpc('get_geo_sync_alerts', {
          p_user_id:         this.content.userId,
          p_dataset_name:    ds.dataset_name,
          p_unresolved_only: true,
          p_limit:           50,
        });
        this.drawerAlerts = Array.isArray(alerts) ? alerts : [];
        this.alertCountByDataset = { ...this.alertCountByDataset, [ds.dataset_name]: this.drawerAlerts.length };
      } catch (e) { this.error = e.message; } finally { this.loadingDrawer = false; }
    },

    closeDrawer() { this.drawerDataset = null; this.drawerAlerts = []; },

    async acknowledgeAlert(alert) {
      this.acknowledgingId = alert.id;
      try {
        await this.client().rpc('acknowledge_geo_alert', { p_user_id: this.content.userId, p_alert_id: alert.id });
        this.drawerAlerts = this.drawerAlerts.filter(a => a.id !== alert.id);
        const name = this.drawerDataset?.dataset_name;
        if (name) {
          this.alertCountByDataset = { ...this.alertCountByDataset, [name]: Math.max(0, (this.alertCountByDataset[name] || 1) - 1) };
        }
        this.$emit('trigger-event', { name: 'pipeline:alertAcknowledged', event: { alertId: alert.id } });
      } catch (e) { this.error = e.message; } finally { this.acknowledgingId = null; }
    },

    formatDate(ts) {
      if (!ts) return 'Never';
      try { return new Date(ts).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (_) { return ts; }
    },

    relativeTime(ts) {
      try {
        const diff = Date.now() - new Date(ts).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'Just now';
        if (mins < 60) return `${mins}m ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}h ago`;
        return `${Math.floor(hrs / 24)}d ago`;
      } catch (_) { return ''; }
    },

    formatContext(ctx) {
      if (!ctx) return '';
      try { return JSON.stringify(typeof ctx === 'string' ? JSON.parse(ctx) : ctx, null, 2); } catch (_) { return String(ctx); }
    },
  },
};
</script>

<style scoped>
.spread-dp {
  --spread-primary:    #4B162D;
  --spread-accent:     #CE6632;
  --spread-dark-grey:  #2B2B2B;
  --spread-mid-grey:   #4B5563;
  --spread-light-grey: #6B7280;
  --spread-border:     #F3EADF;
  --spread-background: #FBFAF8;
  --spread-success:    #16A34A;
  --spread-warning:    #D97706;
  --spread-error:      #D14343;
  --spread-radius:     12px;
  --spread-radius-sm:  8px;
  --spread-font:       ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;

  font-family: var(--spread-font);
  width: 100%;
  box-sizing: border-box;
  padding: 1.5rem;
  background: var(--spread-background);
  max-width: 1440px;
  margin-inline: auto;
  position: relative;
}

.spread-dp *, .spread-dp *::before, .spread-dp *::after { box-sizing: border-box; margin: 0; padding: 0; }

.spread-dp__gate { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; min-height: 200px; color: var(--spread-mid-grey); }
.spread-dp__gate--perm { color: var(--spread-error); }
.spread-dp__gate-text { font-size: 14px; font-weight: 500; }

.spread-dp__header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.25rem; }
.spread-dp__title { font-size: 1.375rem; font-weight: 800; color: var(--spread-primary); }
.spread-dp__subtitle { font-size: 0.8125rem; color: var(--spread-light-grey); margin-top: 2px; }
.spread-dp__header-actions { display: flex; align-items: center; gap: 10px; }

.spread-dp__error { display: flex; align-items: center; gap: 8px; padding: 10px 14px; background: #FEF2F2; border: 1px solid #FECACA; border-radius: var(--spread-radius-sm); color: var(--spread-error); font-size: 13px; margin-bottom: 1rem; }
.spread-dp__dismiss { margin-left: auto; background: none; border: none; cursor: pointer; color: inherit; font-size: 18px; line-height: 1; }

/* Summary pills */
.spread-dp__summary-bar { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 1rem; }
.spread-dp__pill { display: flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 600; border: 1px solid transparent; }
.spread-dp__pill--ok    { background: #DCFCE7; border-color: #86EFAC; color: #14532D; }
.spread-dp__pill--warn  { background: #FEF3C7; border-color: #FDE68A; color: #78350F; }
.spread-dp__pill--crit  { background: #FEE2E2; border-color: #FECACA; color: #7F1D1D; }
.spread-dp__pill--never { background: #F3F4F6; border-color: #D1D5DB; color: #374151; }
.spread-dp__pill-dot { width: 7px; height: 7px; border-radius: 50%; }
.spread-dp__pill-dot--ok    { background: var(--spread-success); }
.spread-dp__pill-dot--warn  { background: var(--spread-warning); }
.spread-dp__pill-dot--crit  { background: var(--spread-error); }
.spread-dp__pill-dot--never { background: #9CA3AF; }

/* Skeleton */
.spread-dp__skeleton { display: flex; flex-direction: column; gap: 6px; }
.spread-dp__skeleton-row { height: 52px; background: linear-gradient(90deg, #f0ebe6 25%, #e8e2dc 50%, #f0ebe6 75%); background-size: 200% 100%; border-radius: var(--spread-radius-sm); animation: spread-dp-shimmer 1.5s infinite; }
@keyframes spread-dp-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

/* Table */
.spread-dp__table-wrap { overflow-x: auto; }
.spread-dp__table { min-width: 820px; }
.spread-dp__row {
  display: grid;
  grid-template-columns: 180px 90px 80px 80px 140px 1fr 80px;
  align-items: center; gap: 8px; padding: 10px 14px; border-bottom: 1px solid var(--spread-border);
  font-size: 13px; color: var(--spread-dark-grey);
}
.spread-dp__row--head { background: #fff; border-radius: var(--spread-radius-sm) var(--spread-radius-sm) 0 0; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--spread-mid-grey); }
.spread-dp__row--slo-crit  { border-left: 3px solid var(--spread-error); }
.spread-dp__row--slo-warn  { border-left: 3px solid var(--spread-warning); }
.spread-dp__row--slo-never { border-left: 3px solid #9CA3AF; }

.spread-dp__cell-name { display: flex; flex-direction: column; gap: 3px; }
.spread-dp__dataset-name { font-weight: 700; color: var(--spread-dark-grey); font-size: 13px; }
.spread-dp__mode-badge { font-size: 10px; font-weight: 600; padding: 1px 5px; background: var(--spread-background); border: 1px solid var(--spread-border); border-radius: 4px; color: var(--spread-mid-grey); width: fit-content; }

.spread-dp__status-badge { font-size: 11px; font-weight: 700; text-transform: uppercase; padding: 3px 7px; border-radius: 6px; white-space: nowrap; }
.spread-dp__status-badge--idle    { background: #F3F4F6; color: #374151; }
.spread-dp__status-badge--running { background: #DBEAFE; color: #1E40AF; animation: spread-dp-pulse 1.5s infinite; }
.spread-dp__status-badge--error   { background: #FEE2E2; color: #7F1D1D; }
.spread-dp__status-badge--success { background: #DCFCE7; color: #14532D; }
.spread-dp__status-badge--queued  { background: #FEF3C7; color: #78350F; }
@keyframes spread-dp-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }

.spread-dp__num { font-variant-numeric: tabular-nums; text-align: right; }
.spread-dp__last-success { display: flex; flex-direction: column; gap: 2px; font-size: 12.5px; }
.spread-dp__last-success--stale { color: var(--spread-warning); }
.spread-dp__age-tag { font-size: 11px; font-weight: 600; }

/* URL cell */
.spread-dp__url-cell { display: flex; align-items: center; gap: 6px; min-width: 0; overflow: hidden; }
.spread-dp__url-text { font-size: 11.5px; color: var(--spread-mid-grey); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; }
.spread-dp__url-edit { background: none; border: none; cursor: pointer; color: var(--spread-light-grey); display: flex; align-items: center; padding: 3px; border-radius: 4px; flex-shrink: 0; }
.spread-dp__url-edit:hover { color: var(--spread-accent); background: var(--spread-border); }
.spread-dp__url-input { flex: 1; padding: 5px 8px; border: 1px solid var(--spread-accent); border-radius: 5px; font-size: 12px; font-family: inherit; outline: none; color: var(--spread-dark-grey); min-width: 0; }
.spread-dp__url-save,
.spread-dp__url-cancel { background: none; border: 1px solid var(--spread-border); cursor: pointer; color: var(--spread-mid-grey); padding: 4px 7px; border-radius: 5px; display: flex; align-items: center; flex-shrink: 0; }
.spread-dp__url-save:hover { border-color: var(--spread-success); color: var(--spread-success); }
.spread-dp__url-cancel:hover { border-color: var(--spread-error); color: var(--spread-error); }

/* Action cell */
.spread-dp__action-cell { display: flex; align-items: center; gap: 6px; }
.spread-dp__action-btn { background: none; border: 1px solid var(--spread-border); border-radius: var(--spread-radius-sm); cursor: pointer; display: flex; align-items: center; gap: 5px; padding: 6px 8px; font-size: 11px; font-weight: 600; color: var(--spread-mid-grey); transition: all 0.12s; }
.spread-dp__action-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.spread-dp__action-btn--sync:hover:not(:disabled) { border-color: var(--spread-accent); color: var(--spread-accent); }
.spread-dp__action-btn--alerts:hover { border-color: var(--spread-warning); color: var(--spread-warning); }
.spread-dp__action-btn--has-alerts { border-color: var(--spread-warning); color: var(--spread-warning); }
.spread-dp__alert-count { font-size: 10px; font-weight: 700; background: var(--spread-warning); color: #fff; border-radius: 8px; padding: 0 5px; min-width: 16px; text-align: center; }

/* Empty */
.spread-dp__empty { padding: 1.5rem; color: var(--spread-light-grey); font-size: 13px; text-align: center; background: #fff; border: 1px solid var(--spread-border); border-radius: var(--spread-radius-sm); }

/* Confirm modal */
.spread-dp__modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 1rem; }
.spread-dp__confirm-box { background: #fff; border-radius: var(--spread-radius); padding: 2rem; max-width: 420px; width: 100%; box-shadow: 0 20px 40px rgba(0,0,0,0.2); }
.spread-dp__confirm-title { font-size: 1.125rem; font-weight: 800; color: var(--spread-primary); margin-bottom: 8px; }
.spread-dp__confirm-body { font-size: 14px; color: var(--spread-mid-grey); line-height: 1.5; margin-bottom: 1.5rem; }
.spread-dp__confirm-actions { display: flex; justify-content: flex-end; gap: 10px; }

/* Drawer */
.spread-dp__drawer-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 9998; display: flex; justify-content: flex-end; }
.spread-dp__drawer { width: 100%; max-width: 540px; background: #fff; display: flex; flex-direction: column; height: 100%; overflow: hidden; box-shadow: -4px 0 24px rgba(0,0,0,0.12); }
.spread-dp__drawer-header { display: flex; align-items: center; justify-content: space-between; padding: 1.25rem 1.5rem; border-bottom: 1px solid var(--spread-border); flex-shrink: 0; }
.spread-dp__drawer-title { font-size: 1rem; font-weight: 800; color: var(--spread-primary); }
.spread-dp__drawer-close { background: none; border: 1px solid var(--spread-border); border-radius: var(--spread-radius-sm); cursor: pointer; padding: 6px; color: var(--spread-mid-grey); display: flex; align-items: center; }
.spread-dp__drawer-close:hover { border-color: var(--spread-error); color: var(--spread-error); }
.spread-dp__drawer-body { flex: 1; overflow-y: auto; padding: 1rem 1.5rem; display: flex; flex-direction: column; gap: 8px; }

.spread-dp__loading-msg { display: flex; align-items: center; gap: 8px; color: var(--spread-light-grey); font-size: 13px; padding: 1rem 0; }

/* Alert list */
.spread-dp__alert-list { list-style: none; display: flex; flex-direction: column; gap: 8px; }
.spread-dp__alert-item { background: var(--spread-background); border: 1px solid var(--spread-border); border-radius: var(--spread-radius-sm); padding: 12px 14px; border-left: 3px solid transparent; }
.spread-dp__alert-item--critical { border-left-color: var(--spread-error); }
.spread-dp__alert-item--high     { border-left-color: #EF4444; }
.spread-dp__alert-item--warning  { border-left-color: var(--spread-warning); }
.spread-dp__alert-item--info     { border-left-color: #3B82F6; }

.spread-dp__alert-top { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.spread-dp__sev-badge { font-size: 10px; font-weight: 700; text-transform: uppercase; padding: 2px 6px; border-radius: 4px; }
.spread-dp__sev-badge--critical, .spread-dp__sev-badge--high { background: #FEE2E2; color: #7F1D1D; }
.spread-dp__sev-badge--warning  { background: #FEF3C7; color: #78350F; }
.spread-dp__sev-badge--info     { background: #DBEAFE; color: #1E40AF; }
.spread-dp__alert-type { font-size: 12px; font-weight: 600; color: var(--spread-mid-grey); }
.spread-dp__alert-time { font-size: 11px; color: var(--spread-light-grey); margin-left: auto; }
.spread-dp__ack-btn { padding: 4px 10px; background: none; border: 1px solid var(--spread-border); border-radius: 5px; font-size: 11px; font-weight: 600; cursor: pointer; color: var(--spread-mid-grey); display: flex; align-items: center; gap: 5px; transition: all 0.12s; flex-shrink: 0; }
.spread-dp__ack-btn:hover:not(:disabled) { border-color: var(--spread-success); color: var(--spread-success); }
.spread-dp__ack-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.spread-dp__alert-msg { font-size: 13px; color: var(--spread-dark-grey); line-height: 1.5; }
.spread-dp__alert-ctx { font-size: 11px; color: var(--spread-mid-grey); background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 6px; padding: 8px; margin-top: 6px; overflow-x: auto; white-space: pre-wrap; word-break: break-all; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }

/* Buttons */
.spread-dp__btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: var(--spread-radius-sm); font-size: 13px; font-weight: 600; cursor: pointer; border: 1px solid transparent; transition: all 0.12s; font-family: inherit; }
.spread-dp__btn:disabled { opacity: 0.5; cursor: not-allowed; }
.spread-dp__btn--primary { background: var(--spread-primary); color: #fff; border-color: var(--spread-primary); }
.spread-dp__btn--primary:hover:not(:disabled) { background: #3a0f22; }
.spread-dp__btn--ghost { background: none; color: var(--spread-mid-grey); border-color: var(--spread-border); }
.spread-dp__btn--ghost:hover:not(:disabled) { border-color: var(--spread-mid-grey); }

/* Spinners */
.spread-dp__spinner { display: inline-block; width: 20px; height: 20px; border: 2px solid var(--spread-border); border-top-color: var(--spread-accent); border-radius: 50%; animation: spread-dp-spin 0.6s linear infinite; flex-shrink: 0; }
.spread-dp__spinner--sm { width: 14px; height: 14px; }
.spread-dp__inline-spinner { display: inline-block; width: 13px; height: 13px; border: 2px solid var(--spread-border); border-top-color: var(--spread-accent); border-radius: 50%; animation: spread-dp-spin 0.6s linear infinite; flex-shrink: 0; }
.spread-dp__inline-spinner--white { border-color: rgba(255,255,255,0.3); border-top-color: #fff; }
@media (max-width: 767px) {
  .spread-dp { padding: 1rem; }
}
@media (max-width: 479px) {
  .spread-dp { padding: 0.75rem; }
}
@media (min-width: 480px) {
  .spread-dp { padding: 1rem; }
}
@media (min-width: 768px) {
  .spread-dp { padding: 1.25rem; }
}
@media (min-width: 1024px) {
  .spread-dp { padding: 1.5rem 2rem; }
}
@media (min-width: 1280px) {
  .spread-dp { padding: 1.5rem 2.5rem; }
}
@keyframes spread-dp-spin { to { transform: rotate(360deg); } }

/* ── Dark mode ─────────────────────────────────────────────────────── */
:global(html.dark) .spread-dp {
  background: #000000;
  color: #e6d8ca;
  --spread-cream: #18181b;
  --spread-border: rgba(230, 216, 202, 0.12);
  --spread-text-primary: #e6d8ca;
  --spread-text-secondary: rgba(230, 216, 202, 0.65);
  --spread-text-muted: rgba(230, 216, 202, 0.4);
}
:global(html.dark) .spread-dp__card { background: #18181b; border-color: rgba(230,216,202,0.12); }
:global(html.dark) .spread-dp__stage-label { color: rgba(230,216,202,0.5); text-transform: uppercase; }
:global(html.dark) .spread-dp__step-name { color: #e6d8ca; }
:global(html.dark) .spread-dp__step-meta { color: rgba(230,216,202,0.5); }
:global(html.dark) .spread-dp__step-bar { background: rgba(230,216,202,0.08); }
:global(html.dark) .spread-dp__step-bar-fill { background: #ce6632; }
:global(html.dark) .spread-dp__badge--running { background: rgba(14,165,233,0.12); color: #38bdf8; }
:global(html.dark) .spread-dp__badge--done { background: rgba(74,222,128,0.12); color: #4ade80; }
:global(html.dark) .spread-dp__badge--failed { background: rgba(209,67,67,0.12); color: #fca5a5; }
:global(html.dark) .spread-dp__badge--queued { background: rgba(250,204,21,0.12); color: #fbbf24; }
:global(html.dark) .spread-dp__divider { border-color: rgba(230,216,202,0.08); }
:global(html.dark) .spread-dp input,
:global(html.dark) .spread-dp select { background: #160c11; border-color: rgba(230,216,202,0.2); color: #e6d8ca; }
</style>
