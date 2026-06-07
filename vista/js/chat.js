/*
  ╔══════════════════════════════════════════════════════╗
  ║         PLANCLUB VIP — chat.js                      ║
  ║  Chat real persona a persona via Firebase           ║
  ╠══════════════════════════════════════════════════════╣
  ║  PASOS PARA ACTIVAR (5 minutos):                    ║
  ║                                                      ║
  ║  1. Ir a https://console.firebase.google.com        ║
  ║  2. "Crear proyecto" → nombre cualquiera → listo    ║
  ║  3. En menú izq: "Realtime Database" →              ║
  ║     "Crear base de datos" → "Modo de prueba" → OK   ║
  ║  4. Engranaje ⚙ → "Configuración del proyecto"     ║
  ║     → scroll abajo → icono </> (Web app)            ║
  ║     → registrar → copiar el firebaseConfig          ║
  ║  5. Pegar los valores abajo reemplazando los TU_... ║
  ║  6. En Realtime Database → Reglas → publicar esto:  ║
  ║     { "rules": {".read":true, ".write":true} }      ║
  ╚══════════════════════════════════════════════════════╝
*/

// ─── PEGA AQUÍ TU CONFIG DE FIREBASE ───────────────────
const firebaseConfig = {
  apiKey:            "TU_API_KEY",
  authDomain:        "TU_PROYECTO.firebaseapp.com",
  databaseURL:       "https://TU_PROYECTO-default-rtdb.firebaseio.com",
  projectId:         "TU_PROYECTO",
  storageBucket:     "TU_PROYECTO.appspot.com",
  messagingSenderId: "TU_SENDER_ID",
  appId:             "TU_APP_ID"
};
// ───────────────────────────────────────────────────────

const VENDOR_CODE    = "1234";   // ← código para entrar como vendedor
const MAX_CHATS      = 5;        // máximo chats simultáneos por vendedor

// ═══════════════════════════════════════════════════════
//  ESTADO GLOBAL
// ═══════════════════════════════════════════════════════
let db              = null;
let myRole          = null;
let myName          = '';
let myId            = '';
let currentChatId   = null;
let clientRoomId    = null;
let vendorChats     = {};   // { chatId: { name, unread, msgListener } }
let clientMsgRef    = null;

// ═══════════════════════════════════════════════════════
//  FIREBASE INIT
// ═══════════════════════════════════════════════════════
function initFirebase() {
  try {
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    db = firebase.database();
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
}

// ═══════════════════════════════════════════════════════
//  UTILIDADES
// ═══════════════════════════════════════════════════════
function uid(prefix) {
  return (prefix || '') + Date.now().toString(36).toUpperCase() +
         Math.random().toString(36).substr(2, 4).toUpperCase();
}

function now() {
  return new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

function initial(name) { return (name || '?')[0].toUpperCase(); }

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function toast(msg, color) {
  let wrap = document.getElementById('toast-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'toast-wrap';
    wrap.className = 'toast-container';
    document.body.appendChild(wrap);
  }
  const t = document.createElement('div');
  t.className = 'toast' + (color === 'p' ? ' purple' : '');
  t.textContent = msg;
  wrap.appendChild(t);
  setTimeout(() => t.remove(), 3800);
}

function beep() {
  try {
    const A = new (window.AudioContext || window.webkitAudioContext)();
    const o = A.createOscillator(), g = A.createGain();
    o.connect(g); g.connect(A.destination);
    o.frequency.setValueAtTime(900, A.currentTime);
    o.frequency.exponentialRampToValueAtTime(500, A.currentTime + 0.12);
    g.gain.setValueAtTime(0.25, A.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, A.currentTime + 0.25);
    o.start(); o.stop(A.currentTime + 0.25);
  } catch(e) {}
}

function appendMsg(container, data, type) {
  const row = document.createElement('div');
  row.className = 'msg-row ' + type;
  const sender = type === 'sent' ? 'Tú' : esc(data.senderName || data.role || 'Otro');
  row.innerHTML =
    `<div class="msg-sender">${sender}</div>` +
    `<div class="msg-bubble">${esc(data.text)}</div>` +
    `<div class="msg-time">${data.time || ''}</div>`;
  container.appendChild(row);
  container.scrollTop = container.scrollHeight;
}

function sysMsg(container, text) {
  const d = document.createElement('div');
  d.className = 'sys-msg';
  d.textContent = text;
  container.appendChild(d);
  container.scrollTop = container.scrollHeight;
}

// ═══════════════════════════════════════════════════════
//  PANTALLA ACCESO
// ═══════════════════════════════════════════════════════
let selectedRole = 'cliente';

document.querySelectorAll('.role-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    selectedRole = btn.dataset.role;
    document.querySelectorAll('.role-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('vendor-code-group').style.display =
      selectedRole === 'vendedor' ? 'block' : 'none';
  });
});

document.getElementById('btn-enter').addEventListener('click', handleEnter);
document.getElementById('input-name').addEventListener('keydown', e => {
  if (e.key === 'Enter') handleEnter();
});

function handleEnter() {
  const name = document.getElementById('input-name').value.trim();
  if (!name) { document.getElementById('input-name').focus(); return; }

  if (selectedRole === 'vendedor') {
    const code = document.getElementById('input-vendor-code').value.trim();
    if (code !== VENDOR_CODE) {
      const inp = document.getElementById('input-vendor-code');
      inp.style.borderColor = '#ff4466';
      inp.style.boxShadow = '0 0 0 3px rgba(255,68,102,0.15)';
      setTimeout(() => { inp.style.borderColor = ''; inp.style.boxShadow = ''; }, 1800);
      toast('Código incorrecto', 'p');
      return;
    }
  }

  // Verificar que Firebase esté configurado
  if (firebaseConfig.apiKey === 'TU_API_KEY') {
    showScreen(selectedRole === 'vendedor' ? 'screen-vendedor' : 'screen-cliente');
    showConfigError();
    return;
  }

  myName = name;
  myRole = selectedRole;
  myId = uid(myRole === 'vendedor' ? 'V' : 'C');

  if (!initFirebase()) {
    toast('Error al conectar con Firebase. Revisa la consola.');
    return;
  }

  myRole === 'cliente' ? startClient() : startVendor();
}

function showConfigError() {
  const div = document.createElement('div');
  div.style.cssText = `
    position:fixed; inset:0; z-index:9999;
    background:rgba(5,5,16,0.97);
    display:flex; flex-direction:column;
    align-items:center; justify-content:center;
    gap:16px; padding:30px; text-align:center;
    font-family:'Space Grotesk',sans-serif;
  `;
  div.innerHTML = `
    <div style="color:#00e5ff;font-size:2rem;">⚠</div>
    <div style="color:white;font-size:1rem;font-weight:600;letter-spacing:2px;">FIREBASE NO CONFIGURADO</div>
    <div style="color:#6272a4;font-size:0.82rem;line-height:1.7;max-width:380px;">
      Para que el chat funcione entre dispositivos reales necesitas configurar Firebase.<br><br>
      Abre <code style="color:#00e5ff;">chat.js</code> y reemplaza los valores de <code style="color:#b400ff;">firebaseConfig</code> con los de tu proyecto Firebase.<br><br>
      El README.md incluye el paso a paso completo (5 minutos).
    </div>
    <button onclick="location.reload()" style="
      margin-top:10px; padding:12px 24px;
      background:rgba(0,229,255,0.1); border:1px solid #00e5ff;
      border-radius:10px; color:white; font-family:inherit;
      font-size:0.8rem; letter-spacing:2px; cursor:pointer;
    ">VOLVER</button>
  `;
  document.body.appendChild(div);
}

// ═══════════════════════════════════════════════════════
//  CLIENTE — lógica principal
// ═══════════════════════════════════════════════════════
async function startClient() {
  showScreen('screen-cliente');
  setClientStatus('waiting', 'BUSCANDO VENDEDOR...');

  // Buscar vendedor disponible (online y con cupo)
  const snap = await db.ref('vendedores')
    .orderByChild('online').equalTo(true).once('value');

  let vendorId = null;
  let minChats = MAX_CHATS + 1;

  snap.forEach(child => {
    const v = child.val();
    const active = v.chats_activos || 0;
    if (active < MAX_CHATS && active < minChats) {
      minChats = active;
      vendorId = child.key;
    }
  });

  if (!vendorId) {
    setClientStatus('', 'SIN VENDEDORES DISPONIBLES');
    document.getElementById('client-waiting').querySelector('.waiting-title').textContent =
      'No hay vendedores disponibles ahora';
    document.getElementById('client-waiting').querySelector('.waiting-sub').textContent =
      'Vuelve a intentarlo en unos minutos';
    return;
  }

  // Crear sala
  clientRoomId = uid('CHAT');
  document.getElementById('client-room-code').textContent = clientRoomId;

  await db.ref('chats/' + clientRoomId).set({
    vendorId, clientId: myId, clientName: myName,
    status: 'waiting', createdAt: Date.now()
  });

  // Poner en cola del vendedor
  await db.ref('vendedores/' + vendorId + '/queue/' + clientRoomId).set({
    clientName: myName, clientId: myId,
    chatId: clientRoomId, ts: Date.now()
  });

  // Escuchar cuando el vendedor acepta (status → active)
  db.ref('chats/' + clientRoomId + '/status').on('value', snap => {
    const status = snap.val();
    if (status === 'active') {
      // Vendedor conectado — abrir chat
      openClientChat();
    } else if (status === 'closed') {
      handleClientClosed();
    } else if (status === 'no_vendor') {
      setClientStatus('', 'SIN VENDEDORES DISPONIBLES');
      document.getElementById('client-waiting').querySelector('.waiting-title').textContent =
        'Vendedor no disponible en este momento';
    }
  });
}

function openClientChat() {
  setClientStatus('online', 'VENDEDOR CONECTADO');

  document.getElementById('client-waiting').style.display = 'none';
  const msgs = document.getElementById('client-messages');
  msgs.style.display = 'flex';

  const bar = document.getElementById('client-input-bar');
  bar.style.opacity = '1';
  bar.style.pointerEvents = 'auto';

  sysMsg(msgs, '— Canal VIP establecido —');

  // Escuchar mensajes entrantes
  db.ref('chats/' + clientRoomId + '/messages').on('child_added', snap => {
    const msg = snap.val();
    if (msg.senderId === myId) return; // ya lo pintamos al enviar
    appendMsg(msgs, msg, 'recv');
    beep();
  });

  // Envío
  const sendBtn = document.getElementById('client-send-btn');
  const input   = document.getElementById('client-msg-input');

  function doSend() {
    const text = input.value.trim();
    if (!text) return;
    const msg = {
      text, senderId: myId, senderName: myName,
      role: 'CLIENTE', time: now(), ts: Date.now()
    };
    db.ref('chats/' + clientRoomId + '/messages').push(msg);
    appendMsg(msgs, msg, 'sent');
    input.value = '';
  }

  sendBtn.addEventListener('click', doSend);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') doSend(); });
}

function handleClientClosed() {
  const msgs = document.getElementById('client-messages');
  sysMsg(msgs, '— El vendedor ha cerrado el chat —');
  const bar = document.getElementById('client-input-bar');
  bar.style.opacity = '0.35';
  bar.style.pointerEvents = 'none';
  setClientStatus('', 'CHAT FINALIZADO');
}

function setClientStatus(dotClass, txt) {
  const dot = document.getElementById('client-status-dot');
  dot.className = 'header-status-dot' + (dotClass ? ' ' + dotClass : '');
  document.getElementById('client-status-txt').textContent = txt;
}

// ═══════════════════════════════════════════════════════
//  VENDEDOR — lógica principal
// ═══════════════════════════════════════════════════════
async function startVendor() {
  showScreen('screen-vendedor');
  document.getElementById('vendor-display-id').textContent = myId;

  // Registrar presencia
  const vRef = db.ref('vendedores/' + myId);
  await vRef.set({
    name: myName, online: true,
    chats_activos: 0, ts: Date.now()
  });

  // Desconectar limpio al cerrar
  vRef.onDisconnect().update({ online: false });

  // Escuchar cola de clientes
  db.ref('vendedores/' + myId + '/queue').on('child_added', snap => {
    const info = snap.val();
    if (!info) return;
    if (Object.keys(vendorChats).length >= MAX_CHATS) {
      db.ref('chats/' + info.chatId + '/status').set('no_vendor');
      return;
    }
    acceptClient(info.chatId, info.clientName);
  });

  // Botón enviar
  const sendBtn = document.getElementById('vendor-send-btn');
  const input   = document.getElementById('vendor-msg-input');
  sendBtn.addEventListener('click', vendorSend);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') vendorSend(); });

  // Botón terminar chat
  document.getElementById('btn-terminate-chat').addEventListener('click', terminateChat);
}

async function acceptClient(chatId, clientName) {
  if (vendorChats[chatId]) return;

  vendorChats[chatId] = { name: clientName, unread: 0, lastMsg: 'Conectando...' };
  updateStats();

  // Marcar chat como activo para que el cliente lo vea
  await db.ref('chats/' + chatId + '/status').set('active');

  // Incrementar contador en Firebase
  db.ref('vendedores/' + myId + '/chats_activos').transaction(n => (n || 0) + 1);

  // Añadir al sidebar
  const list = document.getElementById('vendor-chat-list');
  list.querySelector('.no-chats-msg')?.remove();

  const item = makeChatItem(chatId, clientName, 'Conectando...');
  list.appendChild(item);
  item.addEventListener('click', () => openVendorChat(chatId));

  // Escuchar mensajes
  const ref = db.ref('chats/' + chatId + '/messages');
  const listener = ref.on('child_added', snap => {
    const msg = snap.val();
    if (msg.senderId === myId) return;

    vendorChats[chatId].lastMsg = msg.text;
    const lastEl = document.querySelector('#ci-' + chatId + ' .chat-item-last');
    if (lastEl) lastEl.textContent = msg.text;

    if (currentChatId === chatId) {
      appendMsg(document.getElementById('vendor-messages'), msg, 'recv');
      beep();
    } else {
      vendorChats[chatId].unread = (vendorChats[chatId].unread || 0) + 1;
      setBadge(chatId, vendorChats[chatId].unread);
      beep();
      toast('💬 ' + clientName + ': ' + msg.text.slice(0, 35) + (msg.text.length > 35 ? '…' : ''), 'p');
    }
  });

  vendorChats[chatId].listener = listener;
  vendorChats[chatId].ref = ref;

  toast('✦ Nuevo cliente: ' + clientName);

  // Auto-abrir si es el único
  if (Object.keys(vendorChats).length === 1) openVendorChat(chatId);
}

function openVendorChat(chatId) {
  currentChatId = chatId;
  const data = vendorChats[chatId];

  document.querySelectorAll('.chat-item').forEach(i => i.classList.remove('active'));
  const item = document.getElementById('ci-' + chatId);
  if (item) { item.classList.add('active'); item.querySelector('.chat-item-unread')?.remove(); }
  vendorChats[chatId].unread = 0;

  document.getElementById('vendor-placeholder').style.display = 'none';
  document.getElementById('vendor-active-chat').style.display = 'flex';

  document.getElementById('vchat-name').textContent = data.name;
  document.getElementById('vchat-avatar').textContent = initial(data.name);
  document.getElementById('vchat-status').textContent = '● activo';

  const container = document.getElementById('vendor-messages');
  container.innerHTML = '';
  sysMsg(container, '— Chat con ' + data.name + ' —');

  // Historial
  db.ref('chats/' + chatId + '/messages').once('value', snap => {
    snap.forEach(child => {
      const msg = child.val();
      appendMsg(container, msg, msg.senderId === myId ? 'sent' : 'recv');
    });
  });

  document.getElementById('vendor-msg-input').focus();
}

function vendorSend() {
  if (!currentChatId) return;
  const input = document.getElementById('vendor-msg-input');
  const text = input.value.trim();
  if (!text) return;

  const msg = {
    text, senderId: myId, senderName: myName,
    role: 'VENDEDOR', time: now(), ts: Date.now()
  };

  db.ref('chats/' + currentChatId + '/messages').push(msg);
  appendMsg(document.getElementById('vendor-messages'), msg, 'sent');
  input.value = '';

  const lastEl = document.querySelector('#ci-' + currentChatId + ' .chat-item-last');
  if (lastEl) lastEl.textContent = text;
}

function terminateChat() {
  if (!currentChatId || !confirm('¿Terminar este chat?')) return;
  db.ref('chats/' + currentChatId + '/status').set('closed');
  cleanVendorChat(currentChatId);
}

function cleanVendorChat(chatId) {
  if (!vendorChats[chatId]) return;
  if (vendorChats[chatId].ref && vendorChats[chatId].listener) {
    vendorChats[chatId].ref.off('child_added', vendorChats[chatId].listener);
  }
  document.getElementById('ci-' + chatId)?.remove();
  delete vendorChats[chatId];

  db.ref('vendedores/' + myId + '/queue/' + chatId).remove();
  db.ref('vendedores/' + myId + '/chats_activos').transaction(n => Math.max(0, (n || 1) - 1));

  updateStats();

  if (chatId === currentChatId) {
    currentChatId = null;
    document.getElementById('vendor-active-chat').style.display = 'none';
    document.getElementById('vendor-placeholder').style.display = 'flex';
    const remaining = Object.keys(vendorChats);
    if (remaining.length > 0) openVendorChat(remaining[0]);
    else document.getElementById('vendor-chat-list').innerHTML =
      '<div class="no-chats-msg">Sin clientes activos</div>';
  }
}

function updateStats() {
  const n = Object.keys(vendorChats).length;
  document.getElementById('stat-active').textContent = n;
  document.getElementById('stat-available').textContent = Math.max(0, MAX_CHATS - n);
}

function setBadge(chatId, count) {
  const item = document.getElementById('ci-' + chatId);
  if (!item) return;
  let badge = item.querySelector('.chat-item-unread');
  if (count > 0) {
    if (!badge) { badge = document.createElement('div'); badge.className = 'chat-item-unread'; item.appendChild(badge); }
    badge.textContent = count > 9 ? '9+' : count;
  } else badge?.remove();
}

function makeChatItem(chatId, name, lastMsg) {
  const item = document.createElement('div');
  item.className = 'chat-item';
  item.id = 'ci-' + chatId;
  item.innerHTML =
    `<div class="chat-avatar">${initial(name)}</div>` +
    `<div class="chat-item-info">` +
      `<div class="chat-item-name">${esc(name)}</div>` +
      `<div class="chat-item-last">${esc(lastMsg)}</div>` +
    `</div>`;
  return item;
}

// ═══════════════════════════════════════════════════════
//  BOTONES SALIR
// ═══════════════════════════════════════════════════════
document.getElementById('btn-client-exit').addEventListener('click', () => {
  if (!confirm('¿Salir del chat?')) return;
  if (clientRoomId && db) db.ref('chats/' + clientRoomId + '/status').set('closed');
  location.reload();
});

document.getElementById('btn-vendor-exit').addEventListener('click', () => {
  if (!confirm('¿Cerrar sesión? Se cierran todos los chats activos.')) return;
  if (db) {
    Object.keys(vendorChats).forEach(id => db.ref('chats/' + id + '/status').set('closed'));
    db.ref('vendedores/' + myId).update({ online: false, chats_activos: 0 });
  }
  location.reload();
});
