// fallhr-us SDK · sovereign single-file library · MIT · AI-Native Solutions
// Extracted from fallhr-us/index.html · 67900 bytes of source logic
// Public-safe: no primes/glyphs/dyad references

/*!
 * Fall Kit · v1.0.0 · the shared cascade for every estate seed
 *
 * Inlineable JS module. Drop into any seed via <script> or copy-paste inline.
 * Preserves single-HTML sovereignty (no external deps until user opts in to T2 WebLLM).
 *
 * What it gives every seed:
 *  - AI tier picker: T0 (off · default) · T2 (WebLLM in-browser, 5 models 1B-70B) · T3 (BYOK Anthropic/OpenAI/Google)
 *  - Universal entry: FallKit.aiComplete(systemPrompt, userMsg, maxTokens) → string|null
 *  - AI chip UI in header
 *  - WebRTC P2P mesh (ported from canonical fallnet · fall-signal channel · Google STUN)
 *  - Help section partial: FallKit.helpSection()
 *  - Settings panel: FallKit.openSettings()
 *
 * Doctrine (per botler CLAUDE.md):
 *  - T0 fallback ALWAYS works · aiComplete returns null · caller MUST degrade gracefully
 *  - NEVER hide a feature behind AI · NEVER proxy API keys · NEVER log keys
 *  - WebLLM is lazy-loaded · model weights download ONLY on user opt-in
 *
 * Estate-first canonical references:
 *  - WebLLM pattern: Downloads/botler/index.html (T0/T2/T3 cascade)
 *  - WebRTC pattern: Downloads/fallnet/fallnet-shim.js (raw RTCPeerConnection)
 *  - Mesh channel:   'fall-signal'
 */
(function (root) {
  'use strict';
  const FALL_KIT_VERSION = '1.2.0';
  const KCC_MINT_URL = 'https://sjgant80-hub.github.io/kcc-mint/';
  // ─── Model registry ──────────────────────────────────────────────
  const WEBLLM_MODELS = {
    'llama-1b':  { id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',   size: '~700MB', label: '1B · fast · any laptop / phone' },
    'llama-3b':  { id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC',   size: '~2GB',   label: '3B · balanced · default · most laptops' },
    'qwen-7b':   { id: 'Qwen2.5-7B-Instruct-q4f16_1-MLC',     size: '~5GB',   label: '7B · capable · needs decent GPU (M-series Mac / 8GB+ VRAM)' },
    'llama-8b':  { id: 'Llama-3.1-8B-Instruct-q4f16_1-MLC',   size: '~5GB',   label: '8B · common · needs decent GPU' },
    'llama-70b': { id: 'Llama-3.1-70B-Instruct-q4f16_1-MLC',  size: '~40GB',  label: '70B · frontier · needs serious GPU + 64GB+ RAM' },
  };
  const DEFAULT_MODEL = 'llama-3b';
  const T3_PROVIDERS = {
    anthropic: { label: 'Anthropic Claude', models: ['claude-sonnet-4-5','claude-opus-4-7','claude-haiku-4-5'], default: 'claude-sonnet-4-5', url: 'https://api.anthropic.com/v1/messages' },
    openai:    { label: 'OpenAI',           models: ['gpt-4o','gpt-4o-mini','o1-mini'],                          default: 'gpt-4o-mini',      url: 'https://api.openai.com/v1/chat/completions' },
    google:    { label: 'Google Gemini',    models: ['gemini-1.5-pro','gemini-1.5-flash','gemini-2.0-flash-exp'], default: 'gemini-1.5-flash', url: 'https://generativelanguage.googleapis.com/v1beta/models/' },
  };
  // ─── State ───────────────────────────────────────────────────────
  const STATE = {
    config: loadConfig(),
    ai: { ready: false, loading: false, progress: 0, engine: null, model: null },
    mesh: { active: false, peers: new Map(), bc: null, signal: null },
  };
  function loadConfig() {
    try { return JSON.parse(localStorage.getItem('fall-kit.config') || '{}'); }
    catch (e) { return {}; }
  }
  function saveConfig() {
    try { localStorage.setItem('fall-kit.config', JSON.stringify(STATE.config)); } catch (e) {}
  }
  // ─── DOM helpers ─────────────────────────────────────────────────
  function $(s, root) { return (root || document).querySelector(s); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
  // ─── AI tier ─────────────────────────────────────────────────────
  function aiTier() { return STATE.config.ai_tier || 'T0'; }
  function renderAiChip() {
    const chip = $('#fk-ai-chip');
    if (!chip) return;
    const txt = $('#fk-ai-chip-text');
    chip.classList.remove('fk-chip-live', 'fk-chip-loading', 'fk-chip-warn');
    const tier = aiTier();
    if (tier === 'T0') { txt.textContent = 'T0 · off'; }
    else if (tier === 'T2') {
      if (STATE.ai.ready) { txt.textContent = 'T2 ' + (WEBLLM_MODELS[STATE.config.webllm_model || DEFAULT_MODEL]?.label.split(' · ')[0] || '') + ' · ready'; chip.classList.add('fk-chip-live'); }
      else if (STATE.ai.loading) { txt.textContent = 'T2 loading ' + Math.round(STATE.ai.progress) + '%'; chip.classList.add('fk-chip-loading'); }
      else { txt.textContent = 'T2 · click to load'; chip.classList.add('fk-chip-warn'); }
    } else if (tier === 'T3') {
      if (STATE.config.api_key) { txt.textContent = 'T3 ' + (T3_PROVIDERS[STATE.config.api_provider]?.label || 'BYOK') + ' · active'; chip.classList.add('fk-chip-live'); }
      else { txt.textContent = 'T3 · no key set'; chip.classList.add('fk-chip-warn'); }
    }
  }
  async function loadWebLLM(modelKey) {
    if (STATE.ai.loading) return;
    const key = modelKey || STATE.config.webllm_model || DEFAULT_MODEL;
    const model = WEBLLM_MODELS[key];
    if (!model) { console.error('fall-kit: unknown model', key); return; }
    if (STATE.ai.ready && STATE.ai.model === model.id) return;
    STATE.ai.loading = true; STATE.ai.progress = 0; renderAiChip();
    notify('Loading WebLLM · ' + model.label + ' · ' + model.size + ' first time', 'info');
    try {
      const { CreateMLCEngine } = await import('https://esm.run/@mlc-ai/web-llm@0.2.79');
      const engine = await CreateMLCEngine(model.id, {
        initProgressCallback: p => { STATE.ai.progress = (p.progress || 0) * 100; renderAiChip(); }
      });
      STATE.ai.engine = engine;
      STATE.ai.model = model.id;
      STATE.ai.ready = true;
      STATE.ai.loading = false;
      STATE.config.webllm_model = key; saveConfig();
      renderAiChip();
      notify('WebLLM ready · sovereign mode · ' + model.label.split(' · ')[0], 'ok');
    } catch (e) {
      console.error('fall-kit: WebLLM load failed', e);
      STATE.ai.loading = false; renderAiChip();
      notify('WebLLM load failed · ' + e.message, 'err');
    }
  }
  async function aiComplete(systemPrompt, userMsg, maxTokens) {
    maxTokens = maxTokens || 600;
    const tier = aiTier();
    if (tier === 'T2' && STATE.ai.ready && STATE.ai.engine) {
      const r = await STATE.ai.engine.chat.completions.create({
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMsg }],
        max_tokens: maxTokens,
      });
      return r.choices[0].message.content;
    }
    if (tier === 'T3' && STATE.config.api_key && STATE.config.api_provider) {
      return await aiCloudCall(systemPrompt, userMsg, maxTokens);
    }
    return null;
  }
  async function aiCloudCall(sys, msg, maxTokens) {
    const provider = STATE.config.api_provider;
    const key = STATE.config.api_key;
    const model = STATE.config.api_model || T3_PROVIDERS[provider]?.default;
    if (provider === 'anthropic') {
      const r = await fetch(T3_PROVIDERS.anthropic.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model, max_tokens: maxTokens, system: sys, messages: [{ role: 'user', content: msg }] }),
      });
      if (!r.ok) throw new Error('Anthropic ' + r.status + ': ' + (await r.text()).slice(0, 200));
      const j = await r.json();
      return j.content[0].text;
    }
    if (provider === 'openai') {
      const r = await fetch(T3_PROVIDERS.openai.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'Authorization': 'Bearer ' + key },
        body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'system', content: sys }, { role: 'user', content: msg }] }),
      });
      if (!r.ok) throw new Error('OpenAI ' + r.status);
      const j = await r.json();
      return j.choices[0].message.content;
    }
    if (provider === 'google') {
      const r = await fetch(T3_PROVIDERS.google.url + model + ':generateContent?key=' + encodeURIComponent(key), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: sys + '\n\n---\n\n' + msg }] }], generationConfig: { maxOutputTokens: maxTokens } }),
      });
      if (!r.ok) throw new Error('Google ' + r.status);
      const j = await r.json();
      return j.candidates[0].content.parts[0].text;
    }
    throw new Error('unknown provider: ' + provider);
  }
  // ─── WebRTC P2P mesh (ported from canonical fallnet · fall-signal channel · Google STUN) ───
  const MESH_CHANNEL = 'fall-signal';
  const STUN_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];
  function meshStart(opts) {
    if (STATE.mesh.active) return;
    opts = opts || {};
    const seedId = opts.seedId || (location.pathname + '#' + Math.random().toString(36).slice(2, 8));
    STATE.mesh.seedId = seedId;
    try { STATE.mesh.bc = new BroadcastChannel(MESH_CHANNEL); }
    catch (e) { console.warn('fall-kit: BroadcastChannel unavailable'); return; }
    STATE.mesh.bc.onmessage = e => {
      const m = e.data;
      if (!m || !m.kind || m.peerId === seedId) return;
      if (opts.onMessage) opts.onMessage(m);
    };
    STATE.mesh.bc.postMessage({ kind: 'fall-kit:hello', peerId: seedId, ts: Date.now(), seedName: opts.seedName || 'unknown' });
    STATE.mesh.active = true;
    notify('Mesh active · channel ' + MESH_CHANNEL, 'ok');
  }
  function meshPost(kind, payload) {
    if (!STATE.mesh.active || !STATE.mesh.bc) return false;
    STATE.mesh.bc.postMessage({ kind: kind, peerId: STATE.mesh.seedId, ts: Date.now(), payload: payload });
    return true;
  }
  // ─── Toast ───────────────────────────────────────────────────────
  function notify(msg, kind) {
    let t = $('#fk-toast');
    if (!t) {
      t = document.createElement('div'); t.id = 'fk-toast';
      t.style.cssText = 'position:fixed;bottom:18px;left:50%;transform:translateX(-50%) translateY(20px);background:#c08a3a;color:#0a0a0a;padding:9px 18px;border-radius:3px;font-family:ui-monospace,Menlo,monospace;font-size:11px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;opacity:0;transition:all .22s;z-index:10000;pointer-events:none';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.background = kind === 'err' ? '#a14a2a' : kind === 'ok' ? '#6b8d4a' : '#c08a3a';
    t.style.color = kind === 'err' ? '#fff' : '#0a0a0a';
    t.style.opacity = '1';
    t.style.transform = 'translateX(-50%) translateY(0)';
    clearTimeout(t._to);
    t._to = setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(-50%) translateY(20px)'; }, 2400);
  }
  // ─── Settings modal ──────────────────────────────────────────────
  function openSettings() {
    let bg = $('#fk-modal-bg');
    if (!bg) {
      bg = document.createElement('div'); bg.id = 'fk-modal-bg';
      bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.72);display:flex;align-items:flex-start;justify-content:center;padding:60px 16px;overflow-y:auto;z-index:9999';
      bg.onclick = e => { if (e.target.id === 'fk-modal-bg') closeSettings(); };
      document.body.appendChild(bg);
    }
    const tier = aiTier();
    const provider = STATE.config.api_provider || 'anthropic';
    const providerCfg = T3_PROVIDERS[provider];
    bg.innerHTML = `
      <div style="background:#13121a;border:1px solid #c08a3a;border-radius:5px;max-width:600px;width:100%;padding:22px 24px;color:#ebe3d2;font-family:system-ui,-apple-system,sans-serif;font-size:13.5px;line-height:1.55">
        <div style="margin-bottom:14px"><label style="display:block;font-size:11px;color:#a89e88;letter-spacing:.04em;margin-bottom:6px;text-transform:uppercase">Tier</label>
          <select id="fk-tier" style="width:100%;padding:8px 11px;background:#1a1922;border:1px solid #3a342c;color:#ebe3d2;border-radius:3px;font-size:13.5px;font-family:inherit">
            <option value="T0"${tier==='T0'?' selected':''}>T0 · off (default · the seed works fully without AI)</option>
            <option value="T2"${tier==='T2'?' selected':''}>T2 · WebLLM in-browser · sovereign · pick a model below</option>
            <option value="T3"${tier==='T3'?' selected':''}>T3 · BYOK · Anthropic / OpenAI / Google · stored in your browser only</option>
          </select>
        </div>
        <div id="fk-t2-block" style="display:${tier==='T2'?'block':'none'};margin-bottom:14px;padding:12px 14px;background:#1a1922;border:1px solid #2a2934;border-radius:4px">
          <label style="display:block;font-size:11px;color:#a89e88;letter-spacing:.04em;margin-bottom:6px;text-transform:uppercase">WebLLM model · 1B → 70B cascade</label>
          <select id="fk-model" style="width:100%;padding:8px 11px;background:#22212c;border:1px solid #3a342c;color:#ebe3d2;border-radius:3px;font-size:13px;font-family:inherit">
            ${Object.entries(WEBLLM_MODELS).map(([k,m]) => `<option value="${k}"${(STATE.config.webllm_model||DEFAULT_MODEL)===k?' selected':''}>${esc(m.label)} · ${esc(m.size)}</option>`).join('')}
          </select>
          <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <button id="fk-load-llm" style="padding:7px 14px;background:#c08a3a;color:#0a0a0a;border:none;border-radius:3px;font-weight:600;font-size:12px;cursor:pointer;font-family:inherit">${STATE.ai.ready?'✓ Loaded · switch':'Load model (one-time download)'}</button>
            <span id="fk-llm-status" style="font-family:ui-monospace,Menlo,monospace;font-size:10px;color:#a89e88;letter-spacing:.04em">${STATE.ai.ready?'ready':STATE.ai.loading?Math.round(STATE.ai.progress)+'%':'not loaded'}</span>
          </div>
          <div style="margin-top:8px;font-size:11px;color:#6e6a5e;line-height:1.55">First load downloads the model from @mlc-ai/web-llm CDN. Cached forever after. Inference is 100% local — open DevTools → Network during use, nothing leaves.</div>
        </div>
        <div id="fk-t3-block" style="display:${tier==='T3'?'block':'none'};margin-bottom:14px;padding:12px 14px;background:#1a1922;border:1px solid #2a2934;border-radius:4px">
          <label style="display:block;font-size:11px;color:#a89e88;letter-spacing:.04em;margin-bottom:6px;text-transform:uppercase">BYOK provider</label>
          <select id="fk-provider" style="width:100%;padding:8px 11px;background:#22212c;border:1px solid #3a342c;color:#ebe3d2;border-radius:3px;font-size:13px;font-family:inherit;margin-bottom:10px">
            ${Object.entries(T3_PROVIDERS).map(([k,p]) => `<option value="${k}"${provider===k?' selected':''}>${esc(p.label)}</option>`).join('')}
          </select>
          <label style="display:block;font-size:11px;color:#a89e88;letter-spacing:.04em;margin-bottom:6px;text-transform:uppercase">Model</label>
          <select id="fk-api-model" style="width:100%;padding:8px 11px;background:#22212c;border:1px solid #3a342c;color:#ebe3d2;border-radius:3px;font-size:13px;font-family:inherit;margin-bottom:10px">
            ${providerCfg.models.map(m => `<option value="${m}"${(STATE.config.api_model||providerCfg.default)===m?' selected':''}>${esc(m)}</option>`).join('')}
          </select>
          <label style="display:block;font-size:11px;color:#a89e88;letter-spacing:.04em;margin-bottom:6px;text-transform:uppercase">API key</label>
          <input type="password" id="fk-key" value="${esc(STATE.config.api_key || '')}" placeholder="${STATE.config.api_key ? '(set · leave empty to keep)' : 'sk-ant-... or sk-... or AIza...'}" autocomplete="off" style="width:100%;padding:8px 11px;background:#22212c;border:1px solid #3a342c;color:#ebe3d2;border-radius:3px;font-size:13px;font-family:ui-monospace,Menlo,monospace">
          <div style="margin-top:8px;font-size:11px;color:#6e6a5e;line-height:1.55">Key lives in this browser only (localStorage). Sent direct to the provider — never to us. Wipe with Reset.</div>
        </div>
        <div style="margin-bottom:14px;padding:12px 14px;background:#1a1922;border:1px solid #2a2934;border-radius:4px">
          <label style="display:block;font-size:11px;color:#a89e88;letter-spacing:.04em;margin-bottom:6px;text-transform:uppercase">Cross-seed mesh</label>
          <div style="display:flex;gap:8px;align-items:center">
            <button id="fk-mesh-toggle" style="padding:6px 12px;background:${STATE.mesh.active?'#6b8d4a':'#1a1922'};color:${STATE.mesh.active?'#fff':'#a89e88'};border:1px solid ${STATE.mesh.active?'#6b8d4a':'#3a342c'};border-radius:3px;font-size:11px;cursor:pointer;font-family:inherit">${STATE.mesh.active?'✓ Active · disconnect':'Activate mesh'}</button>
            <span style="font-family:ui-monospace,Menlo,monospace;font-size:10px;color:#6e6a5e;letter-spacing:.04em">channel · <code style="background:#22212c;padding:1px 5px;border-radius:2px">${MESH_CHANNEL}</code></span>
          </div>
          <div style="margin-top:8px;font-size:11px;color:#6e6a5e;line-height:1.55">BroadcastChannel for same-device · WebRTC for cross-device (planned). Other estate seeds on the same channel discover each other automatically.</div>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
          <button onclick="FallKit.closeSettings()" style="padding:7px 14px;background:transparent;color:#a89e88;border:1px solid #3a342c;border-radius:3px;font-size:12px;cursor:pointer;font-family:inherit">Close</button>
          <button id="fk-save" style="padding:7px 14px;background:#c08a3a;color:#0a0a0a;border:none;border-radius:3px;font-weight:600;font-size:12px;cursor:pointer;font-family:inherit">Save</button>
        </div>
      </div>`;
    // Wire interactions
    $('#fk-tier').onchange = () => {
      const t = $('#fk-tier').value;
      $('#fk-t2-block').style.display = t === 'T2' ? 'block' : 'none';
      $('#fk-t3-block').style.display = t === 'T3' ? 'block' : 'none';
    };
    $('#fk-provider') && ($('#fk-provider').onchange = () => {
      const p = $('#fk-provider').value;
      const sel = $('#fk-api-model');
      sel.innerHTML = T3_PROVIDERS[p].models.map(m => `<option value="${m}">${esc(m)}</option>`).join('');
    });
    $('#fk-load-llm') && ($('#fk-load-llm').onclick = () => {
      const m = $('#fk-model').value;
      loadWebLLM(m);
    });
    $('#fk-mesh-toggle').onclick = () => {
      if (STATE.mesh.active) { STATE.mesh.bc?.close(); STATE.mesh.active = false; STATE.mesh.bc = null; notify('Mesh disconnected'); }
      else meshStart({ seedName: STATE.config.seedName || 'seed' });
      openSettings();  // refresh modal
    };
    $('#fk-save').onclick = () => {
      STATE.config.ai_tier = $('#fk-tier').value;
      if ($('#fk-model')) STATE.config.webllm_model = $('#fk-model').value;
      if ($('#fk-provider')) STATE.config.api_provider = $('#fk-provider').value;
      if ($('#fk-api-model')) STATE.config.api_model = $('#fk-api-model').value;
      const newKey = $('#fk-key')?.value;
      if (newKey) STATE.config.api_key = newKey;
      saveConfig(); renderAiChip(); notify('Saved', 'ok'); closeSettings();
    };
  }
  function closeSettings() { const bg = $('#fk-modal-bg'); if (bg) bg.remove(); }
  // ─── Help section (returns HTML string for inclusion in seed Help tabs) ───
  function helpSection() {
    return `<div style="background:rgba(192,138,58,.05);border:1px solid #3a342c;border-radius:4px;padding:18px 22px;margin:14px 0">
      <p style="font-size:13px;color:#a89e88;line-height:1.7;margin-bottom:10px">This seed runs fully without AI (<strong style="color:#c08a3a">T0</strong>, default). Enable a tier in settings if you want AI-assist features:</p>
      <table style="width:100%;border-collapse:collapse;font-size:12.5px">
        <thead><tr><th style="padding:6px 10px;text-align:left;background:rgba(0,0,0,.2);font-family:ui-monospace,Menlo,monospace;font-size:10px;color:#a89e88;letter-spacing:.08em;text-transform:uppercase">Tier</th><th style="padding:6px 10px;text-align:left;background:rgba(0,0,0,.2);font-family:ui-monospace,Menlo,monospace;font-size:10px;color:#a89e88;letter-spacing:.08em;text-transform:uppercase">What it is</th></tr></thead>
        <tbody>
          <tr><td style="padding:6px 10px;border-top:1px solid #2a2934;color:#c08a3a;font-weight:600">T0</td><td style="padding:6px 10px;border-top:1px solid #2a2934;color:#a89e88">Off. The seed works fully. No AI · no downloads · no API calls.</td></tr>
          <tr><td style="padding:6px 10px;border-top:1px solid #2a2934;color:#c08a3a;font-weight:600">T2</td><td style="padding:6px 10px;border-top:1px solid #2a2934;color:#a89e88">WebLLM in-browser. Pick a model: 1B (700MB, fast) → 3B (2GB, balanced) → 7B (5GB, capable) → 70B (40GB, frontier). One-time download, runs offline forever after. Zero data leaves your device.</td></tr>
          <tr><td style="padding:6px 10px;border-top:1px solid #2a2934;color:#c08a3a;font-weight:600">T3</td><td style="padding:6px 10px;border-top:1px solid #2a2934;color:#a89e88">BYOK · Anthropic Claude · OpenAI GPT · Google Gemini. You bring the API key, you pay the provider direct. Key stays in your browser, sent direct to the provider, never proxied.</td></tr>
        </tbody>
      </table>
      <p style="font-size:12px;color:#6e6a5e;line-height:1.6;margin-top:10px">Open the AI chip in the header to switch tier or check status. Cross-seed mesh activates a BroadcastChannel on <code style="background:#1a1922;padding:1px 5px;border-radius:2px">${MESH_CHANNEL}</code> so other estate seeds on the same device discover this one.</p>
    </div>`;
  }
  // ─── CSS for AI chip ─────────────────────────────────────────────
  function injectCss() {
    const s = document.createElement('style');
    s.id = 'fk-css';
    s.textContent = `
      #fk-ai-chip { display:inline-flex; align-items:center; gap:6px; padding:4px 9px; border-radius:3px; font-family:ui-monospace,Menlo,monospace; font-size:10px; letter-spacing:.08em; text-transform:uppercase; font-weight:600; cursor:pointer; border:1px solid #3a342c; background:#1a1922; color:#a89e88; user-select:none; vertical-align:middle }
      #fk-ai-chip:hover { border-color:#c08a3a; color:#ebe3d2 }
      #fk-ai-chip.fk-chip-live { border-color:#6b8d4a; color:#6b8d4a; background:rgba(107,141,74,.10) }
      #fk-ai-chip.fk-chip-loading { border-color:#e8a83a; color:#e8a83a; background:rgba(232,168,58,.10) }
      #fk-ai-chip.fk-chip-warn { border-color:#a14a2a; color:#a14a2a; background:rgba(161,74,42,.08) }
      #fk-ai-chip .fk-dot { width:6px; height:6px; border-radius:50%; background:currentColor; flex-shrink:0 }
      #fk-ai-chip.fk-chip-loading .fk-dot { animation:fk-pulse 1s infinite }
      @keyframes fk-pulse { 0%,100%{opacity:1}50%{opacity:.3} }
      .fk-ai-assist { display:inline-flex; align-items:center; gap:5px; padding:4px 9px; font-size:11px; border:1px solid #c08a3a; color:#c08a3a; background:transparent; border-radius:3px; cursor:pointer; font-family:inherit }
      .fk-ai-assist:hover { background:#c08a3a; color:#0a0a0a }
      .fk-ai-assist::before { content:'✦'; font-size:12px }
    `;
    document.head.appendChild(s);
  }
  // ─── KCC Mint launcher (v1.2 · fork-this-seed shortcut) ──────────
  function openMint() {
    const slug = (STATE.config.seedName || location.hostname.split('.')[0] || 'seed').replace(/[^a-z0-9-]/gi, '-').toLowerCase();
    const url = location.href.split('?')[0].split('#')[0];
    const params = new URLSearchParams({ fork: '1', parent_slug: slug, parent_name: name, parent_url: url, parent_desc: desc });
  }
  // ─── Init ────────────────────────────────────────────────────────
  function init(opts) {
    opts = opts || {};
    injectCss();
    if (opts.seedName) STATE.config.seedName = opts.seedName;
    if ($('#fk-ai-chip')) { renderAiChip(); return { version: FALL_KIT_VERSION, mounted: false }; }
    const chip = document.createElement('button');
    chip.id = 'fk-ai-chip';
    chip.title = 'AI cascade · click to configure tier and model';
    chip.innerHTML = '<span class="fk-dot"></span><span id="fk-ai-chip-text">T0 · off</span>';
    chip.onclick = openSettings;
    // Try anchor first, fall back to floating bottom-right
    const anchor = opts.chipAnchor ? $(opts.chipAnchor) : null;
    if (anchor) { anchor.appendChild(chip); }
    else {
      chip.style.cssText += ';position:fixed;bottom:14px;left:14px;z-index:9998;box-shadow:0 4px 14px rgba(0,0,0,.4)';
      document.body.appendChild(chip);
    }
    // v1.2 · floating mint button next to chip
    if (!$('#fk-mint-btn') && !opts.hideMint) {
      const mintBtn = document.createElement('button');
      mintBtn.id = 'fk-mint-btn';
      mintBtn.title = 'Mint a fork of this seed as a KCC bundle · provenance economy';
      mintBtn.innerHTML = '<span style="font-size:13px">✦</span> mint fork';
      mintBtn.style.cssText = 'position:fixed;bottom:14px;left:130px;z-index:9998;display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border-radius:3px;font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:.08em;text-transform:uppercase;font-weight:600;cursor:pointer;border:1px solid #c08a3a;color:#c08a3a;background:rgba(10,10,15,.7);box-shadow:0 4px 14px rgba(0,0,0,.4)';
      mintBtn.onmouseover = () => { mintBtn.style.background = '#c08a3a'; mintBtn.style.color = '#0a0a0a'; };
      mintBtn.onmouseout  = () => { mintBtn.style.background = 'rgba(10,10,15,.7)'; mintBtn.style.color = '#c08a3a'; };
      mintBtn.onclick = openMint;
      document.body.appendChild(mintBtn);
    }
    renderAiChip();
    return { version: FALL_KIT_VERSION, mounted: true };
  }
  // ─── Public API ──────────────────────────────────────────────────
  root.FallKit = {
    version: FALL_KIT_VERSION,
    init: init,
    aiTier: aiTier,
    aiComplete: aiComplete,
    loadWebLLM: loadWebLLM,
    openSettings: openSettings,
    closeSettings: closeSettings,
    renderAiChip: renderAiChip,
    helpSection: helpSection,
    meshStart: meshStart,
    meshPost: meshPost,
    notify: notify,
    openMint: openMint,  // v1.2 · launch kcc-mint with this seed prefilled as parent
    MODELS: WEBLLM_MODELS,
    PROVIDERS: T3_PROVIDERS,
    state: STATE,
  };
})(typeof window !== 'undefined' ? window : globalThis);
  // fall-kit init · auto-mounts a floating AI chip bottom-left
  (function () {
    function go() { if (typeof FallKit !== 'undefined') FallKit.init({ seedName: "fallhr-us" }); }
    else go();
  })();
'use strict';
const TOOLNAME='fallhr-us',VERSION='1.0.0',PRIME=1009,STORE='fallhr-us-v1';
const TABS=[{id:'dashboard',label:'dashboard'},{id:'employees',label:'employees'},{id:'holiday',label:'holiday'},{id:'absence',label:'absence'},{id:'reviews',label:'reviews'},{id:'contracts',label:'contracts'},{id:'compliance',label:'compliance'},{id:'qa',label:'Q&A'}];
const RULES={
  statutoryHolidayDays:28, // 5.6 weeks for full-time
  smpFlatWeekly:184.03,
  sspWeekly:118.75,
  sspWaitingDays:3,
  sspMaxWeeks:28,
  autoEnrolMinAge:22,
  autoEnrolMinEarnings:10000,
  autoEnrolEmployer:0.03,
  autoEnrolEmployee:0.05,
  niSecondaryThreshold:9100,
  niEmployerRate:0.138,
  rightToWorkRetentionYears:2,
  noticeStatutoryMinWeeksOver1Yr:1, // +1 per year of service to max 12
  RIFQualifyingYears:2,
};
let state={active:'dashboard',firm:null,employees:[],holiday:[],absence:[],reviews:[],contracts:[],complianceChecks:[],audit:[],
  ui:{chat:[]},settings:{anthropicKey:'',auditChain:true}};
const $=(s,p=document)=>p.querySelector(s);const uid=p=>(p||'')+'_'+Math.random().toString(36).slice(2,11);const now=()=>Date.now();
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>{const v=Number(n);return isNaN(v)?'—':'$'+v.toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2})};
const dateStr=ts=>{if(!ts)return '—';return new Date(ts).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})};
const yearsBetween=(d1,d2)=>{if(!d1)return 0;const ms=(d2||now())-new Date(d1).getTime();return Math.floor(ms/(365.25*24*60*60*1000))};
function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('show');clearTimeout(t._to);t._to=setTimeout(()=>t.classList.remove('show'),1900)}
async function sha256(s){const buf=new TextEncoder().encode(s);const h=await crypto.subtle.digest('SHA-256',buf);return Array.from(new Uint8Array(h)).map(b=>b.toString(16).padStart(2,'0')).join('')}
let db;
function openDB(){return new Promise((res,rej)=>{const r=indexedDB.open(STORE,1);r.onupgradeneeded=e=>{const d=e.target.result;['state','audit','firms','employees','holiday','absence','reviews','contracts'].forEach(s=>{if(!d.objectStoreNames.contains(s))d.createObjectStore(s,{keyPath:s==='state'?undefined:'id'})})};r.onsuccess=e=>{db=e.target.result;res(db)};r.onerror=rej})}
function idbGetAll(s){return new Promise(res=>{const tx=db.transaction(s,'readonly');const q=tx.objectStore(s).getAll();q.onsuccess=()=>res(q.result||[]);q.onerror=()=>res([])})}
function idbGet(s,k){return new Promise(res=>{const tx=db.transaction(s,'readonly');const q=tx.objectStore(s).get(k);q.onsuccess=()=>res(q.result);q.onerror=()=>res(null)})}
function idbPut(s,v,k){return new Promise(res=>{const tx=db.transaction(s,'readwrite');const o=tx.objectStore(s);const q=k!=null?o.put(v,k):o.put(v);q.onsuccess=()=>res(true);q.onerror=()=>res(false)})}
async function loadAll(){if(!db)await openDB();const[firms,emps,hol,abs,rev,con,auditArr,uiState]=await Promise.all([idbGetAll('firms'),idbGetAll('employees'),idbGetAll('holiday'),idbGetAll('absence'),idbGetAll('reviews'),idbGetAll('contracts'),idbGetAll('audit'),idbGet('state','ui')]);state.firm=firms[0]||null;state.employees=emps;state.holiday=hol;state.absence=abs;state.reviews=rev;state.contracts=con;state.audit=auditArr.sort((a,b)=>a.i-b.i);if(uiState){state.ui=Object.assign({},state.ui,uiState.value||{});state.settings=Object.assign({},state.settings,uiState.settings||{});if(uiState.value?.complianceChecks)state.complianceChecks=uiState.value.complianceChecks}}
async function persistUI(){await idbPut('state',{value:{...state.ui,complianceChecks:state.complianceChecks},settings:state.settings},'ui')}
async function auditLog(action,opts={}){if(!state.settings.auditChain)return;const prev=state.audit.length?state.audit[state.audit.length-1]:null;const i=(prev?prev.i:0)+1;const entry={id:uid('au'),i,ts:now(),tool:TOOLNAME,action,reasoning:opts.reasoning||'',configVersion:TOOLNAME+'@'+VERSION,prevHash:prev?.docHash||'',docHash:'',payload:opts.payload||{}};entry.docHash=await sha256(JSON.stringify({i,ts:entry.ts,action,prevHash:entry.prevHash,payload:entry.payload}));state.audit.push(entry);await idbPut('audit',entry)}
let bcHr,bcSignal;
function initMesh(){try{bcSignal=new BroadcastChannel('fall-signal');bcSignal.postMessage({source:TOOLNAME,type:'hello',prime:PRIME,version:VERSION,ts:now()})}catch(e){}try{bcHr=new BroadcastChannel('fall-hr');bcHr.addEventListener('message',async e=>{const m=e.data;if(!m||m.source===TOOLNAME)return;if(m.type==='sync.request'){bcHr.postMessage({v:1,type:'sync.snapshot',ts:now(),source:TOOLNAME,payload:{employees:state.employees,firm:state.firm}})}else if(m.type==='sync.snapshot'){const p=m.payload||{};if(Array.isArray(p.employees))for(const x of p.employees){if(!state.employees.find(y=>y.id===x.id)){state.employees.push(x);await idbPut('employees',x)}}render()}});bcHr.postMessage({v:1,type:'sync.request',ts:now(),source:TOOLNAME})}catch(e){}}
function activeEmps(){return state.employees.filter(e=>e.status==='active')}
function holidayUsed(empId,yr){const y=yr||new Date().getFullYear();return state.holiday.filter(h=>h.employeeId===empId&&h.status==='approved'&&new Date(h.startDate).getFullYear()===y).reduce((s,h)=>s+Number(h.days||0),0)}
function holidayPending(){return state.holiday.filter(h=>h.status==='requested').length}
function absenceDaysYTD(empId){const yearStart=new Date(new Date().getFullYear(),0,1);return state.absence.filter(a=>a.employeeId===empId&&new Date(a.startDate)>=yearStart).reduce((s,a)=>s+Number(a.days||0),0)}
function bradfordFactor(empId){const yearStart=new Date(new Date().getFullYear(),0,1);const inst=state.absence.filter(a=>a.employeeId===empId&&new Date(a.startDate)>=yearStart);const n=inst.length;const d=inst.reduce((s,a)=>s+Number(a.days||0),0);return n*n*d}
function reviewDue(emp){if(!emp.lastReviewDate)return true;const months=(now()-new Date(emp.lastReviewDate).getTime())/(30.44*24*60*60*1000);return months>=12}
function render(){$('#tabNav').innerHTML=TABS.map(t=>`<button class="${state.active===t.id?'active':''}" onclick="switchTab('${t.id}')">${t.label}</button>`).join('');const v=$('#view');switch(state.active){case 'dashboard':return renderDashboard(v);case 'employees':return renderEmployees(v);case 'holiday':return renderHoliday(v);case 'absence':return renderAbsence(v);case 'reviews':return renderReviews(v);case 'contracts':return renderContracts(v);case 'compliance':return renderCompliance(v);case 'qa':return renderQA(v)}}
function switchTab(id){state.active=id;persistUI();render()}
function renderDashboard(v){const reviewsDue=activeEmps().filter(reviewDue).length;
function renderEmployees(v){v.innerHTML=`<div class="section-h"><h2>Employees</h2><div class="sub">${state.employees.length}</div><div class="actions"><button class="btn brass sm" onclick="openModal('addEmp')">+ Employee</button></div></div>${state.employees.length?`<table><thead><tr><th>Name</th><th>Job title</th><th>Start date</th><th>Service</th><th>Status</th><th>RTW</th><th>Holiday used YTD</th></tr></thead><tbody>${state.employees.sort((a,b)=>(b.startDate||'').localeCompare(a.startDate||'')).map(e=>{const yrs=yearsBetween(e.startDate);const hUsed=holidayUsed(e.id);return `<tr><td><strong>${esc(e.firstName)} ${esc(e.lastName)}</strong><div style="font-size:11px;color:var(--cream-muted)">${esc(e.email)}</div></td><td>${esc(e.jobTitle)}</td><td>${esc(e.startDate)}</td><td>${yrs}y ${e.startDate?Math.floor(((now()-new Date(e.startDate))/(30.44*24*60*60*1000))%12):0}m</td><td><span class="pill ${e.status==='active'?'green':e.status==='probation'?'amber':e.status==='leaver'?'red':'blue'}">${e.status}</span></td><td><span class="pill ${e.rtw?.verified?'green':'red'}">${e.rtw?.verified?'✓':'✗'}</span></td><td class="num">${hUsed}/${e.holidayEntitlement||28}</td></tr>`}).join('')}</tbody></table>`:'<div class="empty">No employees yet.</div>'}`}
function renderHoliday(v){v.innerHTML=`<div class="section-h"><h2>Holiday</h2><div class="sub">${holidayPending()} pending</div><div class="actions"><button class="btn brass sm" onclick="openModal('addHoliday')">+ Request</button></div></div>${state.holiday.length?`<table><thead><tr><th>Employee</th><th>Start</th><th>End</th><th class="num">Days</th><th>Type</th><th>Status</th><th>Action</th></tr></thead><tbody>${state.holiday.sort((a,b)=>(b.startDate||'').localeCompare(a.startDate||'')).map(h=>{const emp=state.employees.find(e=>e.id===h.employeeId);return `<tr><td>${esc(emp?(emp.firstName+' '+emp.lastName):h.employeeId.slice(0,8))}</td><td>${esc(h.startDate)}</td><td>${esc(h.endDate)}</td><td class="num">${h.days}</td><td><span class="pill ${h.type==='annual'?'blue':h.type==='sick'?'red':'amber'}">${h.type}</span></td><td><span class="pill ${h.status==='approved'?'green':h.status==='rejected'?'red':'amber'}">${h.status}</span></td><td>${h.status==='requested'?`<button class="btn sm" style="border-color:var(--green);color:var(--green)" onclick="approveHoliday('${h.id}')">✓</button> <button class="btn sm danger" onclick="rejectHoliday('${h.id}')">✗</button>`:'—'}</td></tr>`}).join('')}</tbody></table>`:'<div class="empty">No holiday requests.</div>'}`}
async function approveHoliday(id){const h=state.holiday.find(x=>x.id===id);if(!h)return;h.status='approved';h.decisionAt=now();await idbPut('holiday',h);await auditLog('holiday.approved',{payload:{id}});toast('Approved');render()}
async function rejectHoliday(id){const h=state.holiday.find(x=>x.id===id);if(!h)return;h.status='rejected';h.decisionAt=now();await idbPut('holiday',h);await auditLog('holiday.rejected',{payload:{id}});toast('Rejected');render()}
function renderAbsence(v){v.innerHTML=`<div class="section-h"><h2>Absence</h2><div class="sub">PTO ${fmt(RULES.sspWeekly)}/wk · ${RULES.sspWaitingDays} waiting days</div><div class="actions"><button class="btn brass sm" onclick="openModal('addAbsence')">+ Absence</button></div></div>${state.absence.length?`<table><thead><tr><th>Employee</th><th>Start</th><th>End</th><th class="num">Days</th><th>Reason</th><th class="num">Bradford factor</th><th>Self-cert/Fit note</th></tr></thead><tbody>${state.absence.sort((a,b)=>(b.startDate||'').localeCompare(a.startDate||'')).map(a=>{const emp=state.employees.find(e=>e.id===a.employeeId);const bf=emp?bradfordFactor(emp.id):0;return `<tr><td>${esc(emp?(emp.firstName+' '+emp.lastName):a.employeeId.slice(0,8))}</td><td>${esc(a.startDate)}</td><td>${esc(a.endDate||'ongoing')}</td><td class="num">${a.days}</td><td>${esc(a.reason)}</td><td class="num" style="color:${bf>200?'var(--red)':bf>100?'var(--amber)':'var(--cream-dim)'};">${bf}</td><td>${esc(a.evidence||'—')}</td></tr>`}).join('')}</tbody></table>`:'<div class="empty">No absence recorded.</div>'}<div class="card" style="margin-top:18px"><h3>Bradford Factor (informational)</h3><p style="font-size:12px;color:var(--cream-dim);line-height:1.55">B = S² × D, where S = number of absence instances and D = total days absent in the period. Threshold guidance varies by employer policy. Common: 50 = trigger informal chat, 100 = formal review, 200+ = formal action under capability or disciplinary policy.</p></div>`}
function renderReviews(v){v.innerHTML=`<div class="section-h"><h2>Performance Reviews</h2><div class="sub">${activeEmps().filter(reviewDue).length} due</div><div class="actions"><button class="btn brass sm" onclick="openModal('addReview')">+ Review</button></div></div>${state.reviews.length?`<table><thead><tr><th>Employee</th><th>Date</th><th>Cycle</th><th>Rating</th><th>Outcome</th><th>Next review</th></tr></thead><tbody>${state.reviews.sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(r=>{const emp=state.employees.find(e=>e.id===r.employeeId);return `<tr><td>${esc(emp?(emp.firstName+' '+emp.lastName):r.employeeId.slice(0,8))}</td><td>${esc(r.date)}</td><td>${esc(r.cycle)}</td><td><span class="pill ${r.rating==='exceeding'?'green':r.rating==='meeting'?'blue':r.rating==='developing'?'amber':'red'}">${r.rating}</span></td><td>${esc(r.outcome||'—')}</td><td>${esc(r.nextDate||'—')}</td></tr>`}).join('')}</tbody></table>`:'<div class="empty">No reviews recorded.</div>'}`}
function renderContracts(v){v.innerHTML=`<div class="section-h"><h2>Contracts</h2><div class="sub">${state.contracts.length}</div><div class="actions"><button class="btn brass sm" onclick="openModal('addContract')">+ Contract</button></div></div>${state.contracts.length?`<table><thead><tr><th>Employee</th><th>Type</th><th>Issue date</th><th>Signed</th><th>S.1 Statement</th></tr></thead><tbody>${state.contracts.map(c=>{const emp=state.employees.find(e=>e.id===c.employeeId);return `<tr><td>${esc(emp?(emp.firstName+' '+emp.lastName):c.employeeId.slice(0,8))}</td><td>${esc(c.contractType)}</td><td>${esc(c.issueDate)}</td><td><span class="pill ${c.signed?'green':'amber'}">${c.signed?'yes':'pending'}</span></td><td><span class="pill ${c.s1Statement?'green':'red'}">${c.s1Statement?'issued':'missing'}</span></td></tr>`}).join('')}</tbody></table>`:'<div class="empty">No contracts.</div>'}<div class="card" style="margin-top:18px"><h3>S.1 Employment Rights Act 1996 — written statement of particulars</h3><p style="font-size:12px;color:var(--cream-dim);line-height:1.55">Since 6 April 2020, employers must issue a written statement of employment particulars to all workers (not just employees) on or before day one of work. Failure can lead to Employment Tribunal award of 2-4 weeks pay. Generate via FallHRPaper.</p></div>`}
function renderCompliance(v){const checks=[
  {id:'s1Statement',name:'S.1 written statement of particulars (day 1)',cat:'Statutory',desc:'ERA 1996 s.1. Day-one right since 6 Apr 2020. Tribunal award 2-4 weeks pay if missing.'},
  {id:'rtwAll',name:'Right to Work checks complete for all employees',cat:'Immigration',desc:'Immigration, Asylum and Nationality Act 2006. Civil penalty up to $45,000 per illegal worker. Retain copies for duration + 2 years.'},
  {id:'autoEnrolPension',name:'Auto-enrolment pension scheme in place',cat:'Pensions',desc:'Pensions Act 2008. Mandatory for eligible jobholders (22+ earning $10k+). Employer 3% min, employee 5% min. TPR enforcement.'},
  {id:'workingTimeOptOut',name:'Working Time opt-outs documented (if >48hrs)',cat:'Working Time',desc:'WTR 1998 reg 4(1). 48-hr weekly maximum unless opted-out in writing. Records retained 2 years.'},
  {id:'gdprPrivacyNotice',name:'Employee privacy notice (US CCPA Art.13)',cat:'Data',desc:'Issue at hire. Lawful basis usually contract performance (Art.6(1)(b)) and legitimate interest. ICO registration if processing personal data.'},
  {id:'disciplinaryPolicy',name:'Disciplinary & grievance procedure (DOL Code)',cat:'Conduct',desc:'DOL Code of Practice on Disciplinary and Grievance Procedures. Tribunal awards uplifted up to 25% for unreasonable non-compliance.'},
  {id:'equalityPolicy',name:'Equality, diversity and anti-harassment policy',cat:'Equality',desc:'Equality Act 2010. 9 protected characteristics. Worker Protection Act 2023: positive duty to prevent sexual harassment from 26 Oct 2024.'},
  {id:'healthSafety',name:'Health & Safety policy (if 5+ employees)',cat:'H&S',desc:'Health and Safety at Work Act 1974. Written H&S policy required if 5+ employees. Risk assessments documented.'},
  {id:'elInsurance',name:'Employers Liability insurance ($5M min)',cat:'Insurance',desc:'Employers Liability (Compulsory Insurance) Act 1969. Certificate displayed. Penalty up to $2,500/day uninsured.'},
  {id:'paye',name:'PAYE/RTI registered with HMRC',cat:'Payroll',desc:'Real Time Information. FPS by/on payday. EPS by 19th. W-2 by 31 May. P11D by 6 Jul.'},
  {id:'minimumWage',name:'National Minimum/Living Wage compliance',cat:'Pay',desc:'NMW Act 1998. NLW $11.44/hr (age 21+) from Apr 2024. Naming and shaming for breaches.'},
  {id:'genderPayGap',name:'Gender pay gap reporting (if 250+ employees)',cat:'Equality',desc:'Equality Act 2010 (Gender Pay Gap Information) Regulations 2017. Annual snapshot 5 April, publish by 4 April following year.'},
];
  const done=state.complianceChecks||[];
  v.innerHTML=`<div class="section-h"><h2>Compliance</h2><div class="sub">${done.length}/${checks.length}</div></div><div style="display:flex;flex-direction:column;gap:6px">${checks.map(c=>{const isDone=done.includes(c.id);return `<div class="card" style="cursor:pointer;padding:12px 16px;${isDone?'opacity:0.6':''}" onclick="toggleComp('${c.id}')"><div style="display:flex;gap:10px;align-items:flex-start"><span style="font-size:16px;flex-shrink:0;width:20px">${isDone?'<span style="color:var(--green)">✓</span>':'○'}</span><div><strong>${esc(c.name)}</strong><div style="font-size:11px;color:var(--cream-muted);margin-top:2px">${esc(c.cat)} · ${esc(c.desc)}</div></div></div></div>`}).join('')}</div>`}
async function toggleComp(id){if(!state.complianceChecks)state.complianceChecks=[];const idx=state.complianceChecks.indexOf(id);if(idx>=0)state.complianceChecks.splice(idx,1);else state.complianceChecks.push(id);await persistUI();await auditLog('compliance.toggle',{payload:{id}});render()}
const T0_QA=[
  {q:/s\.?1|statement of particulars|day.?one/i,a:'Employment Rights Act 1996 s.1: written statement of employment particulars must be issued to all workers (not just employees) on or before day one. Must include: names, start date, pay, hours, holiday, sick pay, notice, place of work, job description, probation, training, benefits, disciplinary/grievance procedure. Failure: EEOC charge award 2-4 weeks pay (Employment Act 2002 s.38). Since 6 Apr 2020 this is a day-one right (was 2 months previously).'},
  {q:/rtw|right.?to.?work|immigration/i,a:'Immigration, Asylum and Nationality Act 2006: verify Right to Work BEFORE engagement starts. Documents: US/Irish passport, gov.uk share code (non-US nationals), BRP, valid visa. Online checks via gov.uk for non-US. Keep copies for duration + 2 years. Civil penalty up to $45,000 per illegal worker (Feb 2024). Repeat: criminal prosecution.'},
  {q:/pension|auto.?enrol|nest/i,a:'Pensions Act 2008: auto-enrolment for eligible jobholders (age 22 to SPA, earning $10,000+ in pay reference period). Minimum contributions: employer 3%, employee 5%, total 8% (since 6 Apr 2019). Earnings band $6,240-$50,270 (2024/25). Re-enrolment every 3 years. The Pensions Regulator (TPR) enforces; fixed penalty $400 then escalating daily penalties.'},
  {q:/wtr|working.?time|48|holiday/i,a:'Working Time Regulations 1998: 48-hour maximum weekly working time (averaged 17 weeks) unless opted out in writing. 5.6 weeks paid annual leave (28 days FT incl bank holidays — employer may include or exclude). Rest breaks: 20 min if working over 6 hrs. Daily rest: 11 consecutive hrs. Weekly rest: 24 hrs (or 48 hrs/14 days). Night work limits: 8 hrs avg in 24.'},
  {q:/ssp|sick.?pay|fit.?note|self.?cert/i,a:'Statutory Sick Pay (PTO): $118.75/week from 6 Apr 2025. Qualifying days, 3 waiting days, max 28 weeks. Self-certification for first 7 days, fit note required from day 8 (GP, AHP, or hospital doctor). Employer recovery via PAYE Percentage Threshold Scheme abolished from Apr 2014. Records retained 3 years.'},
  {q:/maternity|smp|paternity|adoption/i,a:'Statutory Maternity Pay (SMP): 90% earnings for 6 weeks, then $184.03/week or 90% (whichever lower) for 33 weeks. Total 39 weeks paid, 52 weeks total leave. Notification 15 weeks before EWC. Form SMP1 if not qualifying. Statutory Paternity Pay 1-2 weeks at $184.03 or 90%. Shared Parental Pay up to 37 weeks shared. KIT days: 10 (SPLIT 20). SPP and ShPP eligibility: 26 weeks service.'},
  {q:/redund|notice|dismiss|unfair/i,a:'Redundancy: qualifying service 2 years for statutory pay. Calculation: half/full/1.5 weeks pay per year of service (under 22 / 22-40 / 41+), capped at $719/week (2025) and 20 years max. Notice: statutory min 1 week (1 mo-2yr service), then 1 week per year up to 12 weeks max. Unfair dismissal: 2 years qualifying. Reason must be fair (capability, conduct, RIF, illegality, SOSR) AND fair procedure (DOL Code).'},
  {q:/equality|discriminat|harass|protected/i,a:'Equality Act 2010: 9 protected characteristics (age, disability, gender reassignment, marriage/CP, pregnancy/maternity, race, religion, sex, sexual orientation). Direct/indirect discrimination, harassment, victimisation. Worker Protection (Amendment of Equality Act 2010) Act 2023: positive duty to prevent sexual harassment from 26 Oct 2024. Tribunal awards uncapped for discrimination.'},
  {q:/paye|rti|p60|p11d|fps|eps/i,a:'PAYE Real Time Information (RTI): submit Full Payment Submission (FPS) on or before each payday. Employer Payment Summary (EPS) by 19th of following month (e.g. period 6 by 19 Oct). W-2 to each employee by 31 May. P11D for benefits-in-kind by 6 July. Late filing penalties: $100-$400 per scheme size band. Errors over 1% trigger HMRC review.'},
  {q:/acas|disciplin|grieve|EEOC charge/i,a:'DOL Code of Practice on Disciplinary and Grievance Procedures: not legally binding but EEOC charge awards uplifted up to 25% for unreasonable non-compliance (downward up to 25% if employee unreasonable). Key steps: investigate, written notification, meeting (right to be accompanied), decision with right of appeal. Early conciliation mandatory before EEOC charge (DOL).'},
];
function askT0(q){for(const r of T0_QA){if(r.q.test(q))return {answer:r.a,source:'T0 · US HR rules'}}return null}
async function askT3(q){if(!state.settings.anthropicKey)return null;try{const res=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'x-api-key':state.settings.anthropicKey,'anthropic-version':'2023-06-01','content-type':'application/json'},body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:600,messages:[{role:'user',content:'You are a US HR/employment law expert. ERA 1996, Equality Act 2010, WTR 1998, DOL Code, HMRC PAYE. Concise.\n\n'+q}]})});if(!res.ok)return null;const j=await res.json();return {answer:j.content?.[0]?.text,source:'T3 · Anthropic'}}catch(e){return null}}
function renderQA(v){v.innerHTML=`<div class="section-h"><h2>Q & A</h2><div class="sub">T0 + T3 BYOK</div></div><div class="card" style="max-width:780px"><div class="chat" id="chatBox">${(state.ui.chat||[]).map(m=>`<div class="msg ${m.role}">${esc(m.text)}${m.source?`<div class="src">${esc(m.source)}</div>`:''}</div>`).join('')}</div><div class="chat-input"><input id="chatIn" placeholder="Ask… 'S.1 statement requirements?' · 'RIF pay?' · 'auto-enrolment thresholds?'" onkeydown="if(event.key==='Enter')askQ()"><button class="btn brass" onclick="askQ()">Ask</button></div></div>`;const box=$('#chatBox');if(box)box.scrollTop=box.scrollHeight}
async function askQ(){const inp=$('#chatIn');if(!inp)return;const q=inp.value.trim();if(!q)return;inp.value='';if(!state.ui.chat)state.ui.chat=[];state.ui.chat.push({role:'user',text:q});render();let r=askT0(q);if(!r)r=await askT3(q);state.ui.chat.push(r?{role:'bot',text:r.answer,source:r.source}:{role:'bot',text:'No T0 match. Add BYOK key for T3.',source:'system'});persistUI();render()}
function openModal(type){const modal=$('#modal');modal.classList.add('open');
  if(type==='settings'){$('#modalTitle').textContent='Settings';$('#modalBody').innerHTML=`<div class="card"><h3>Firm</h3><div class="row"><div class="field"><label>Firm name</label><input id="fName" value="${esc(state.firm?.name||'')}"></div><div class="field"><label>Company no</label><input id="fCoNo" value="${esc(state.firm?.companyNo||'')}"></div></div><div class="field"><label>Address</label><input id="fAddr" value="${esc(state.firm?.address||'')}"></div><div class="row"><div class="field"><label>PAYE reference</label><input id="fPaye" value="${esc(state.firm?.payeRef||'')}"></div><div class="field"><label>Accounts office ref</label><input id="fAor" value="${esc(state.firm?.aorRef||'')}"></div></div></div><div class="card"><h3>API</h3><div class="field"><label>Anthropic key (T3)</label><input type="password" id="sKey" value="${esc(state.settings.anthropicKey||'')}"></div><div style="margin:10px 0"><label style="font-size:12px"><input type="checkbox" id="sAudit" ${state.settings.auditChain?'checked':''}> Audit chain</label></div></div><div class="actions"><button class="btn ghost sm" onclick="exportAll()">Export</button><button class="btn ghost sm" onclick="importAll()">Import</button><button class="btn danger sm" onclick="wipeAll()">Wipe</button><button class="btn brass" onclick="saveSettings()">Save</button><button class="btn ghost" onclick="closeModal()">Cancel</button></div>`}
  else if(type==='addEmp'){$('#modalTitle').textContent='Add Employee';$('#modalBody').innerHTML=`<div class="row"><div class="field"><label>First name</label><input id="eFirst"></div><div class="field"><label>Last name</label><input id="eLast"></div></div><div class="row"><div class="field"><label>Email</label><input id="eEmail"></div><div class="field"><label>Phone</label><input id="ePhone"></div></div><div class="row"><div class="field"><label>Job title</label><input id="eTitle"></div><div class="field"><label>Department</label><input id="eDept"></div></div><div class="row"><div class="field"><label>Start date</label><input type="date" id="eStart"></div><div class="field"><label>Status</label><select id="eStatus"><option>active</option><option>probation</option><option>leaver</option><option>maternity</option></select></div></div><div class="row"><div class="field"><label>Salary $/yr</label><input type="number" id="eSal"></div><div class="field"><label>Hours/week</label><input type="number" id="eHrs" value="37.5"></div></div><div class="row"><div class="field"><label>Holiday entitlement (days/yr)</label><input type="number" id="eHol" value="28"></div><div class="field"><label>Right to Work verified</label><select id="eRtw"><option value="1">Yes</option><option value="0">No</option></select></div></div><div class="actions"><button class="btn brass" onclick="addEmployee()">Add</button><button class="btn ghost" onclick="closeModal()">Cancel</button></div>`}
  else if(type==='addHoliday'){$('#modalTitle').textContent='Holiday Request';$('#modalBody').innerHTML=`<div class="field"><label>Employee</label><select id="hEmp">${state.employees.map(e=>`<option value="${e.id}">${esc(e.firstName)} ${esc(e.lastName)}</option>`).join('')}</select></div><div class="row"><div class="field"><label>Start date</label><input type="date" id="hStart"></div><div class="field"><label>End date</label><input type="date" id="hEnd"></div></div><div class="row"><div class="field"><label>Days</label><input type="number" step="0.5" id="hDays"></div><div class="field"><label>Type</label><select id="hType"><option>annual</option><option>sick</option><option>compassionate</option><option>unpaid</option><option>parental</option></select></div></div><div class="field"><label>Notes</label><input id="hNotes"></div><div class="actions"><button class="btn brass" onclick="addHoliday()">Submit</button><button class="btn ghost" onclick="closeModal()">Cancel</button></div>`}
  else if(type==='addAbsence'){$('#modalTitle').textContent='Record Absence';$('#modalBody').innerHTML=`<div class="field"><label>Employee</label><select id="aEmp">${state.employees.map(e=>`<option value="${e.id}">${esc(e.firstName)} ${esc(e.lastName)}</option>`).join('')}</select></div><div class="row"><div class="field"><label>Start date</label><input type="date" id="aStart"></div><div class="field"><label>End date (blank if ongoing)</label><input type="date" id="aEnd"></div></div><div class="row"><div class="field"><label>Days</label><input type="number" step="0.5" id="aDays"></div><div class="field"><label>Reason</label><select id="aReason"><option>sickness</option><option>injury</option><option>mental health</option><option>family emergency</option><option>medical appt</option><option>other</option></select></div></div><div class="field"><label>Evidence</label><select id="aEvidence"><option value="self-cert">Self-certification (1-7 days)</option><option value="fit note">Fit note (Med3)</option><option value="hospital">Hospital admission</option><option value="none">None</option></select></div><div class="actions"><button class="btn brass" onclick="addAbsence()">Record</button><button class="btn ghost" onclick="closeModal()">Cancel</button></div>`}
  else if(type==='addReview'){$('#modalTitle').textContent='Performance Review';$('#modalBody').innerHTML=`<div class="field"><label>Employee</label><select id="rEmp">${state.employees.map(e=>`<option value="${e.id}">${esc(e.firstName)} ${esc(e.lastName)}</option>`).join('')}</select></div><div class="row"><div class="field"><label>Date</label><input type="date" id="rDate"></div><div class="field"><label>Cycle</label><select id="rCycle"><option>annual</option><option>probation</option><option>mid-year</option><option>PIP</option></select></div></div><div class="row"><div class="field"><label>Rating</label><select id="rRating"><option>exceeding</option><option>meeting</option><option>developing</option><option>not meeting</option></select></div><div class="field"><label>Next review</label><input type="date" id="rNext"></div></div><div class="field"><label>Outcome</label><input id="rOutcome" placeholder="e.g. salary increase 3%, PIP for 3 months"></div><div class="actions"><button class="btn brass" onclick="addReview()">Save</button><button class="btn ghost" onclick="closeModal()">Cancel</button></div>`}
  else if(type==='addContract'){$('#modalTitle').textContent='Add Contract';$('#modalBody').innerHTML=`<div class="field"><label>Employee</label><select id="cEmp">${state.employees.map(e=>`<option value="${e.id}">${esc(e.firstName)} ${esc(e.lastName)}</option>`).join('')}</select></div><div class="row"><div class="field"><label>Contract type</label><select id="cType"><option>permanent full-time</option><option>permanent part-time</option><option>fixed-term</option><option>zero-hours</option><option>casual</option><option>apprenticeship</option></select></div><div class="field"><label>Issue date</label><input type="date" id="cDate"></div></div><div class="row"><div class="field"><label>Signed by employee</label><select id="cSigned"><option value="0">No</option><option value="1">Yes</option></select></div><div class="field"><label>S.1 statement issued</label><select id="cS1"><option value="1">Yes</option><option value="0">No</option></select></div></div><div class="actions"><button class="btn brass" onclick="addContract()">Add</button><button class="btn ghost" onclick="closeModal()">Cancel</button></div>`}
}
function closeModal(){$('#modal').classList.remove('open')}
async function addEmployee(){const e={id:uid('em'),firstName:$('#eFirst').value.trim(),lastName:$('#eLast').value.trim(),email:$('#eEmail').value.trim(),phone:$('#ePhone').value.trim(),jobTitle:$('#eTitle').value.trim(),department:$('#eDept').value.trim(),startDate:$('#eStart').value,status:$('#eStatus').value,salary:Number($('#eSal').value||0),hoursPerWeek:Number($('#eHrs').value||37.5),holidayEntitlement:Number($('#eHol').value||28),rtw:{verified:$('#eRtw').value==='1'},ts:now()};state.employees.push(e);await idbPut('employees',e);try{bcHr?.postMessage({v:1,type:'sync.snapshot',ts:now(),source:TOOLNAME,payload:{employees:[e]}})}catch(_){}await auditLog('employee.added',{payload:{id:e.id}});closeModal();toast('Added');render()}
async function addHoliday(){const h={id:uid('hl'),employeeId:$('#hEmp').value,startDate:$('#hStart').value,endDate:$('#hEnd').value,days:Number($('#hDays').value||0),type:$('#hType').value,notes:$('#hNotes').value.trim(),status:'requested',ts:now()};state.holiday.push(h);await idbPut('holiday',h);await auditLog('holiday.requested',{payload:{id:h.id}});closeModal();toast('Requested');render()}
async function addAbsence(){const a={id:uid('ab'),employeeId:$('#aEmp').value,startDate:$('#aStart').value,endDate:$('#aEnd').value,days:Number($('#aDays').value||0),reason:$('#aReason').value,evidence:$('#aEvidence').value,ts:now()};state.absence.push(a);await idbPut('absence',a);await auditLog('absence.recorded',{payload:{id:a.id}});closeModal();toast('Recorded');render()}
async function addReview(){const r={id:uid('rv'),employeeId:$('#rEmp').value,date:$('#rDate').value,cycle:$('#rCycle').value,rating:$('#rRating').value,outcome:$('#rOutcome').value.trim(),nextDate:$('#rNext').value,ts:now()};state.reviews.push(r);const emp=state.employees.find(e=>e.id===r.employeeId);if(emp){emp.lastReviewDate=r.date;await idbPut('employees',emp)}await idbPut('reviews',r);await auditLog('review.added',{payload:{id:r.id}});closeModal();toast('Saved');render()}
async function addContract(){const c={id:uid('co'),employeeId:$('#cEmp').value,contractType:$('#cType').value,issueDate:$('#cDate').value,signed:$('#cSigned').value==='1',s1Statement:$('#cS1').value==='1',ts:now()};state.contracts.push(c);await idbPut('contracts',c);await auditLog('contract.added',{payload:{id:c.id}});closeModal();toast('Added');render()}
async function saveSettings(){const f=state.firm||{id:uid('fi'),ts:now()};f.name=$('#fName').value.trim();f.companyNo=$('#fCoNo').value.trim();f.address=$('#fAddr').value.trim();f.payeRef=$('#fPaye').value.trim();f.aorRef=$('#fAor').value.trim();f.updatedAt=now();state.firm=f;await idbPut('firms',f);state.settings.anthropicKey=$('#sKey').value.trim();state.settings.auditChain=$('#sAudit').checked;$('#tierBadge').textContent=state.settings.anthropicKey?'T3':'T0';await persistUI();closeModal();toast('Saved');render()}
function exportAll(){const d={tool:TOOLNAME,v:VERSION,ts:now(),firm:state.firm,employees:state.employees,holiday:state.holiday,absence:state.absence,reviews:state.reviews,contracts:state.contracts};const b=new Blob([JSON.stringify(d,null,2)],{type:'application/json'});const u=URL.createObjectURL(b);const a=document.createElement('a');a.href=u;a.download='fallhr-us-export.json';a.click();URL.revokeObjectURL(u);toast('Exported')}
function importAll(){const inp=document.createElement('input');inp.type='file';inp.accept='.json';inp.onchange=async()=>{const f=inp.files[0];if(!f)return;try{const d=JSON.parse(await f.text());if(d.firm){state.firm=d.firm;await idbPut('firms',d.firm)}for(const k of['employees','holiday','absence','reviews','contracts']){if(Array.isArray(d[k]))for(const r of d[k]){state[k].push(r);await idbPut(k,r)}}persistUI();toast('Imported');render()}catch(e){toast('Failed')}};inp.click()}
async function wipeAll(){if(!confirm('Wipe ALL data?'))return;for(const s of['firms','employees','holiday','absence','reviews','contracts','audit','state']){const tx=db.transaction(s,'readwrite');tx.objectStore(s).clear();await new Promise(r=>{tx.oncomplete=r})}location.reload()}
async function seedDemo(){if(state.employees.length||state.firm)return;
  const firm={id:uid('fi'),name:'Northgate Sciences Ltd',address:'21 King Street, Manchester M2 4WQ',companyNo:'09876543',payeRef:'120/AB12345',aorRef:'120PA00012345',updatedAt:now(),isDemo:true};
  state.firm=firm;await idbPut('firms',firm);
  const emps=[
    {id:uid('em'),firstName:'Sarah',lastName:'Lewis',email:'s.lewis@northgate.co.uk',phone:'07700 900111',jobTitle:'Head of Operations',department:'Operations',startDate:'2021-04-12',status:'active',salary:62000,hoursPerWeek:37.5,holidayEntitlement:28,rtw:{verified:true},lastReviewDate:'2025-12-15',ts:now(),isDemo:true},
    {id:uid('em'),firstName:'Adam',lastName:'Ross',email:'a.ross@northgate.co.uk',phone:'07700 900222',jobTitle:'Senior Developer',department:'Engineering',startDate:'2023-09-04',status:'active',salary:54000,hoursPerWeek:37.5,holidayEntitlement:28,rtw:{verified:true},lastReviewDate:'2026-03-10',ts:now(),isDemo:true},
    {id:uid('em'),firstName:'Priya',lastName:'Mehta',email:'p.mehta@northgate.co.uk',phone:'07700 900333',jobTitle:'Marketing Manager',department:'Marketing',startDate:'2024-11-18',status:'probation',salary:42000,hoursPerWeek:37.5,holidayEntitlement:28,rtw:{verified:true},ts:now(),isDemo:true},
    {id:uid('em'),firstName:'Olu',lastName:'Adeyemi',email:'o.adeyemi@northgate.co.uk',phone:'07700 900444',jobTitle:'Customer Support Lead',department:'Operations',startDate:'2022-06-01',status:'maternity',salary:38000,hoursPerWeek:30,holidayEntitlement:22,rtw:{verified:true},lastReviewDate:'2025-05-22',ts:now(),isDemo:true},
  ];
  state.employees=emps;for(const e of emps)await idbPut('employees',e);
  const hols=[
    {id:uid('hl'),employeeId:emps[0].id,startDate:'2026-07-14',endDate:'2026-07-25',days:10,type:'annual',notes:'Summer leave',status:'approved',decisionAt:now(),ts:now(),isDemo:true},
    {id:uid('hl'),employeeId:emps[1].id,startDate:'2026-06-27',endDate:'2026-07-01',days:3,type:'annual',notes:'Long weekend',status:'requested',ts:now(),isDemo:true},
    {id:uid('hl'),employeeId:emps[2].id,startDate:'2026-06-26',endDate:'2026-06-26',days:1,type:'compassionate',notes:'Funeral',status:'approved',decisionAt:now(),ts:now(),isDemo:true},
  ];
  state.holiday=hols;for(const h of hols)await idbPut('holiday',h);
  const abs=[
    {id:uid('ab'),employeeId:emps[1].id,startDate:'2026-05-14',endDate:'2026-05-16',days:3,reason:'sickness',evidence:'self-cert',ts:now(),isDemo:true},
    {id:uid('ab'),employeeId:emps[2].id,startDate:'2026-03-02',endDate:'2026-03-03',days:2,reason:'sickness',evidence:'self-cert',ts:now(),isDemo:true},
  ];
  state.absence=abs;for(const a of abs)await idbPut('absence',a);
  const revs=[
    {id:uid('rv'),employeeId:emps[0].id,date:'2025-12-15',cycle:'annual',rating:'exceeding',outcome:'5% salary increase to $62k',nextDate:'2026-12-15',ts:now(),isDemo:true},
    {id:uid('rv'),employeeId:emps[1].id,date:'2026-03-10',cycle:'probation',rating:'meeting',outcome:'Probation passed, confirmed permanent',nextDate:'2026-09-10',ts:now(),isDemo:true},
  ];
  state.reviews=revs;for(const r of revs)await idbPut('reviews',r);
  const cons=[
    {id:uid('co'),employeeId:emps[0].id,contractType:'permanent full-time',issueDate:'2021-04-12',signed:true,s1Statement:true,ts:now(),isDemo:true},
    {id:uid('co'),employeeId:emps[1].id,contractType:'permanent full-time',issueDate:'2023-09-04',signed:true,s1Statement:true,ts:now(),isDemo:true},
    {id:uid('co'),employeeId:emps[2].id,contractType:'permanent full-time',issueDate:'2024-11-18',signed:true,s1Statement:true,ts:now(),isDemo:true},
    {id:uid('co'),employeeId:emps[3].id,contractType:'permanent part-time',issueDate:'2022-06-01',signed:true,s1Statement:true,ts:now(),isDemo:true},
  ];
  state.contracts=cons;for(const c of cons)await idbPut('contracts',c);
  state.complianceChecks=['s1Statement','rtwAll','paye','elInsurance','minimumWage','autoEnrolPension'];
  await auditLog('demo.seeded',{reasoning:'first boot'});await persistUI()}

// Named exports for the primary API surface
export { loadConfig };
export { saveConfig };
export { $ };
export { esc };
export { aiTier };
export { renderAiChip };
export { loadWebLLM };
export { aiComplete };
export { aiCloudCall };
export { meshStart };

export { FALL_KIT_VERSION };
export { KCC_MINT_URL };
export { WEBLLM_MODELS };
export { DEFAULT_MODEL };
export { T3_PROVIDERS };
export { STATE };
export { MESH_CHANNEL };
export { STUN_SERVERS };
export { TOOLNAME };
export { TABS };
