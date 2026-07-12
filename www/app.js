// =====================================================================
// Account Hub — iOS (Capacitor)
// Läuft komplett im WebView der App. Ersetzt die Electron main.js/preload.js
// durch Browser-APIs: localStorage statt Dateisystem, setInterval statt
// Hintergrund-Timer (nur aktiv, während die App offen ist), optionale lokale
// Benachrichtigungen über das Capacitor LocalNotifications-Plugin.
//
// WICHTIG: iOS pausiert JavaScript im Hintergrund. Prüfungen laufen nur
// zuverlässig, während die App im Vordergrund ist bzw. kurz danach.
// =====================================================================

const STORAGE_KEY = 'account-hub-config';
const DEFAULT_CONFIG = {
  pollIntervalSec: 60,
  cards: [],
  games: [],
  ai: { apiKey: '', model: 'gpt-4o-mini', systemPrompt: '' },
  aiMessages: []
};

// ---------- Storage ----------

function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch (e) {
    return { ...DEFAULT_CONFIG };
  }
}

function saveConfig(cfg) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

let config = loadConfig();

// ---------- Icons & Catalog ----------

const ICONS = {
  plane: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M21 3 3 10.5l7 2.5m11-10-3.5 17-7.5-6m11-11L10.5 13"/></svg>',
  bubbles: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M8 12a6 6 0 1 1 9.8 4.6L18 20l-3.6-1.2A6 6 0 0 1 8 12Z"/><circle cx="9.5" cy="12" r="0.8" fill="currentColor" stroke="none"/><circle cx="13" cy="12" r="0.8" fill="currentColor" stroke="none"/></svg>',
  note: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M9 18V5l10-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/></svg>',
  wallet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/><circle cx="16.5" cy="14.5" r="1.2" fill="currentColor" stroke="none"/></svg>',
  app: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="m12 3 2.6 5.7 6.2.6-4.7 4.2 1.4 6.1L12 16.7 6.5 19.6l1.4-6.1-4.7-4.2 6.2-.6L12 3Z"/></svg>',
  controller: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2.5" y="7" width="19" height="11" rx="5.5"/><path d="M7 10.5v3M5.5 12h3"/><circle cx="16" cy="10.5" r="1" fill="currentColor" stroke="none"/><circle cx="18" cy="12.5" r="1" fill="currentColor" stroke="none"/></svg>',
  sparkle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 5v14M5 12h14"/></svg>'
};

const CATALOG = [
  { key: 'telegram', label: 'Telegram', type: 'telegram', icon: 'plane', defaultName: 'Telegram' },
  { key: 'discord', label: 'Discord', type: 'discord', icon: 'bubbles', defaultName: 'Discord' },
  { key: 'tiktok', label: 'TikTok', type: 'manual', icon: 'note', defaultName: 'TikTok' },
  { key: 'wallet', label: 'Krypto-Wallet', type: 'wallet', icon: 'wallet', defaultName: 'Exodus Wallet' },
  { key: 'manual', label: 'Andere App', type: 'manual', icon: 'app', defaultName: 'Neue App' }
];

function catalogFor(card) {
  return CATALOG.find(c => c.key === card.presetKey) || CATALOG.find(c => c.type === card.type) || CATALOG[4];
}
function isConversationCard(card) { return card.type === 'discord' || card.type === 'telegram'; }

const GAME_CATALOG = [
  { key: 'brawlstars', label: 'Brawl Stars', type: 'brawlstars', icon: 'star', defaultName: 'Brawl Stars' },
  { key: 'customgame', label: 'Magic Brawl / Andere', type: 'customgame', icon: 'controller', defaultName: 'Magic Brawl' }
];
function gameCatalogFor(game) {
  return GAME_CATALOG.find(g => g.key === game.type) || GAME_CATALOG[1];
}

let state = { editingId: null, selectedPreset: null, activityLog: [], prevCards: {}, selectedConversationId: null, selectedGameId: null };

// ---------- Helpers ----------

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
function relTime(iso) {
  if (!iso) return 'noch nie geprüft';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 10) return 'gerade eben';
  if (diff < 60) return `vor ${Math.floor(diff)} Sek.`;
  if (diff < 3600) return `vor ${Math.floor(diff / 60)} Min.`;
  if (diff < 86400) return `vor ${Math.floor(diff / 3600)} Std.`;
  return `vor ${Math.floor(diff / 86400)} Tg.`;
}

// ---------- Discord-Service (Bot-Token + Channel-ID) ----------

const Discord = {
  attachmentType(att) {
    const ct = (att.content_type || '').toLowerCase();
    if (ct.startsWith('image/')) return 'image';
    if (ct.startsWith('video/')) return 'video';
    const name = (att.filename || '').toLowerCase();
    if (/\.(png|jpe?g|gif|webp)$/.test(name)) return 'image';
    if (/\.(mp4|webm|mov|mkv)$/.test(name)) return 'video';
    return 'file';
  },
  parseMessage(m) {
    return {
      id: m.id,
      authorName: m.author?.username || 'Unbekannt',
      text: m.content || '',
      attachments: (m.attachments || []).map(a => ({ type: Discord.attachmentType(a), url: a.url, name: a.filename })),
      time: m.timestamp,
      outgoing: false
    };
  },
  async check(card) {
    const { token, channelId } = card;
    if (!token || !channelId) throw new Error('Bot-Token oder Channel-ID fehlt');
    const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages?limit=20`, {
      headers: { Authorization: `Bot ${token}` }
    });
    if (!res.ok) {
      if (res.status === 401) throw new Error('Bot-Token ungültig');
      if (res.status === 403) throw new Error('Bot hat keinen Zugriff auf diesen Channel');
      if (res.status === 404) throw new Error('Channel-ID nicht gefunden');
      throw new Error(`Discord antwortete mit ${res.status}`);
    }
    const raw = await res.json();
    if (!Array.isArray(raw) || raw.length === 0) {
      return { unread: card.unread || 0, status: 'Keine Nachrichten gefunden', messages: [] };
    }
    raw.sort((a, b) => (BigInt(a.id) - BigInt(b.id) > 0n ? 1 : -1));
    const newest = raw[raw.length - 1];
    let newCount = 0;
    if (card.lastMessageId && card.lastMessageId !== newest.id) {
      newCount = raw.filter(m => BigInt(m.id) > BigInt(card.lastMessageId)).length;
    }
    card.lastMessageId = newest.id;
    return {
      unread: (card.unread || 0) + newCount,
      status: newCount > 0 ? `${newCount} neue Nachricht(en)` : 'Keine neuen Nachrichten',
      notifyText: newCount > 0 ? `${newest.author?.username || 'Jemand'}: ${(newest.content || '[Anhang]').slice(0, 80)}` : undefined,
      messages: raw.map(Discord.parseMessage)
    };
  },
  async sendMessage(card, text) {
    const { token, channelId } = card;
    if (!token || !channelId) throw new Error('Bot-Token oder Channel-ID fehlt');
    if (!text || !text.trim()) throw new Error('Nachricht ist leer');
    const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text })
    });
    if (!res.ok) {
      if (res.status === 401) throw new Error('Bot-Token ungültig');
      if (res.status === 403) throw new Error('Bot darf hier nicht schreiben (Berechtigung fehlt)');
      const body = await res.json().catch(() => null);
      throw new Error(body?.message || `Discord antwortete mit ${res.status}`);
    }
    const sent = await res.json();
    card.lastMessageId = sent.id;
    return Discord.parseMessage(sent);
  }
};

// ---------- Telegram-Service (Bot-Token) ----------

const Telegram = {
  async resolveFileUrl(token, fileId) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
      const data = await res.json();
      if (!data.ok) return null;
      return `https://api.telegram.org/file/bot${token}/${data.result.file_path}`;
    } catch (e) { return null; }
  },
  async parseMessage(token, m) {
    const attachments = [];
    if (Array.isArray(m.photo) && m.photo.length > 0) {
      const best = m.photo[m.photo.length - 1];
      const url = await Telegram.resolveFileUrl(token, best.file_id);
      if (url) attachments.push({ type: 'image', url, name: 'Foto' });
    }
    if (m.video) {
      const url = await Telegram.resolveFileUrl(token, m.video.file_id);
      if (url) attachments.push({ type: 'video', url, name: m.video.file_name || 'Video' });
    }
    if (m.document) {
      const ct = m.document.mime_type || '';
      const url = await Telegram.resolveFileUrl(token, m.document.file_id);
      if (url) attachments.push({ type: ct.startsWith('image/') ? 'image' : ct.startsWith('video/') ? 'video' : 'file', url, name: m.document.file_name || 'Datei' });
    }
    return {
      id: `${m.message_id}_${m.date}`,
      chatId: m.chat?.id,
      authorName: [m.from?.first_name, m.from?.last_name].filter(Boolean).join(' ') || m.from?.username || 'Unbekannt',
      text: m.text || m.caption || '',
      attachments,
      time: new Date(m.date * 1000).toISOString(),
      outgoing: false
    };
  },
  async check(card) {
    const { token } = card;
    if (!token) throw new Error('Kein Bot-Token hinterlegt');
    const offset = card.lastUpdateId ? card.lastUpdateId + 1 : undefined;
    const url = `https://api.telegram.org/bot${token}/getUpdates${offset ? `?offset=${offset}&timeout=0` : '?timeout=0'}`;
    const res = await fetch(url);
    if (!res.ok) {
      if (res.status === 401) throw new Error('Bot-Token ungültig');
      throw new Error(`Telegram antwortete mit ${res.status}`);
    }
    const data = await res.json();
    if (!data.ok) throw new Error(data.description || 'Unbekannter Telegram-Fehler');
    const updates = data.result || [];
    let newMessages = 0, lastText = null, maxUpdateId = card.lastUpdateId || 0;
    const parsed = [];
    for (const u of updates) {
      if (u.update_id > maxUpdateId) maxUpdateId = u.update_id;
      if (u.message) {
        newMessages += 1;
        const pm = await Telegram.parseMessage(token, u.message);
        parsed.push(pm);
        lastText = pm.text || (pm.attachments[0] ? (pm.attachments[0].type === 'image' ? '[Bild]' : pm.attachments[0].type === 'video' ? '[Video]' : '[Datei]') : '[Anhang]');
        if (pm.chatId) card.lastChatId = pm.chatId;
      }
    }
    card.lastUpdateId = maxUpdateId;
    return {
      unread: (card.unread || 0) + newMessages,
      status: newMessages > 0 ? `${newMessages} neue Nachricht(en)` : 'Keine neuen Nachrichten',
      notifyText: lastText ? `Neue Nachricht: ${lastText.slice(0, 80)}` : undefined,
      messages: parsed
    };
  },
  async sendMessage(card, text) {
    const { token, lastChatId } = card;
    if (!token) throw new Error('Kein Bot-Token hinterlegt');
    if (!lastChatId) throw new Error('Noch kein Chat bekannt — es muss dir zuerst jemand über den Bot schreiben, bevor du antworten kannst');
    if (!text || !text.trim()) throw new Error('Nachricht ist leer');
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: lastChatId, text })
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.description || 'Nachricht konnte nicht gesendet werden');
    return {
      id: `${data.result.message_id}_${data.result.date}`,
      chatId: data.result.chat?.id,
      authorName: 'Du (Bot)',
      text,
      attachments: [],
      time: new Date(data.result.date * 1000).toISOString(),
      outgoing: true
    };
  }
};

// ---------- Wallet-Watcher (öffentliche Blockchain, nie private Keys) ----------

const Wallet = {
  async checkBtc(address) {
    const res = await fetch(`https://blockstream.info/api/address/${address}`);
    if (!res.ok) throw new Error('Adresse konnte nicht geprüft werden (Bitcoin)');
    const data = await res.json();
    const funded = data.chain_stats?.funded_txo_sum || 0;
    const spent = data.chain_stats?.spent_txo_sum || 0;
    const balanceSat = funded - spent;
    return { balanceLabel: `${(balanceSat / 1e8).toFixed(8)} BTC`, txCount: data.chain_stats?.tx_count || 0 };
  },
  async checkEth(address) {
    const res = await fetch('https://cloudflare-eth.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_getBalance', params: [address, 'latest'], id: 1 })
    });
    if (!res.ok) throw new Error('Adresse konnte nicht geprüft werden (Ethereum)');
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || 'RPC-Fehler');
    const eth = Number(BigInt(data.result)) / 1e18;
    return { balanceLabel: `${eth.toFixed(6)} ETH`, txCount: null };
  },
  async check(card) {
    const { address, chain } = card;
    if (!address || !chain) throw new Error('Adresse oder Chain fehlt');
    const result = chain === 'btc' ? await Wallet.checkBtc(address) : await Wallet.checkEth(address);
    let changed = false;
    if (card.lastBalanceLabel && card.lastBalanceLabel !== result.balanceLabel) changed = true;
    if (result.txCount !== null && card.lastTxCount != null && result.txCount !== card.lastTxCount) changed = true;
    const firstCheck = !card.lastBalanceLabel;
    card.lastBalanceLabel = result.balanceLabel;
    if (result.txCount !== null) card.lastTxCount = result.txCount;
    return {
      unread: (card.unread || 0) + (changed && !firstCheck ? 1 : 0),
      status: result.balanceLabel,
      notifyText: changed && !firstCheck ? `Bewegung erkannt: neuer Stand ${result.balanceLabel}` : undefined
    };
  }
};

// ---------- Brawl Stars (offizielle API, mit Proxy-Option für Handys ohne feste IP) ----------

const BrawlStars = {
  base(useProxy) {
    // RoyaleAPI-Proxy hat eine feste IP (45.79.218.79), die du EINMALIG im
    // Brawl-Stars-Developer-Portal freischaltest, statt deiner (wechselnden)
    // Handy-IP. So funktioniert der Key zuverlässig vom iPhone aus.
    return useProxy ? 'https://bsproxy.royaleapi.dev' : 'https://api.brawlstars.com';
  },
  async fetchPlayer(game) {
    const tag = (game.playerTag || '').trim().replace(/^#/, '').toUpperCase();
    if (!tag) throw new Error('Spieler-Tag fehlt');
    if (!game.apiKey) throw new Error('API-Key fehlt');
    const base = BrawlStars.base(game.useProxy !== false);
    const res = await fetch(`${base}/v1/players/%23${tag}`, {
      headers: { Authorization: `Bearer ${game.apiKey}`, Accept: 'application/json' }
    });
    if (!res.ok) {
      if (res.status === 403) throw new Error('API-Key ungültig oder IP nicht freigeschaltet (bei Proxy: 45.79.218.79 im Developer-Portal whitelisten)');
      if (res.status === 404) throw new Error('Spieler-Tag nicht gefunden');
      throw new Error(`Brawl Stars antwortete mit ${res.status}`);
    }
    const data = await res.json();
    const stats = [
      { label: 'Name', value: data.name },
      { label: 'Trophäen', value: data.trophies },
      { label: 'Bestwert', value: data.highestTrophies },
      { label: 'Erfahrungsstufe', value: data.expLevel },
      { label: '3v3-Siege', value: data['3vs3Victories'] },
      { label: 'Solo-Siege', value: data.soloVictories },
      { label: 'Duo-Siege', value: data.duoVictories },
      { label: 'Club', value: data.club?.name || '—' },
      { label: 'Anzahl Brawler', value: (data.brawlers || []).length }
    ];
    return { summary: `🏆 ${(data.trophies ?? 0).toLocaleString('de-DE')} Trophäen`, stats, raw: data };
  }
};

// ---------- Generische Spiele-API (z. B. Magic Brawl / andere Privatserver) ----------
// Du gibst die vollständige Endpunkt-URL (die Antwort muss JSON liefern) und
// optional einen Authorization-Header-Wert an. Primitive Top-Level-Felder der
// Antwort werden automatisch als Statistik-Liste angezeigt.

const CustomGame = {
  async fetchData(game) {
    if (!game.url) throw new Error('URL fehlt');
    const headers = { Accept: 'application/json' };
    if (game.authHeader) headers['Authorization'] = game.authHeader;
    const res = await fetch(game.url, { headers });
    if (!res.ok) throw new Error(`Server antwortete mit ${res.status}`);
    const data = await res.json();
    const stats = Object.entries(data)
      .filter(([, v]) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
      .slice(0, 24)
      .map(([k, v]) => ({ label: k, value: String(v) }));
    return { summary: stats[0] ? `${stats[0].label}: ${stats[0].value}` : 'Daten empfangen', stats, raw: data };
  }
};

// ---------- OpenAI-Chat (eigener API-Key, direkter Browser-Zugriff per CORS) ----------

const OpenAI = {
  async send(aiConfig, history) {
    if (!aiConfig.apiKey) throw new Error('Kein OpenAI API-Key hinterlegt (siehe Einstellungen)');
    const messages = [];
    if (aiConfig.systemPrompt) messages.push({ role: 'system', content: aiConfig.systemPrompt });
    messages.push(...history.map(m => ({ role: m.role, content: m.content })));

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${aiConfig.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ model: aiConfig.model || 'gpt-4o-mini', messages })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message || `OpenAI antwortete mit ${res.status}`);
    return data.choices?.[0]?.message?.content || '(leere Antwort)';
  }
};



// ---------- Polling (Aktivitäts-Karten) ----------

function mergeMessages(card, incoming) {
  if (!incoming || incoming.length === 0) return;
  card.messages = card.messages || [];
  const seen = new Set(card.messages.map(m => m.id));
  for (const m of incoming) {
    if (!seen.has(m.id)) { card.messages.push(m); seen.add(m.id); }
  }
  card.messages.sort((a, b) => new Date(a.time) - new Date(b.time));
  if (card.messages.length > 50) card.messages = card.messages.slice(-50);
}

async function notify(title, body) {
  try {
    const LN = window.Capacitor?.Plugins?.LocalNotifications;
    if (!LN) return;
    await LN.schedule({
      notifications: [{ id: Math.floor(Math.random() * 1e9), title, body, schedule: { at: new Date(Date.now() + 200) } }]
    });
  } catch (e) { /* Best effort — auf iOS nur zuverlässig im Vordergrund */ }
}

async function checkCard(card) {
  try {
    let result = null;
    if (card.type === 'telegram') result = await Telegram.check(card);
    else if (card.type === 'discord') result = await Discord.check(card);
    else if (card.type === 'wallet') result = await Wallet.check(card);
    else return card;

    const before = card.unread || 0;
    card.unread = result.unread;
    card.lastChecked = new Date().toISOString();
    card.status = result.status || card.status;
    card.error = null;
    mergeMessages(card, result.messages);

    if (card.unread > before) notify(card.name, result.notifyText || 'Es gibt Neuigkeiten.');
  } catch (err) {
    card.error = err.message || 'Prüfung fehlgeschlagen';
    card.lastChecked = new Date().toISOString();
  }
  return card;
}

async function runPollCycle() {
  for (const card of config.cards) {
    if (card.type === 'telegram' || card.type === 'discord' || card.type === 'wallet') await checkCard(card);
  }
  saveConfig(config);
  applyCards(config.cards);
}

let pollTimer = null;
function schedulePolling() {
  if (pollTimer) clearInterval(pollTimer);
  const ms = Math.max(15, config.pollIntervalSec || 60) * 1000;
  pollTimer = setInterval(runPollCycle, ms);
  runPollCycle();
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') runPollCycle();
});

// ---------- Rendering: Dashboard ----------

function renderCards() {
  const grid = document.getElementById('cards-grid');
  grid.innerHTML = '';
  config.cards.forEach(card => {
    const cat = catalogFor(card);
    const el = document.createElement('div');
    el.className = 'card';
    const statusText = card.error ? card.error : (card.status || 'Noch nicht geprüft');
    el.innerHTML = `
      <div class="card-top">
        <div class="icon">${ICONS[cat.icon]}</div>
        <button class="card-menu" data-action="edit">&#8942;</button>
      </div>
      <div class="card-body">
        <h3>${escapeHtml(card.name)}</h3>
        <p class="status ${card.error ? 'err' : ''}">${escapeHtml(statusText)}</p>
      </div>
      <div class="card-footer">
        <span class="timestamp">${relTime(card.lastChecked)}</span>
        ${card.unread > 0 ? `<span class="badge">${card.unread}</span>` : ''}
      </div>
    `;
    el.querySelector('[data-action="edit"]').addEventListener('click', (e) => { e.stopPropagation(); openEditModal(card.id); });
    el.addEventListener('click', () => {
      if (isConversationCard(card)) { switchView('activity'); openThread(card.id); return; }
      if (card.unread > 0) { card.unread = 0; saveConfig(config); }
      if (card.type === 'manual' && card.url) window.open(card.url, '_system');
      renderCards();
    });
    grid.appendChild(el);
  });
  const addTile = document.createElement('div');
  addTile.className = 'card add-card';
  addTile.innerHTML = ICONS.plus;
  addTile.addEventListener('click', () => openAddModal());
  grid.appendChild(addTile);
}

function updateHeaderSummary() {
  const times = config.cards.map(c => c.lastChecked).filter(Boolean).sort();
  const last = times[times.length - 1];
  document.getElementById('last-check-label').textContent = last ? `Zuletzt geprüft ${relTime(last)}` : 'Noch keine Prüfung durchgeführt';

  const hasUnreadConversation = config.cards.some(c => isConversationCard(c) && c.unread > 0);
  document.getElementById('tab-activity-dot').classList.toggle('active', hasUnreadConversation);
}

// ---------- Rendering: Weitere Ereignisse (Wallet/Manuell) ----------

function diffForActivity(cards) {
  cards.forEach(card => {
    if (isConversationCard(card)) return;
    const prev = state.prevCards[card.id];
    if (prev && card.unread > prev.unread) {
      state.activityLog.unshift({ name: card.name, text: card.status || 'Neue Aktivität', time: new Date().toISOString() });
    }
  });
  state.activityLog = state.activityLog.slice(0, 60);
  state.prevCards = Object.fromEntries(cards.map(c => [c.id, { unread: c.unread || 0 }]));
}

function renderActivity() {
  const list = document.getElementById('activity-list');
  list.innerHTML = '';
  if (state.activityLog.length === 0) { list.innerHTML = '<li class="empty">Noch keine Ereignisse erkannt.</li>'; return; }
  state.activityLog.forEach(entry => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${escapeHtml(entry.name)} — ${escapeHtml(entry.text)}</span><span class="timestamp">${relTime(entry.time)}</span>`;
    list.appendChild(li);
  });
}

// ---------- Rendering: Unterhaltungen ----------

function conversationPreview(card) {
  const msgs = card.messages || [];
  if (msgs.length === 0) return card.status || 'Noch keine Nachrichten';
  const last = msgs[msgs.length - 1];
  if (last.text) return (last.outgoing ? 'Du: ' : '') + last.text;
  const a = (last.attachments || [])[0];
  const label = a ? (a.type === 'image' ? '[Bild]' : a.type === 'video' ? '[Video]' : '[Datei]') : '[Anhang]';
  return (last.outgoing ? 'Du: ' : '') + label;
}

function renderConversations() {
  const list = document.getElementById('conversation-list');
  const cards = config.cards.filter(isConversationCard);
  list.innerHTML = '';
  if (cards.length === 0) { list.innerHTML = '<li class="empty">Noch keine Discord- oder Telegram-Karte verbunden.</li>'; return; }
  cards.forEach(card => {
    const cat = catalogFor(card);
    const li = document.createElement('li');
    li.className = 'conversation-item';
    li.innerHTML = `
      <div class="icon">${ICONS[cat.icon]}</div>
      <div class="meta"><h4>${escapeHtml(card.name)}</h4><p>${escapeHtml(conversationPreview(card))}</p></div>
      ${card.unread > 0 ? `<span class="badge">${card.unread}</span>` : ''}
    `;
    li.addEventListener('click', () => openThread(card.id));
    list.appendChild(li);
  });
}

function attachmentHtml(att) {
  const url = escapeHtml(att.url);
  if (att.type === 'image') return `<div class="msg-attachment"><img src="${url}" alt="${escapeHtml(att.name || 'Bild')}" loading="lazy" /></div>`;
  if (att.type === 'video') return `<div class="msg-attachment"><video src="${url}" controls playsinline></video></div>`;
  return `<div class="msg-attachment"><div class="file-chip">📎 ${escapeHtml(att.name || 'Datei')}</div></div>`;
}

function renderThread() {
  const card = config.cards.find(c => c.id === state.selectedConversationId);
  if (!card) return;
  document.getElementById('thread-title').textContent = card.name;
  document.getElementById('thread-subtitle').textContent = card.lastChecked ? `Zuletzt geprüft ${relTime(card.lastChecked)}` : '';
  const messagesEl = document.getElementById('thread-messages');
  const msgs = card.messages || [];
  if (msgs.length === 0) {
    messagesEl.innerHTML = '<div class="empty">Noch keine Nachrichten empfangen.</div>';
  } else {
    const wasScrolledDown = messagesEl.scrollTop + messagesEl.clientHeight >= messagesEl.scrollHeight - 30;
    messagesEl.innerHTML = msgs.map(m => `
      <div class="msg-row ${m.outgoing ? 'out' : 'in'}">
        <div class="msg-bubble">
          ${!m.outgoing ? `<div class="msg-author">${escapeHtml(m.authorName || 'Unbekannt')}</div>` : ''}
          ${m.text ? `<div class="msg-text">${escapeHtml(m.text)}</div>` : ''}
          ${(m.attachments || []).map(attachmentHtml).join('')}
          <div class="msg-time">${relTime(m.time)}</div>
        </div>
      </div>
    `).join('');
    if (wasScrolledDown) messagesEl.scrollTop = messagesEl.scrollHeight;
  }
  document.getElementById('thread-error').style.display = 'none';
}

function openThread(id) {
  state.selectedConversationId = id;
  const card = config.cards.find(c => c.id === id);
  if (card && card.unread > 0) { card.unread = 0; saveConfig(config); renderCards(); renderConversations(); updateHeaderSummary(); }
  renderThread();
  document.getElementById('thread-overlay').classList.add('open');
  const messagesEl = document.getElementById('thread-messages');
  requestAnimationFrame(() => { messagesEl.scrollTop = messagesEl.scrollHeight; });
}

function closeThread() {
  document.getElementById('thread-overlay').classList.remove('open');
  state.selectedConversationId = null;
}

function applyCards(cards) {
  diffForActivity(cards);
  config.cards = cards;
  renderCards();
  renderActivity();
  renderConversations();
  if (state.selectedConversationId) renderThread();
  updateHeaderSummary();
}

// ---------- Spiele (Brawl Stars / Magic Brawl / eigene API) ----------

async function checkGame(game) {
  try {
    let result;
    if (game.type === 'brawlstars') result = await BrawlStars.fetchPlayer(game);
    else result = await CustomGame.fetchData(game);
    game.status = result.summary;
    game.stats = result.stats;
    game.lastChecked = new Date().toISOString();
    game.error = null;
  } catch (err) {
    game.error = err.message || 'Prüfung fehlgeschlagen';
    game.lastChecked = new Date().toISOString();
  }
  return game;
}

async function checkAllGames() {
  for (const game of config.games) await checkGame(game);
  saveConfig(config);
  renderGames();
  if (state.selectedGameId) renderGameDetail();
}

function renderGames() {
  const grid = document.getElementById('games-grid');
  grid.innerHTML = '';
  config.games.forEach(game => {
    const cat = gameCatalogFor(game);
    const el = document.createElement('div');
    el.className = 'card';
    const statusText = game.error ? game.error : (game.status || 'Noch nicht geprüft');
    el.innerHTML = `
      <div class="card-top">
        <div class="icon">${ICONS[cat.icon]}</div>
        <button class="card-menu" data-action="edit">&#8942;</button>
      </div>
      <div class="card-body">
        <h3>${escapeHtml(game.name)}</h3>
        <p class="status ${game.error ? 'err' : ''}">${escapeHtml(statusText)}</p>
      </div>
      <div class="card-footer">
        <span class="timestamp">${relTime(game.lastChecked)}</span>
      </div>
    `;
    el.querySelector('[data-action="edit"]').addEventListener('click', (e) => { e.stopPropagation(); openEditGameModal(game.id); });
    el.addEventListener('click', () => openGameDetail(game.id));
    grid.appendChild(el);
  });
  const addTile = document.createElement('div');
  addTile.className = 'card add-card';
  addTile.innerHTML = ICONS.plus;
  addTile.addEventListener('click', () => openAddGameModal());
  grid.appendChild(addTile);

  const label = document.getElementById('games-last-check-label');
  const times = config.games.map(g => g.lastChecked).filter(Boolean).sort();
  const last = times[times.length - 1];
  label.textContent = last ? `Zuletzt geprüft ${relTime(last)}` : 'Statistiken deiner Spiele-Accounts';
}

function renderGameDetail() {
  const game = config.games.find(g => g.id === state.selectedGameId);
  if (!game) return;
  document.getElementById('game-title').textContent = game.name;
  document.getElementById('game-subtitle').textContent = game.lastChecked ? `Zuletzt geprüft ${relTime(game.lastChecked)}` : '';
  const statsEl = document.getElementById('game-stats');
  const errEl = document.getElementById('game-error');
  if (game.error) { errEl.textContent = game.error; errEl.style.display = 'block'; }
  else { errEl.style.display = 'none'; }

  const stats = game.stats || [];
  if (stats.length === 0) {
    statsEl.innerHTML = '<div class="empty">Noch keine Daten vorhanden.</div>';
  } else {
    statsEl.innerHTML = stats.map(s => `
      <div class="stat-row"><span class="stat-label">${escapeHtml(s.label)}</span><span class="stat-value">${escapeHtml(String(s.value))}</span></div>
    `).join('');
  }
}

async function openGameDetail(id) {
  state.selectedGameId = id;
  renderGameDetail();
  document.getElementById('game-overlay').classList.add('open');
  const game = config.games.find(g => g.id === id);
  const stale = !game.lastChecked || Date.now() - new Date(game.lastChecked).getTime() > 5 * 60 * 1000;
  if (game && stale) {
    await checkGame(game);
    saveConfig(config);
    renderGames();
    renderGameDetail();
  }
}
function closeGameDetail() {
  document.getElementById('game-overlay').classList.remove('open');
  state.selectedGameId = null;
}

// ---------- Navigation (Tabbar) ----------

function switchView(name) {
  document.querySelectorAll('.tab-item').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
  if (name === 'games') {
    const stale = config.games.some(g => !g.lastChecked || Date.now() - new Date(g.lastChecked).getTime() > 5 * 60 * 1000);
    if (stale) checkAllGames();
  }
}
document.querySelectorAll('.tab-item').forEach(btn => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});

document.getElementById('thread-back').addEventListener('click', closeThread);
document.getElementById('game-back').addEventListener('click', closeGameDetail);
document.getElementById('game-edit').addEventListener('click', () => { if (state.selectedGameId) openEditGameModal(state.selectedGameId); });
document.getElementById('btn-games-refresh').addEventListener('click', () => checkAllGames());

// ---------- Antworten ----------

const replyForm = document.getElementById('thread-reply');
const replyInput = document.getElementById('reply-input');
const replySend = document.getElementById('reply-send');

replyForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const card = config.cards.find(c => c.id === state.selectedConversationId);
  const text = replyInput.value.trim();
  if (!card || !text) return;

  const errorEl = document.getElementById('thread-error');
  errorEl.style.display = 'none';
  replySend.disabled = true;
  replyInput.disabled = true;

  try {
    let sent;
    if (card.type === 'discord') sent = await Discord.sendMessage(card, text);
    else if (card.type === 'telegram') sent = await Telegram.sendMessage(card, text);
    else throw new Error('Antworten wird für diesen Kartentyp nicht unterstützt');

    card.messages = card.messages || [];
    card.messages.push(sent);
    if (card.messages.length > 50) card.messages = card.messages.slice(-50);
    card.lastChecked = new Date().toISOString();
    saveConfig(config);

    replyInput.value = '';
    replyInput.style.height = 'auto';
    renderThread();
    renderConversations();
    const messagesEl = document.getElementById('thread-messages');
    messagesEl.scrollTop = messagesEl.scrollHeight;
  } catch (err) {
    errorEl.textContent = err?.message || 'Nachricht konnte nicht gesendet werden.';
    errorEl.style.display = 'block';
  } finally {
    replySend.disabled = false;
    replyInput.disabled = false;
  }
});

replyInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); replyForm.requestSubmit(); }
});
replyInput.addEventListener('input', () => {
  replyInput.style.height = 'auto';
  replyInput.style.height = Math.min(replyInput.scrollHeight, 100) + 'px';
});

// ---------- KI-Chat (OpenAI, eigener API-Key) ----------

const aiForm = document.getElementById('ai-form');
const aiInput = document.getElementById('ai-input');
const aiSend = document.getElementById('ai-send');

function renderAiMessages() {
  const el = document.getElementById('ai-messages');
  const msgs = config.aiMessages || [];
  if (msgs.length === 0) {
    el.innerHTML = '<div class="empty">Schreib der KI eine Nachricht, um loszulegen.</div>';
    return;
  }
  const wasScrolledDown = el.scrollTop + el.clientHeight >= el.scrollHeight - 30;
  el.innerHTML = msgs.map(m => `
    <div class="msg-row ${m.role === 'user' ? 'out' : 'in'}">
      <div class="msg-bubble">
        ${m.role !== 'user' ? '<div class="msg-author">KI</div>' : ''}
        <div class="msg-text">${escapeHtml(m.content)}</div>
        <div class="msg-time">${relTime(m.time)}</div>
      </div>
    </div>
  `).join('');
  if (wasScrolledDown) el.scrollTop = el.scrollHeight;
}

aiForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = aiInput.value.trim();
  if (!text) return;
  const errorEl = document.getElementById('ai-error');
  errorEl.style.display = 'none';
  aiSend.disabled = true;
  aiInput.disabled = true;

  config.aiMessages = config.aiMessages || [];
  config.aiMessages.push({ role: 'user', content: text, time: new Date().toISOString() });
  saveConfig(config);
  aiInput.value = '';
  aiInput.style.height = 'auto';
  renderAiMessages();
  const msgsEl = document.getElementById('ai-messages');
  msgsEl.scrollTop = msgsEl.scrollHeight;

  try {
    const reply = await OpenAI.send(config.ai, config.aiMessages);
    config.aiMessages.push({ role: 'assistant', content: reply, time: new Date().toISOString() });
    saveConfig(config);
    renderAiMessages();
    msgsEl.scrollTop = msgsEl.scrollHeight;
  } catch (err) {
    errorEl.textContent = err?.message || 'Nachricht konnte nicht gesendet werden.';
    errorEl.style.display = 'block';
  } finally {
    aiSend.disabled = false;
    aiInput.disabled = false;
  }
});

aiInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); aiForm.requestSubmit(); }
});
aiInput.addEventListener('input', () => {
  aiInput.style.height = 'auto';
  aiInput.style.height = Math.min(aiInput.scrollHeight, 100) + 'px';
});

document.getElementById('btn-ai-clear').addEventListener('click', () => {
  config.aiMessages = [];
  saveConfig(config);
  renderAiMessages();
});

// ---------- Einstellungen ----------

document.getElementById('setting-interval').addEventListener('change', (e) => {
  config.pollIntervalSec = parseInt(e.target.value, 10);
  saveConfig(config);
  schedulePolling();
});
document.getElementById('setting-ai-key').addEventListener('change', (e) => {
  config.ai.apiKey = e.target.value.trim();
  saveConfig(config);
});
document.getElementById('setting-ai-model').addEventListener('change', (e) => {
  config.ai.model = e.target.value.trim() || 'gpt-4o-mini';
  saveConfig(config);
});
document.getElementById('setting-ai-system').addEventListener('change', (e) => {
  config.ai.systemPrompt = e.target.value.trim();
  saveConfig(config);
});
function syncSettingsForm() {
  document.getElementById('setting-interval').value = String(config.pollIntervalSec || 60);
  document.getElementById('setting-ai-key').value = config.ai?.apiKey || '';
  document.getElementById('setting-ai-model').value = config.ai?.model || 'gpt-4o-mini';
  document.getElementById('setting-ai-system').value = config.ai?.systemPrompt || '';
}

document.getElementById('btn-check-now').addEventListener('click', () => runPollCycle());

// ---------- Modal: Karte hinzufügen / bearbeiten ----------

const backdrop = document.getElementById('modal-backdrop');
const modalBody = document.getElementById('modal-body');
const modalTitle = document.getElementById('modal-title');

document.getElementById('modal-close').addEventListener('click', closeModal);
backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(); });

function closeModal() {
  backdrop.classList.remove('open');
  state.editingId = null;
  state.selectedPreset = null;
}
function openAddModal() {
  state.editingId = null;
  state.selectedPreset = null;
  modalTitle.textContent = 'Dienst verbinden';
  renderPickerStep();
  backdrop.classList.add('open');
}
function openEditModal(id) {
  const card = config.cards.find(c => c.id === id);
  if (!card) return;
  state.editingId = id;
  state.selectedPreset = catalogFor(card).key;
  modalTitle.textContent = card.name;
  renderFormStep(card);
  backdrop.classList.add('open');
}

function renderPickerStep() {
  modalBody.innerHTML = `<div class="service-picker" id="service-picker"></div>`;
  const picker = document.getElementById('service-picker');
  CATALOG.forEach(item => {
    const btn = document.createElement('button');
    btn.innerHTML = `${ICONS[item.icon]}<span>${item.label}</span>`;
    btn.addEventListener('click', () => {
      state.selectedPreset = item.key;
      modalTitle.textContent = `${item.label} verbinden`;
      renderFormStep(null, item.key);
    });
    picker.appendChild(btn);
  });
}

function renderFormStep(existingCard, presetKeyOverride) {
  const presetKey = presetKeyOverride || state.selectedPreset;
  const preset = CATALOG.find(c => c.key === presetKey);
  const card = existingCard || { name: preset.defaultName, presetKey: preset.key, type: preset.type };

  let fieldsHtml = `<div class="field"><label>Name der Karte</label><input type="text" id="f-name" value="${escapeHtml(card.name)}" /></div>`;

  if (preset.type === 'telegram') {
    fieldsHtml += `
      <div class="field">
        <label>Bot-Token</label>
        <input type="text" id="f-token" placeholder="123456:ABC-DEF..." value="${escapeHtml(card.token || '')}" />
        <p class="hint">Erstelle einen Bot bei @BotFather in Telegram und füge hier den Token ein. Der Bot sieht nur Nachrichten, die ihm direkt geschickt werden oder in Gruppen, in denen er Mitglied ist.</p>
      </div>`;
  } else if (preset.type === 'discord') {
    fieldsHtml += `
      <div class="field"><label>Bot-Token</label><input type="text" id="f-token" placeholder="Bot-Token aus dem Discord Developer Portal" value="${escapeHtml(card.token || '')}" /></div>
      <div class="field">
        <label>Channel-ID</label>
        <input type="text" id="f-channelId" placeholder="z.B. 123456789012345678" value="${escapeHtml(card.channelId || '')}" />
        <p class="hint">Bot im Discord Developer Portal anlegen, auf deinen Server einladen, Channel-ID per Rechtsklick kopieren (Entwicklermodus aktivieren). Private DMs können nicht ausgelesen werden.</p>
      </div>`;
  } else if (preset.type === 'wallet') {
    const chain = card.chain || 'btc';
    fieldsHtml += `
      <div class="field"><label>Netzwerk</label>
        <select id="f-chain">
          <option value="btc" ${chain === 'btc' ? 'selected' : ''}>Bitcoin</option>
          <option value="eth" ${chain === 'eth' ? 'selected' : ''}>Ethereum</option>
        </select>
      </div>
      <div class="field">
        <label>Öffentliche Wallet-Adresse</label>
        <input type="text" id="f-address" placeholder="Nur die öffentliche Adresse" value="${escapeHtml(card.address || '')}" />
      </div>`;
  } else {
    fieldsHtml += `
      <div class="field">
        <label>Link zum Öffnen (optional)</label>
        <input type="url" id="f-url" placeholder="https://..." value="${escapeHtml(card.url || '')}" />
        <p class="hint">Für Dienste ohne öffentliche API funktioniert diese Karte nur zum manuellen Markieren/Öffnen.</p>
      </div>`;
  }

  modalBody.innerHTML = `
    <div class="field-group">${fieldsHtml}</div>
    <div class="modal-actions">
      <div>${existingCard ? '<button class="btn-danger" id="btn-delete">Entfernen</button>' : ''}</div>
      <div style="display:flex; gap:8px;">
        <button class="btn-ghost" id="btn-cancel">Abbrechen</button>
        <button class="btn-confirm" id="btn-save">Speichern</button>
      </div>
    </div>`;

  document.getElementById('btn-cancel').addEventListener('click', closeModal);
  const delBtn = document.getElementById('btn-delete');
  if (delBtn) delBtn.addEventListener('click', () => {
    config.cards = config.cards.filter(c => c.id !== existingCard.id);
    saveConfig(config);
    applyCards(config.cards);
    closeModal();
  });

  document.getElementById('btn-save').addEventListener('click', () => {
    const payload = { name: document.getElementById('f-name').value.trim() || preset.defaultName, presetKey: preset.key, type: preset.type };
    if (preset.type === 'telegram') payload.token = document.getElementById('f-token').value.trim();
    if (preset.type === 'discord') {
      payload.token = document.getElementById('f-token').value.trim();
      payload.channelId = document.getElementById('f-channelId').value.trim();
    }
    if (preset.type === 'wallet') {
      payload.chain = document.getElementById('f-chain').value;
      payload.address = document.getElementById('f-address').value.trim();
    }
    if (preset.type === 'manual') payload.url = document.getElementById('f-url').value.trim();

    if (existingCard) {
      Object.assign(existingCard, payload);
      saveConfig(config);
      applyCards(config.cards);
      closeModal();
    } else {
      payload.id = `card_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      payload.unread = 0;
      payload.status = payload.type === 'manual' ? 'Bereit — manuell markieren' : 'Noch nicht geprüft';
      config.cards.push(payload);
      saveConfig(config);
      applyCards(config.cards);
      closeModal();
      checkCard(payload).then(() => { saveConfig(config); applyCards(config.cards); });
    }
  });
}

// ---------- Modal: Spiel hinzufügen / bearbeiten ----------

function openAddGameModal() {
  state.editingId = null;
  state.selectedPreset = null;
  modalTitle.textContent = 'Spiel verbinden';
  renderGamePickerStep();
  backdrop.classList.add('open');
}
function openEditGameModal(id) {
  const game = config.games.find(g => g.id === id);
  if (!game) return;
  state.editingId = id;
  state.selectedPreset = game.type;
  modalTitle.textContent = game.name;
  renderGameFormStep(game);
  backdrop.classList.add('open');
}

function renderGamePickerStep() {
  modalBody.innerHTML = `<div class="service-picker" id="service-picker"></div>`;
  const picker = document.getElementById('service-picker');
  GAME_CATALOG.forEach(item => {
    const btn = document.createElement('button');
    btn.innerHTML = `${ICONS[item.icon]}<span>${item.label}</span>`;
    btn.addEventListener('click', () => {
      state.selectedPreset = item.key;
      modalTitle.textContent = `${item.label} verbinden`;
      renderGameFormStep(null, item.key);
    });
    picker.appendChild(btn);
  });
}

function renderGameFormStep(existingGame, presetKeyOverride) {
  const presetKey = presetKeyOverride || state.selectedPreset;
  const preset = GAME_CATALOG.find(g => g.key === presetKey);
  const game = existingGame || { name: preset.defaultName, type: preset.type };

  let fieldsHtml = `<div class="field"><label>Name der Karte</label><input type="text" id="g-name" value="${escapeHtml(game.name)}" /></div>`;

  if (preset.type === 'brawlstars') {
    fieldsHtml += `
      <div class="field">
        <label>API-Key</label>
        <input type="text" id="g-apiKey" placeholder="Key von developer.brawlstars.com" value="${escapeHtml(game.apiKey || '')}" />
      </div>
      <div class="field">
        <label>Spieler-Tag</label>
        <input type="text" id="g-playerTag" placeholder="z. B. #8CG8LUJ" value="${escapeHtml(game.playerTag || '')}" />
      </div>
      <div class="field">
        <label>Verbindung</label>
        <select id="g-useProxy">
          <option value="1" ${game.useProxy !== false ? 'selected' : ''}>Proxy (empfohlen fürs Handy)</option>
          <option value="0" ${game.useProxy === false ? 'selected' : ''}>Direkt (nur bei fester IP)</option>
        </select>
        <p class="hint">Key auf developer.brawlstars.com erstellen. Beim Proxy trägst du dort die feste IP <strong>45.79.218.79</strong> ein (statt deiner eigenen wechselnden Handy-IP) — dann funktioniert's zuverlässig.</p>
      </div>`;
  } else {
    fieldsHtml += `
      <div class="field">
        <label>API-URL</label>
        <input type="url" id="g-url" placeholder="https://.../stats/DeinName" value="${escapeHtml(game.url || '')}" />
        <p class="hint">Vollständige Adresse, die JSON mit deinen Statistiken zurückgibt (z. B. von Magic Brawl).</p>
      </div>
      <div class="field">
        <label>Authorization-Header (optional)</label>
        <input type="text" id="g-authHeader" placeholder="z. B. Bearer DEIN_TOKEN" value="${escapeHtml(game.authHeader || '')}" />
      </div>`;
  }

  modalBody.innerHTML = `
    <div class="field-group">${fieldsHtml}</div>
    <div class="modal-actions">
      <div>${existingGame ? '<button class="btn-danger" id="btn-delete">Entfernen</button>' : ''}</div>
      <div style="display:flex; gap:8px;">
        <button class="btn-ghost" id="btn-cancel">Abbrechen</button>
        <button class="btn-confirm" id="btn-save">Speichern</button>
      </div>
    </div>`;

  document.getElementById('btn-cancel').addEventListener('click', closeModal);
  const delBtn = document.getElementById('btn-delete');
  if (delBtn) delBtn.addEventListener('click', () => {
    config.games = config.games.filter(g => g.id !== existingGame.id);
    saveConfig(config);
    renderGames();
    closeModal();
  });

  document.getElementById('btn-save').addEventListener('click', () => {
    const payload = { name: document.getElementById('g-name').value.trim() || preset.defaultName, type: preset.type };
    if (preset.type === 'brawlstars') {
      payload.apiKey = document.getElementById('g-apiKey').value.trim();
      payload.playerTag = document.getElementById('g-playerTag').value.trim();
      payload.useProxy = document.getElementById('g-useProxy').value === '1';
    } else {
      payload.url = document.getElementById('g-url').value.trim();
      payload.authHeader = document.getElementById('g-authHeader').value.trim();
    }

    if (existingGame) {
      Object.assign(existingGame, payload);
      saveConfig(config);
      renderGames();
      closeModal();
      checkGame(existingGame).then(() => {
        saveConfig(config);
        renderGames();
        if (state.selectedGameId === existingGame.id) renderGameDetail();
      });
    } else {
      payload.id = `game_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      payload.status = 'Noch nicht geprüft';
      config.games.push(payload);
      saveConfig(config);
      renderGames();
      closeModal();
      checkGame(payload).then(() => { saveConfig(config); renderGames(); });
    }
  });
}

// ---------- Init ----------

async function init() {
  state.prevCards = Object.fromEntries(config.cards.map(c => [c.id, { unread: c.unread || 0 }]));
  syncSettingsForm();
  renderCards();
  renderActivity();
  renderConversations();
  renderGames();
  renderAiMessages();
  updateHeaderSummary();

  try {
    const LN = window.Capacitor?.Plugins?.LocalNotifications;
    if (LN) await LN.requestPermissions();
  } catch (e) { /* optional */ }

  schedulePolling();
}

init();
