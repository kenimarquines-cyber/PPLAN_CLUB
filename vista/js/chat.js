/*
  ╔══════════════════════════════════════════════════════╗
  ║              PLANCLUB VIP — chat.js                  ║
  ║       Chat en tiempo real con Firebase Firestore     ║
  ╚══════════════════════════════════════════════════════╝

  IMPORTANTE: Este archivo usa Firebase Modular (v12).
  El HTML ya importa Firebase y expone los helpers globalmente.
  Este script se carga DESPUÉS del bloque <script type="module">
  del HTML, que hace window.PCHAT = { db, helpers... }
*/

// ═══════════════════════════════════════════════════════
//   ESPERAR A QUE FIREBASE ESTÉ LISTO
// ═══════════════════════════════════════════════════════
// El módulo Firebase en el HTML expone window.PCHAT cuando
// termina de inicializar. Esperamos ese evento.
document.addEventListener("DOMContentLoaded", () => {
  // Si el HTML modular ya corrió, PCHAT existe; si no, esperamos el evento.
  if (window.PCHAT) {
    initApp();
  } else {
    window.addEventListener("pchat-ready", initApp, { once: true });
  }
});

function initApp() {
  const { db, setDoc, addDoc, onSnapshot, collection, doc,
          updateDoc, deleteDoc, query, orderBy } = window.PCHAT;

  // ═══════════════════════════════════════════════════════
  //   CONSTANTES
  // ═══════════════════════════════════════════════════════
  const VENDOR_CODE = "PLANCLUB2026";
  const MAX_CHATS   = 5;

  // ═══════════════════════════════════════════════════════
  //   ESTADO GLOBAL
  // ═══════════════════════════════════════════════════════
  let myName          = "";
  let myRole          = "cliente";  // 'cliente' | 'vendedor'
  let myId            = "";
  let activeRoomId    = null;
  let unsubMessages   = null;  // limpiador oyente de mensajes
  let unsubRoom       = null;  // limpiador oyente de sala (cliente)
  let unsubRooms      = null;  // limpiador oyente de salas (vendedor)

  // ═══════════════════════════════════════════════════════
  //   UTILIDADES
  // ═══════════════════════════════════════════════════════
  function uid() {
    return Math.random().toString(36).substring(2, 9).toUpperCase();
  }

  function initial(name) { return (name || "?")[0].toUpperCase(); }

  function esc(str) {
    const d = document.createElement("div");
    d.textContent = str || "";
    return d.innerHTML;
  }

  function showScreen(id) {
    document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
    document.getElementById(id).classList.add("active");
  }

  function toast(msg, purple) {
    let wrap = document.getElementById("toast-wrap");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = "toast-wrap";
      wrap.className = "toast-container";
      document.body.appendChild(wrap);
    }
    const t = document.createElement("div");
    t.className = "toast" + (purple ? " purple" : "");
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
    } catch (e) {}
  }

  function sysMsg(container, text) {
    const d = document.createElement("div");
    d.className = "sys-msg";
    d.textContent = text;
    container.appendChild(d);
    container.scrollTop = container.scrollHeight;
  }

  // ═══════════════════════════════════════════════════════
  //   PANTALLA DE ACCESO — SELECCIÓN DE ROL
  // ═══════════════════════════════════════════════════════
  const btnRoleCliente  = document.getElementById("btn-role-cliente");
  const btnRoleVendedor = document.getElementById("btn-role-vendedor");
  const vendorCodeGroup = document.getElementById("vendor-code-group");

  // Compatibilidad con ambos estilos de botón (data-role o id)
  function setRole(role) {
    myRole = role;
    document.querySelectorAll(".role-btn").forEach(b => b.classList.remove("active"));
    const activeBtn = role === "cliente" ? btnRoleCliente : btnRoleVendedor;
    if (activeBtn) activeBtn.classList.add("active");
    vendorCodeGroup.style.display = role === "vendedor" ? "block" : "none";
  }

  if (btnRoleCliente)  btnRoleCliente.addEventListener("click",  () => setRole("cliente"));
  if (btnRoleVendedor) btnRoleVendedor.addEventListener("click", () => setRole("vendedor"));

  // Soporte para botones con data-role (versión antigua del HTML)
  document.querySelectorAll(".role-btn[data-role]").forEach(btn => {
    btn.addEventListener("click", () => setRole(btn.dataset.role));
  });

  const btnEnter    = document.getElementById("btn-enter");
  const inputName   = document.getElementById("input-name");
  const inputCode   = document.getElementById("input-vendor-code");

  btnEnter.addEventListener("click", handleEnter);
  inputName.addEventListener("keydown", e => { if (e.key === "Enter") handleEnter(); });

  function handleEnter() {
    const name = inputName.value.trim();
    if (!name) { inputName.focus(); return; }

    if (myRole === "vendedor") {
      const code = inputCode ? inputCode.value.trim() : "";
      if (code !== VENDOR_CODE) {
        inputCode.style.borderColor = "#ff4466";
        setTimeout(() => { inputCode.style.borderColor = ""; }, 1800);
        toast("Código incorrecto", true);
        return;
      }
    }

    myName = name;
    myId   = "usr_" + uid();

    myRole === "cliente" ? startClient() : startVendor();
  }

  // ═══════════════════════════════════════════════════════
  //   CLIENTE
  // ═══════════════════════════════════════════════════════
  async function startClient() {
    showScreen("screen-cliente");
    setClientStatus("waiting", "BUSCANDO VENDEDOR...");

    // ID de sala basado en el ID único del cliente
    activeRoomId = "room_" + myId;

    // Mostrar código de sala al cliente
    const codeEl = document.getElementById("client-room-code");
    if (codeEl) codeEl.textContent = myId;

    // Crear la sala en Firestore
    try {
      await setDoc(doc(db, "salas", activeRoomId), {
        clienteId:      myId,
        clienteNombre:  myName,
        vendedorId:     null,
        vendedorNombre: null,
        estado:         "esperando",
        fecha:          new Date()
      });
    } catch (err) {
      toast("Error al conectar con el servidor");
      console.error(err);
      return;
    }

    // Escuchar cambios en la sala para saber cuándo el vendedor se une
    unsubRoom = onSnapshot(doc(db, "salas", activeRoomId), snap => {
      if (!snap.exists()) return;
      const data = snap.data();

      if (data.estado === "atendido" && data.vendedorId) {
        // Vendedor conectado ✓
        setClientStatus("online", `Agente: ${data.vendedorNombre || "Vendedor"}`);
        openClientChat();
      }

      if (data.estado === "terminado") {
        sysMsg(document.getElementById("client-messages"), "— El vendedor ha cerrado este chat —");
        setClientStatus("", "CHAT FINALIZADO");
        lockInput("client-input-bar");
      }
    });
  }

  function openClientChat() {
    document.getElementById("client-waiting").style.display = "none";
    const msgs = document.getElementById("client-messages");
    msgs.style.display = "flex";
    const bar = document.getElementById("client-input-bar");
    bar.style.opacity = "1";
    bar.style.pointerEvents = "auto";
    sysMsg(msgs, "— Canal VIP establecido —");
    listenMessages(msgs);
  }

  function setClientStatus(dotClass, txt) {
    const dot = document.getElementById("client-status-dot");
    if (dot) dot.className = "header-status-dot" + (dotClass ? " " + dotClass : "");
    const txtEl = document.getElementById("client-status-txt");
    if (txtEl) txtEl.textContent = txt;
  }

  function lockInput(barId) {
    const bar = document.getElementById(barId);
    if (bar) { bar.style.opacity = "0.4"; bar.style.pointerEvents = "none"; }
  }

  // Enviar mensaje (cliente)
  const clientSendBtn = document.getElementById("client-send-btn");
  const clientMsgInput = document.getElementById("client-msg-input");
  clientSendBtn.addEventListener("click", sendMessage);
  clientMsgInput.addEventListener("keypress", e => { if (e.key === "Enter") sendMessage(); });

  // ═══════════════════════════════════════════════════════
  //   VENDEDOR
  // ═══════════════════════════════════════════════════════
  function startVendor() {
    showScreen("screen-vendedor");
    const displayId = document.getElementById("vendor-display-id");
    if (displayId) displayId.textContent = myName.toUpperCase();

    listenRooms();

    const vendorSendBtn  = document.getElementById("vendor-send-btn");
    const vendorMsgInput = document.getElementById("vendor-msg-input");
    vendorSendBtn.addEventListener("click", sendMessage);
    vendorMsgInput.addEventListener("keypress", e => { if (e.key === "Enter") sendMessage(); });

    document.getElementById("btn-terminate-chat").addEventListener("click", terminateChat);
  }

  function listenRooms() {
    // Escuchar TODAS las salas: esperando O atendidas por este vendedor
    unsubRooms = onSnapshot(collection(db, "salas"), snap => {
      const list = document.getElementById("vendor-chat-list");
      list.innerHTML = "";

      let countActive = 0;
      let hayItems = false;
      const knownIds = new Set();

      snap.forEach(docSnap => {
        const sala  = docSnap.data();
        const salaId = docSnap.id;

        // Solo mostrar: salas en espera O salas que este vendedor atiende
        const esDeEsteVendedor = sala.vendedorId === myId;
        const estaEnEspera     = sala.estado === "esperando";
        const estaActiva       = sala.estado === "atendido" && esDeEsteVendedor;

        if (!estaEnEspera && !estaActiva) return;

        hayItems = true;
        if (esDeEsteVendedor) countActive++;
        knownIds.add(salaId);

        const item = document.createElement("div");
        item.className = `chat-item${salaId === activeRoomId ? " active" : ""}${estaEnEspera ? " waiting-item" : ""}`;
        item.innerHTML =
          `<div class="chat-avatar">${initial(sala.clienteNombre)}</div>` +
          `<div class="chat-item-info">` +
            `<div class="chat-item-name">${esc(sala.clienteNombre)}</div>` +
            `<div class="chat-item-last">${estaEnEspera ? "◆ En espera" : "● Atendiendo"}</div>` +
          `</div>`;

        item.addEventListener("click", async () => {
          // Si está en espera, el vendedor la toma
          if (estaEnEspera) {
            await updateDoc(doc(db, "salas", salaId), {
              vendedorId:     myId,
              vendedorNombre: myName,
              estado:         "atendido"
            });
          }
          selectRoom(salaId, sala.clienteNombre);

          // Marcar item activo visualmente
          document.querySelectorAll(".chat-item").forEach(i => i.classList.remove("active"));
          item.classList.add("active");
        });

        list.appendChild(item);
      });

      if (!hayItems) {
        list.innerHTML = '<div class="no-chats-msg">Sin clientes activos</div>';
      }

      // Si el chat activo ya no existe en Firestore, cerrar panel
      if (activeRoomId && !knownIds.has(activeRoomId)) {
        activeRoomId = null;
        document.getElementById("vendor-active-chat").style.display = "none";
        document.getElementById("vendor-placeholder").style.display = "flex";
        if (unsubMessages) { unsubMessages(); unsubMessages = null; }
      }

      // Actualizar stats
      const statActive    = document.getElementById("stat-active");
      const statAvailable = document.getElementById("stat-available");
      if (statActive)    statActive.textContent    = countActive;
      if (statAvailable) statAvailable.textContent = Math.max(0, MAX_CHATS - countActive);
    });
  }

  function selectRoom(salaId, clienteNombre) {
    activeRoomId = salaId;

    document.getElementById("vendor-placeholder").style.display  = "none";
    document.getElementById("vendor-active-chat").style.display  = "flex";

    const vchatName   = document.getElementById("vchat-name");
    const vchatAvatar = document.getElementById("vchat-avatar");
    if (vchatName)   vchatName.textContent   = clienteNombre;
    if (vchatAvatar) vchatAvatar.textContent = initial(clienteNombre);

    const container = document.getElementById("vendor-messages");
    container.innerHTML = "";
    sysMsg(container, `— Chat con ${clienteNombre} —`);

    listenMessages(container);
    document.getElementById("vendor-msg-input").focus();
  }

  async function terminateChat() {
    if (!activeRoomId) return;
    if (!confirm("¿Terminar este chat?")) return;

    // Marcar como terminado (no borrar: el cliente ve el mensaje de cierre)
    await updateDoc(doc(db, "salas", activeRoomId), { estado: "terminado" });

    activeRoomId = null;
    document.getElementById("vendor-active-chat").style.display = "none";
    document.getElementById("vendor-placeholder").style.display = "flex";
    if (unsubMessages) { unsubMessages(); unsubMessages = null; }
    toast("Chat cerrado con éxito");
  }

  // ═══════════════════════════════════════════════════════
  //   MENSAJERÍA COMPARTIDA (tiempo real)
  // ═══════════════════════════════════════════════════════
  function listenMessages(container) {
    if (unsubMessages) unsubMessages();  // limpiar oyente anterior

    const q = query(
      collection(db, "salas", activeRoomId, "mensajes"),
      orderBy("fecha", "asc")
    );

    // Mapa de IDs ya renderizados para no duplicar
    const rendered = new Set();

    unsubMessages = onSnapshot(q, snap => {
      snap.docChanges().forEach(change => {
        if (change.type !== "added") return;

        const msgDoc = change.doc;
        if (rendered.has(msgDoc.id)) return;
        rendered.add(msgDoc.id);

        const msg  = msgDoc.data();
        const isMine = msg.remitenteId === myId;

        const row = document.createElement("div");
        row.className = "msg-row " + (isMine ? "sent" : "recv");

        const senderLabel = isMine ? "Tú" : esc(msg.remitenteNombre || "");
        const timeStr = msg.fecha?.toDate
          ? msg.fecha.toDate().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })
          : "";

        row.innerHTML =
          `<div class="msg-sender">${senderLabel}</div>` +
          `<div class="msg-bubble">${esc(msg.texto)}</div>` +
          `<div class="msg-time">${timeStr}</div>`;

        container.appendChild(row);
        container.scrollTop = container.scrollHeight;

        // Beep solo para mensajes recibidos nuevos
        if (!isMine) beep();
      });
    });
  }

  async function sendMessage() {
    if (!activeRoomId) return;
    const input = myRole === "cliente"
      ? document.getElementById("client-msg-input")
      : document.getElementById("vendor-msg-input");

    const texto = input.value.trim();
    if (!texto) return;

    try {
      await addDoc(collection(db, "salas", activeRoomId, "mensajes"), {
        remitenteId:     myId,
        remitenteNombre: myName,
        texto:           texto,
        fecha:           new Date()
      });
      input.value = "";
    } catch (err) {
      toast("Error al enviar el mensaje");
      console.error(err);
    }
  }

  // ═══════════════════════════════════════════════════════
  //   SALIR
  // ═══════════════════════════════════════════════════════
  async function exitSystem() {
    if (!confirm("¿Salir del chat?")) return;

    if (unsubMessages) unsubMessages();
    if (unsubRoom)     unsubRoom();
    if (unsubRooms)    unsubRooms();

    // El cliente elimina su sala al salir
    if (myRole === "cliente" && activeRoomId) {
      try { await deleteDoc(doc(db, "salas", activeRoomId)); } catch (e) {}
    }

    location.reload();
  }

  document.getElementById("btn-client-exit").addEventListener("click", exitSystem);
  document.getElementById("btn-vendor-exit").addEventListener("click", exitSystem);

} // fin initApp
