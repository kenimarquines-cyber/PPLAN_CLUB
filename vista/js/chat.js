/*
  ╔══════════════════════════════════════════════════════╗
  ║              PLANCLUB VIP — chat.js                  ║
  ║   Chat p2p por código de sala — Firebase Firestore   ║
  ╚══════════════════════════════════════════════════════╝
  Exponer desde el HTML: window.PCHAT = { db, ...helpers }
  y disparar "pchat-ready" cuando Firebase esté listo.
*/

window.addEventListener("pchat-ready", init, { once: true });
if (window.PCHAT) init(); // por si ya cargó antes

function init() {
  const {
    db, setDoc, getDoc, updateDoc, deleteDoc, addDoc,
    onSnapshot, collection, doc, query, orderBy, serverTimestamp
  } = window.PCHAT;

  /* ── ESTADO ─────────────────────────────────────────── */
  let myName       = "";
  let myId         = "";
  let myRole       = "crear"; // 'crear' | 'unirse'
  let roomCode     = "";      // código de 6 dígitos
  let roomId       = "";      // "sala_XXXXXX"
  let unsubRoom    = null;
  let unsubMsgs    = null;
  const rendered   = new Set();

  /* ── UTILIDADES ─────────────────────────────────────── */
  const $   = id  => document.getElementById(id);
  const esc = s   => { const d = document.createElement("div"); d.textContent = s||""; return d.innerHTML; };
  const ini = n   => (n||"?")[0].toUpperCase();

  function genCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  function showScreen(id) {
    document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
    $(id).classList.add("active");
  }

  function toast(msg, isErr) {
    let wrap = $("toast-wrap");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = "toast-wrap";
      wrap.className = "toast-container";
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
    d.className = "sys-msg";
    d.textContent = text;
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
  }

  /* ── PANTALLA ACCESO ─────────────────────────────────── */
  // Selección de rol (crear / unirse)
  document.querySelectorAll(".role-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      myRole = btn.dataset.role;
      document.querySelectorAll(".role-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      $("panel-crear").style.display  = myRole === "crear"  ? "flex" : "none";
      $("panel-unirse").style.display = myRole === "unirse" ? "flex" : "none";
    });
  });

  $("btn-crear").addEventListener("click", handleCrear);
  $("btn-unirse").addEventListener("click", handleUnirse);
  $("input-name-crear").addEventListener("keydown", e => { if (e.key === "Enter") handleCrear(); });

  // Inputs de dígitos para unirse
  const digitInputs = document.querySelectorAll(".code-digit");
  digitInputs.forEach((inp, idx) => {
    inp.addEventListener("input", e => {
      // Solo números
      inp.value = inp.value.replace(/\D/g, "").slice(-1);
      if (inp.value && idx < digitInputs.length - 1) {
        digitInputs[idx + 1].focus();
      }
      inp.classList.toggle("filled", !!inp.value);
      // Si todos los dígitos están llenos, auto-unirse
      const code = [...digitInputs].map(d => d.value).join("");
      if (code.length === 6) autoUnirse(code);
    });
    inp.addEventListener("keydown", e => {
      if (e.key === "Backspace" && !inp.value && idx > 0) {
        digitInputs[idx - 1].focus();
        digitInputs[idx - 1].value = "";
        digitInputs[idx - 1].classList.remove("filled");
      }
    });
    inp.addEventListener("paste", e => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData("text").replace(/\D/g,"").slice(0,6);
      [...text].forEach((ch, i) => {
        if (digitInputs[i]) {
          digitInputs[i].value = ch;
          digitInputs[i].classList.add("filled");
        }
      });
      if (text.length === 6) autoUnirse(text);
    });
  });

  function autoUnirse(code) {
    const name = $("input-name-unirse").value.trim();
    if (!name) {
      $("input-name-unirse").focus();
      toast("Primero escribe tu nombre");
      return;
    }
    unirseConCodigo(name, code);
  }

  /* ── CREAR SALA ──────────────────────────────────────── */
  async function handleCrear() {
    const name = $("input-name-crear").value.trim();
    if (!name) { $("input-name-crear").focus(); return; }

    myName = name;
    myId   = "usr_" + Math.random().toString(36).substring(2, 9).toUpperCase();
    myRole = "host";

    roomCode = genCode();
    roomId   = "sala_" + roomCode;

    $("btn-crear").textContent = "Creando...";
    $("btn-crear").disabled = true;

    try {
      await setDoc(doc(db, "salas", roomId), {
        hostId:      myId,
        hostNombre:  myName,
        guestId:     null,
        guestNombre: null,
        estado:      "esperando",
        codigo:      roomCode,
        creadaEn:    serverTimestamp()
      });
    } catch(err) {
      toast("Error al crear sala: " + err.message, true);
      console.error(err);
      $("btn-crear").textContent = "CREAR SALA";
      $("btn-crear").disabled = false;
      return;
    }

    // Mostrar pantalla de espera con el código
    showScreen("screen-espera");
    $("espera-code").textContent = roomCode;
    $("espera-name").textContent = myName;

    // Escuchar si el otro se une
    unsubRoom = onSnapshot(doc(db, "salas", roomId), snap => {
      if (!snap.exists()) return;
      const data = snap.data();
      if (data.estado === "conectado" && data.guestId) {
        // El otro entró — abrir chat
        unsubRoom();
        abrirChat(data.guestNombre, data.codigo);
      }
    });
  }

  /* ── UNIRSE A SALA ───────────────────────────────────── */
  function handleUnirse() {
    const name = $("input-name-unirse").value.trim();
    if (!name) { $("input-name-unirse").focus(); return; }
    const code = [...digitInputs].map(d => d.value).join("");
    if (code.length < 6) { digitInputs[0].focus(); toast("Ingresa el código de 6 dígitos"); return; }
    unirseConCodigo(name, code);
  }

  async function unirseConCodigo(name, code) {
    myName = name;
    myId   = "usr_" + Math.random().toString(36).substring(2, 9).toUpperCase();
    myRole = "guest";
    roomCode = code;
    roomId   = "sala_" + code;

    // Verificar que la sala existe y está esperando
    let salaSnap;
    try {
      salaSnap = await getDoc(doc(db, "salas", roomId));
    } catch(err) {
      toast("Error de conexión", true);
      console.error(err);
      return;
    }

    if (!salaSnap.exists()) {
      toast("Código incorrecto o sala expirada", true);
      // Sacudir los inputs
      digitInputs.forEach(d => { d.style.borderColor="#ff4455"; });
      setTimeout(() => digitInputs.forEach(d => { d.style.borderColor=""; }), 1500);
      return;
    }

    const sala = salaSnap.data();
    if (sala.estado !== "esperando") {
      toast("Esta sala ya está en uso o cerrada", true);
      return;
    }

    // Unirse a la sala
    try {
      await updateDoc(doc(db, "salas", roomId), {
        guestId:     myId,
        guestNombre: myName,
        estado:      "conectado"
      });
    } catch(err) {
      toast("Error al unirse: " + err.message, true);
      console.error(err);
      return;
    }

    // Abrir chat directamente
    abrirChat(sala.hostNombre, code);
  }

  /* ── ABRIR CHAT ──────────────────────────────────────── */
  function abrirChat(otroNombre, code) {
    showScreen("screen-chat");

    // Header
    $("chat-peer-avatar").textContent = ini(otroNombre);
    $("chat-peer-name").textContent   = otroNombre;
    $("chat-room-code").textContent   = "# " + code;
    $("chat-status-dot").className    = "status-dot online";
    $("chat-status-txt").textContent  = "conectado";

    sysMsg("— Conexión establecida · código " + code + " —");

    // Escuchar mensajes en tiempo real
    listenMensajes();

    // Escuchar si el otro se va
    unsubRoom = onSnapshot(doc(db, "salas", roomId), snap => {
      if (!snap.exists() || snap.data().estado === "cerrado") {
        sysMsg("— El otro participante ha cerrado el chat —");
        $("chat-status-dot").className  = "status-dot";
        $("chat-status-txt").textContent = "desconectado";
        $("input-bar").classList.add("locked");
      }
    });
  }

  /* ── MENSAJES EN TIEMPO REAL ─────────────────────────── */
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
          ? msg.fecha.toDate().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })
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

  /* ── ENVIAR MENSAJE ──────────────────────────────────── */
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
      console.error(err);
    }
  }

  $("send-btn").addEventListener("click", sendMsg);
  $("msg-input").addEventListener("keypress", e => { if (e.key === "Enter") sendMsg(); });

  /* ── SALIR ───────────────────────────────────────────── */
  async function salir() {
    if (!confirm("¿Cerrar el chat?")) return;
    if (unsubMsgs)  unsubMsgs();
    if (unsubRoom)  unsubRoom();
    if (roomId) {
      try {
        await updateDoc(doc(db, "salas", roomId), { estado: "cerrado" });
        // Limpiar mensajes y sala después de 5 segundos
        setTimeout(async () => {
          try { await deleteDoc(doc(db, "salas", roomId)); } catch(e) {}
        }, 5000);
      } catch(e) {}
    }
    location.reload();
  }

  $("btn-exit-espera").addEventListener("click", async () => {
    if (unsubRoom) unsubRoom();
    if (roomId) {
      try { await deleteDoc(doc(db, "salas", roomId)); } catch(e) {}
    }
    location.reload();
  });

  $("btn-exit-chat").addEventListener("click", salir);
}
