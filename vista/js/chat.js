/*
  ╔══════════════════════════════════════════════════════╗
  ║                PLANCLUB VIP — chat.js                ║
  ║       Chat real persona a persona via Flask/Render   ║
  ╚══════════════════════════════════════════════════════╝
*/

// ─── CONFIGURACIÓN DE TU BACKEND EN RENDER ───────────────────
const URL_API = "https://pplan-club.onrender.com"; // <-- Pon tu link real de Render sin "/" al final
// ─────────────────────────────────────────────────────────────

const VENDOR_CODE    = "1234";   // ← código para entrar como vendedor
const MAX_CHATS      = 5;        // máximo chats simultáneos por vendedor

// ═══════════════════════════════════════════════════════
//   ESTADO GLOBAL
// ═══════════════════════════════════════════════════════
let myRole           = null;
let myName           = '';
let myId             = '';
let currentChatId   = null;
let clientRoomId    = null;
let vendorChats     = {};   // { chatId: { name, unread, lastMsg } }
let loopMensajes     = null; // Temporizador para traer mensajes nuevos
let loopSidebar      = null; // Temporizador para la barra del vendedor

// ═══════════════════════════════════════════════════════
//   UTILIDADES
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
  // Evitar duplicados visuales en pantalla
  const msgId = data.ts || Date.now();
  if (document.getElementById(`msg-${msgId}`)) return;

  const row = document.createElement('div');
  row.className = 'msg-row ' + type;
  row.id = `msg-${msgId}`;
  const sender = type === 'sent' ? 'Tú' : esc(data.senderName || data.role || 'Otro');
  row.innerHTML =
    `<div class="msg-sender">${sender}</div>` +
    `<div class="msg-bubble">${esc(data.text || data.contenido)}</div>` +
    `<div class="msg-time">${data.time || data.fecha || ''}</div>`;
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
//   PANTALLA ACCESO
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

  myName = name;
  myRole = selectedRole;
  myId = myRole === 'vendedor' ? 'PC' : uid('USR_'); // Forzamos 'PC' para el vendedor como en tu diseño

  myRole === 'cliente' ? startClient() : startVendor();
}

// ═══════════════════════════════════════════════════════
//   CLIENTE — lógica adaptada a Flask
// ═══════════════════════════════════════════════════════
function startClient() {
  showScreen('screen-cliente');
  setClientStatus('waiting', 'BUSCANDO VENDEDOR...');

  clientRoomId = uid('CHAT_');
  document.getElementById('client-room-code').textContent = clientRoomId;

  // El cliente crea la sala en la base de datos de Render
  fetch(`${URL_API}/api/chat/acceder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id_chat: clientRoomId,
      usuario: myName,
      rol: 'cliente'
    })
  })
  .then(res => res.json())
  .then(data => {
    if (data.status === "success") {
       // Empezamos a escuchar de forma repetitiva si el vendedor ya se unió a esta sala
       loopMensajes = setInterval(verificarEstadoYMensajesCliente, 3000);
    } else {
       toast("Error al crear sala en el servidor");
    }
  })
  .catch(err => console.error("Error:", err));
}

let clienteYaConectado = false;

function verificarEstadoYMensajesCliente() {
  // Como no hay sockets, simulamos consultando el historial del chat
  fetch(`${URL_API}/api/chat/mensajes/${clientRoomId}`)
  .then(res => res.json())
  .then(mensajes => {
    // Si ya hay mensajes o el servidor responde, asumimos canal establecido
    if (!clienteYaConectado) {
      clienteYaConectado = true;
      openClientChat();
    }
    
    const msgsContainer = document.getElementById('client-messages');
    mensajes.forEach(msg => {
      if (msg.remitente === myName) return; // Omitir propios
      appendMsg(msgsContainer, msg, 'recv');
    });
  })
  .catch(err => console.error(err));
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

  // Configurar botones de envío (limpiando listeners viejos)
  const sendBtn = document.getElementById('client-send-btn');
  const input   = document.getElementById('client-msg-input');
  
  sendBtn.replaceWith(sendBtn.cloneNode(true));
  const newSendBtn = document.getElementById('client-send-btn');

  function doSend() {
    const text = input.value.trim();
    if (!text) return;
    
    const msgData = {
      id_chat: clientRoomId,
      remitente: myName,
      rol_remitente: 'cliente',
      contenido: text
    };

    fetch(`${URL_API}/api/chat/mensaje`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(msgData)
    })
    .then(() => {
      appendMsg(msgs, { text: text, senderName: 'Tú', time: now(), ts: Date.now() }, 'sent');
      input.value = '';
    });
  }

  newSendBtn.addEventListener('click', doSend);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') doSend(); });
}

function setClientStatus(dotClass, txt) {
  const dot = document.getElementById('client-status-dot');
  if (dot) dot.className = 'header-status-dot' + (dotClass ? ' ' + dotClass : '');
  document.getElementById('client-status-txt').textContent = txt;
}

// ═══════════════════════════════════════════════════════
//   VENDEDOR — lógica adaptada a Flask
// ═══════════════════════════════════════════════════════
function startVendor() {
  showScreen('screen-vendedor');
  document.getElementById('vendor-display-id').textContent = myId;

  // Bucle para estar barriendo los chats asignados a este vendedor
  loopSidebar = setInterval(actualizarSidebarVendedor, 3000);
  
  // Bucle para actualizar los mensajes del chat que tenga abierto en pantalla
  loopMensajes = setInterval(actualizarMensajesVendedor, 2500);

  const sendBtn = document.getElementById('vendor-send-btn');
  const input   = document.getElementById('vendor-msg-input');
  sendBtn.addEventListener('click', vendorSend);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') vendorSend(); });

  document.getElementById('btn-terminate-chat').addEventListener('click', terminateChat);
}

function actualizarSidebarVendedor() {
  fetch(`${URL_API}/api/chat/vendedor/${myId}`)
  .then(res => res.json())
  .then(chats => {
    const list = document.getElementById('vendor-chat-list');
    if (chats.length === 0) {
      list.innerHTML = '<div class="no-chats-msg">Sin clientes activos</div>';
      updateStats(0);
      return;
    }

    // Guardar en nuestro estado global indexado
    chats.forEach(c => {
      if (!vendorChats[c.id_chat]) {
        vendorChats[c.id_chat] = { name: c.id_cliente, unread: 0, lastMsg: c.ultimo_mensaje };
        toast('✦ Nuevo cliente en cola: ' + c.id_cliente);
      } else {
        vendorChats[c.id_chat].lastMsg = c.ultimo_mensaje;
      }
    });

    // Pintar la barra de WhatsApp
    list.innerHTML = "";
    chats.forEach(c => {
      const item = makeChatItem(c.id_chat, c.id_cliente, c.ultimo_mensaje);
      if (c.id_chat === currentChatId) item.classList.add('active');
      list.appendChild(item);
      item.addEventListener('click', () => openVendorChat(c.id_chat));
    });

    updateStats(chats.length);
  })
  .catch(err => console.error(err));
}

function actualizarMensajesVendedor() {
  if (!currentChatId) return;

  fetch(`${URL_API}/api/chat/mensajes/${currentChatId}`)
  .then(res => res.json())
  .then(mensajes => {
    const container = document.getElementById('vendor-messages');
    mensajes.forEach(m => {
      if (m.remitente === myName) return; 
      appendMsg(container, m, 'recv');
    });
  });
}

function openVendorChat(chatId) {
  currentChatId = chatId;
  const data = vendorChats[chatId];
  if (!data) return;

  document.getElementById('vendor-placeholder').style.display = 'none';
  document.getElementById('vendor-active-chat').style.display = 'flex';

  document.getElementById('vchat-name').textContent = data.name;
  document.getElementById('vchat-avatar').textContent = initial(data.name);
  document.getElementById('vchat-status').textContent = '● activo';

  const container = document.getElementById('vendor-messages');
  container.innerHTML = '';
  sysMsg(container, '— Chat con ' + data.name + ' —');

  // Forzar carga de mensajes inicial
  actualizarMensajesVendedor();
  document.getElementById('vendor-msg-input').focus();
}

function vendorSend() {
  if (!currentChatId) return;
  const input = document.getElementById('vendor-msg-input');
  const text = input.value.trim();
  if (!text) return;

  const msgData = {
    id_chat: currentChatId,
    remitente: myName,
    rol_remitente: 'vendedor',
    contenido: text
  };

  fetch(`${URL_API}/api/chat/mensaje`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(msgData)
  })
  .then(() => {
    appendMsg(document.getElementById('vendor-messages'), { text: text, senderName: 'Tú', time: now(), ts: Date.now() }, 'sent');
    input.value = '';
  });
}

function terminateChat() {
  if (!currentChatId || !confirm('¿Terminar este chat?')) return;
  
  fetch(`${URL_API}/api/chat/terminar/${currentChatId}`, { method: 'POST' })
  .then(() => {
    toast('Chat cerrado con éxito');
    delete vendorChats[currentChatId];
    currentChatId = null;
    document.getElementById('vendor-active-chat').style.display = 'none';
    document.getElementById('vendor-placeholder').style.display = 'flex';
    actualizarSidebarVendedor();
  });
}

function updateStats(conteoActivos) {
  document.getElementById('stat-active').textContent = conteoActivos;
  document.getElementById('stat-available').textContent = Math.max(0, MAX_CHATS - conteoActivos);
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
//   BOTONES SALIR
// ═══════════════════════════════════════════════════════
document.getElementById('btn-client-exit').addEventListener('click', () => {
  if (!confirm('¿Salir del chat?')) return;
  clearInterval(loopMensajes);
  location.reload();
});

document.getElementById('btn-vendor-exit').addEventListener('click', () => {
  if (!confirm('¿Cerrar sesión?')) return;
  clearInterval(loopSidebar);
  clearInterval(loopMensajes);
  location.reload();
});