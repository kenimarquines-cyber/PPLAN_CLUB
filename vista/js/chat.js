import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, doc,
  setDoc, getDoc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const app = initializeApp({
  apiKey:         "AIzaSyDX6EWo3Y4M0a4bgOzmEF6DVU-ewd6aadE",
  authDomain:     "chatplanclub.firebaseapp.com",
  projectId:      "chatplanclub",
  storageBucket:  "chatplanclub.firebasestorage.app",
  messagingSenderId: "495297083014",
  appId:             "1:495297083014:web:0e0d1b3e17e583840b0307"
});
const db = getFirestore(app);

/* ── ESTADO ─────────────────────────────────────────── */
let myName    = "";
let myId      = "";
let myRole    = "host"; // 'host' | 'guest'
let roomCode  = "";
let roomId    = "";
let unsubRoom = null;
let unsubMsgs = null;
const rendered = new Set();

/* ── UTILS ──────────────────────────────────────────── */
const $   = id => document.getElementById(id);
const esc = s  => { const d = document.createElement("div"); d.textContent=s||""; return d.innerHTML; };
const ini = n  => (n||"?")[0].toUpperCase();
const uid = () => Math.random().toString(36).substring(2,9).toUpperCase();

function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  $(id).classList.add("active");
}

function toast(msg, isErr) {
  let wrap = $("toast-wrap");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.id = "toast-wrap"; wrap.className = "toast-container";
    document.body.appendChild(wrap);
  }
  const t = document.createElement("div");
  t.className = "toast" + (isErr ? " err" : "");
  t.textContent = msg;
  wrap.appendChild(t);
  setTimeout(() => t.remove(), 3800);
}

function beep() {
  try {
    const A = new (window.AudioContext || window.webkitAudioContext)();
    const o = A.createOscillator(), g = A.createGain();
    o.connect(g); g.connect(A.destination);
    o.frequency.setValueAtTime(880, A.currentTime);
    o.frequency.exponentialRampToValueAtTime(520, A.currentTime + 0.1);
    g.gain.setValueAtTime(0.2, A.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, A.currentTime + 0.22);
    o.start(); o.stop(A.currentTime + 0.22);
  } catch(e) {}
}

function sysMsg(text) {
  const msgs = $("messages-area");
  const d = document.createElement("div");
  d.className = "sys-msg"; d.textContent = text;
  msgs.appendChild(d);
  msgs.scrollTop = msgs.scrollHeight;
}

/* ── SELECCIÓN DE ROL ───────────────────────────────── */
document.querySelectorAll(".role-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".role-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const role = btn.dataset.role;
    $("panel-crear").style.display  = role === "crear"  ? "flex" : "none";
    $("panel-unirse").style.display = role === "unirse" ? "flex" : "none";
  });
});

/* ── CREAR SALA ─────────────────────────────────────── */
$("btn-crear").addEventListener("click", handleCrear);
$("input-name-crear").addEventListener("keydown", e => { if (e.key==="Enter") handleCrear(); });

async function handleCrear() {
  const name = $("input-name-crear").value.trim();
  if (!name) { $("input-name-crear").focus(); return; }

  myName = name;
  myId   = "usr_" + uid();
  myRole = "host";
  roomCode = Math.floor(100000 + Math.random() * 900000).toString();
  roomId   = "sala_" + roomCode;

  const btn = $("btn-crear");
  btn.textContent = "Creando...";
  btn.disabled = true;

  try {
    // 1. Registramos la sala en Firestore
    await setDoc(doc(db, "salas", roomId), {
      hostId:      myId,
      hostNombre:  myName,
      guestId:     null,
      guestNombre: null,
      estado:      "esperando",
      codigo:      roomCode,
      creadaEn:    serverTimestamp()
    });

    // 2. Guardamos credenciales locales para re-conexión si recarga por error
    localStorage.setItem("planclub_id", myId);
    localStorage.setItem("planclub_name", myName);
    localStorage.setItem("planclub_role", "host");
    localStorage.setItem("planclub_room", roomId);

    // 3. Configuración visual de la pantalla de espera
    $("espera-code").textContent = roomCode;
    $("espera-name").textContent = myName;
    showScreen("screen-espera");

    // 4. Escuchar hasta que el guest se una
    unsubRoom = onSnapshot(doc(db, "salas", roomId), snap => {
      if (!snap.exists()) return;
      const data = snap.data();
      if (data.estado === "conectado" && data.guestId) {
        if (unsubRoom) { unsubRoom(); unsubRoom = null; }
        abrirChat(data.guestNombre);
      }
    });

  } catch (err) {
    console.error("Error completo de Firebase:", err);
    toast("Error al crear sala", true);
    btn.textContent = "GENERAR CÓDIGO";
    btn.disabled = false;
  }
}






async function unirseConCodigo(name, code) {
  roomCode = code;
  roomId   = "sala_" + code;

  // Si ya existía una sesión local para esta misma sala, reutilizamos el ID viejo
  const localRoom = localStorage.getItem("planclub_room");
  const localId   = localStorage.getItem("planclub_id");
  
  if (localRoom === roomId && localId) {
    myId = localId;
  } else {
    myId = "usr_" + uid();
  }

  myName = name;
  myRole = "guest";

  // Guardamos o actualizamos en el almacenamiento local
  localStorage.setItem("planclub_id", myId);
  localStorage.setItem("planclub_name", myName);
  localStorage.setItem("planclub_role", "guest");
  localStorage.setItem("planclub_room", roomId);

  const btn = $("btn-unirse");
  btn.textContent = "Conectando...";
  btn.disabled = true;

  let salaSnap;
  try {
    salaSnap = await getDoc(doc(db, "salas", roomId));
  } catch(err) {
    toast("Error de conexión", true);
    btn.textContent = "UNIRME AL CHAT"; btn.disabled = false;
    return;
  }

  if (!salaSnap.exists()) {
    toast("Código incorrecto — sala no encontrada", true);
    digitInputs.forEach(d => { d.style.borderColor="#ff4455"; });
    setTimeout(() => digitInputs.forEach(d => { d.style.borderColor=""; }), 1500);
    btn.textContent = "UNIRME AL CHAT"; btn.disabled = false;
    return;
  }

  const sala = salaSnap.data();
  
  // MODIFICACIÓN DE SEGURIDAD: Si la sala no está esperando, pero los IDs coinciden, lo dejamos pasar (re-conexión)
  if (sala.estado !== "esperando" && sala.guestId !== myId && sala.hostId !== myId) {
    toast("Esta sala ya está en uso o fue cerrada", true);
    btn.textContent = "UNIRME AL CHAT"; btn.disabled = false;
    return;
  }

  try {
    // Actualizamos en Firebase (si ya estaba conectado no afecta en nada malo re-escribirlo)
    await updateDoc(doc(db, "salas", roomId), {
      guestId:     myId,
      guestNombre: myName,
      estado:      "conectado"
    });
  } catch(err) {
    toast("Error al unirse: " + err.message, true);
    btn.textContent = "UNIRME AL CHAT"; btn.disabled = false;
    return;
  }

  abrirChat(sala.hostNombre);
}

/* ── ABRIR CHAT ─────────────────────────────────────── */
function abrirChat(otroNombre) {
  showScreen("screen-chat");

  $("chat-peer-avatar").textContent = ini(otroNombre);
  $("chat-peer-name").textContent   = otroNombre;
  $("chat-room-code").textContent   = "# " + roomCode;
  $("chat-status-dot").className    = "status-dot online";
  $("chat-status-txt").textContent  = "conectado";
  $("input-bar").classList.remove("locked");

  sysMsg("— Conexión establecida · sala " + roomCode + " —");

  listenMensajes();

  // Detectar si el otro cierra
  unsubRoom = onSnapshot(doc(db, "salas", roomId), snap => {
    if (!snap.exists() || snap.data().estado === "cerrado") {
      sysMsg("— El otro participante salió del chat —");
      $("chat-status-dot").className  = "status-dot";
      $("chat-status-txt").textContent = "desconectado";
      $("input-bar").classList.add("locked");
    }
  });
}

/* ── MENSAJES ───────────────────────────────────────── */
function listenMensajes() {
  if (unsubMsgs) unsubMsgs();
  rendered.clear();

  const q = query(
    collection(db, "salas", roomId, "mensajes"),
    orderBy("fecha", "asc")
  );

  unsubMsgs = onSnapshot(q, snap => {
    snap.docChanges().forEach(change => {
      if (change.type !== "added") return;
      const msgDoc = change.doc;
      if (rendered.has(msgDoc.id)) return;
      rendered.add(msgDoc.id);

      const msg    = msgDoc.data();
      const isMine = msg.autorId === myId;
      const msgs   = $("messages-area");

      const row = document.createElement("div");
      row.className = "msg-row " + (isMine ? "sent" : "recv");

      const timeStr = msg.fecha?.toDate
        ? msg.fecha.toDate().toLocaleTimeString("es-CO", { hour:"2-digit", minute:"2-digit" })
        : "";

      row.innerHTML =
        `<div class="msg-sender">${isMine ? "Tú" : esc(msg.autor)}</div>` +
        `<div class="msg-bubble">${esc(msg.texto)}</div>` +
        `<div class="msg-time">${timeStr}</div>`;

      msgs.appendChild(row);
      msgs.scrollTop = msgs.scrollHeight;
      if (!isMine) beep();
    });
  });
}

async function sendMsg() {
  if (!roomId) return;
  const input = $("msg-input");
  const texto = input.value.trim();
  if (!texto) return;
  try {
    await addDoc(collection(db, "salas", roomId, "mensajes"), {
      autorId: myId,
      autor:   myName,
      texto:   texto,
      fecha:   serverTimestamp()
    });
    input.value = "";
  } catch(err) {
    toast("Error al enviar", true);
  }
}

$("send-btn").addEventListener("click", sendMsg);
$("msg-input").addEventListener("keypress", e => { if (e.key==="Enter") sendMsg(); });

/* ── SALIR ──────────────────────────────────────────── */
async function salir() {
  if (!confirm("¿Cerrar el chat?")) return;
  if (unsubMsgs) unsubMsgs();
  if (unsubRoom) unsubRoom();
  if (roomId) {
    try {
      await updateDoc(doc(db, "salas", roomId), { estado: "cerrado" });
      setTimeout(async () => {
        try { await deleteDoc(doc(db, "salas", roomId)); } catch(e) {}
      }, 5000);
    } catch(e) {}
  }
  localStorage.clear(); // <-- Limpia el almacenamiento al salir legalmente
  location.reload();
}