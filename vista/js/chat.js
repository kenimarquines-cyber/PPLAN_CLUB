// 1. Importamos las librerías oficiales de Firebase desde la CDN de Google
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// 2. Credenciales PlanClub
const firebaseConfig = {
  apiKey: "AIzaSyDX6EWo3Y4M0a4bg0zmEF6DVU-ewd6aadE",
  authDomain: "chatplanclub.firebaseapp.com",
  projectId: "chatplanclub",
  storageBucket: "chatplanclub.firebasestorage.app",
  messagingSenderId: "495297083014",
  appId: "1:495297083014:web:0e0d1b3e17e583840b0307"
};

// 3. Inicializamos Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ── CONFIGURACIÓN GLOBAL Y UTILERÍAS ──────────────────
let roomId, roomCode, myId, myName, myRole;
let isConnecting = false; // Evita peticiones duplicadas que congelan la app
const $ = (id) => document.getElementById(id);

const digitInputs = document.querySelectorAll(".code-digit");

/* ── FUNCIONES DE INTERFAZ COMPARTIDAS ───────────────── */

function mostrarCodigoCreado(code) {
  $("screen-access").classList.remove("active");
  $("screen-espera").classList.add("active");
  $("screen-espera").style.display = "flex"; 
  $("espera-code").textContent = code;
}

/* ── CREAR SALA (HOST) ───────────────────────────────── */

async function crearSalaConCodigo(name) {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  roomId = "sala_" + code;
  roomCode = code;

  myId = "usr_" + crypto.randomUUID().split("-")[0];
  myName = name;
  myRole = "host";

  localStorage.setItem("planclub_id", myId);
  localStorage.setItem("planclub_name", myName);
  localStorage.setItem("planclub_role", "host");
  localStorage.setItem("planclub_room", roomId);

  const btn = $("btn-crear");
  btn.innerHTML = "<span>Creando sala...</span>";
  btn.disabled = true;

  try {
    await setDoc(doc(db, "salas", roomId), {
      hostId: myId,
      hostNombre: myName,
      guestId: "",
      guestNombre: "",
      estado: "esperando", 
      fechaCreacion: new Date()
    });

    if (typeof toast === "function") toast("¡Sala creada con éxito!");
    mostrarCodigoCreado(code); 

    // OYENTE EN TIEMPO REAL: Detectar conexión del invitado
    const unsubscribe = onSnapshot(doc(db, "salas", roomId), (snapshot) => {
      if (snapshot.exists()) {
        const datosSala = snapshot.data();
        if (datosSala.estado === "conectado" && datosSala.guestId) {
          unsubscribe(); // Apagar oyente para no duplicar eventos
          abrirChat(datosSala.guestNombre); 
        }
      }
    });

  } catch(err) {
    console.error("ERROR DETECTADO:", err);
    alert("Error al crear la sala: " + err.message);
    btn.innerHTML = "<span>GENERAR CÓDIGO</span>"; 
    btn.disabled = false;
  }
}

function handleCrear() {
  const name = $("input-name-crear").value.trim();
  if (!name) { 
    $("input-name-crear").focus(); 
    if (typeof toast === "function") toast("Escribe tu nombre primero"); 
    return; 
  }
  crearSalaConCodigo(name);
}

/* ── UNIRSE A SALA (INVITADO / VENDEDOR) ──────────────── */

async function unirseConCodigo(name, code) {
  if (isConnecting) return; // Si ya está intentando conectar, frena los clics extras
  isConnecting = true;

  roomCode = code;
  roomId   = "sala_" + code;

  myId = "usr_" + crypto.randomUUID().split("-")[0];
  myName = name;
  myRole = "guest";

  localStorage.setItem("planclub_id", myId);
  localStorage.setItem("planclub_name", myName);
  localStorage.setItem("planclub_role", "guest");
  localStorage.setItem("planclub_room", roomId);

  const btn = $("btn-unirse");
  if (btn) {
    btn.textContent = "Conectando...";
    btn.disabled = true;
  }

  try {
    const salaSnap = await getDoc(doc(db, "salas", roomId));
    
    if (!salaSnap.exists()) {
      ejecutarToast("Código incorrecto — sala no encontrada", true);
      digitInputs.forEach(d => { d.style.borderColor="#ff4455"; });
      setTimeout(() => digitInputs.forEach(d => { d.style.borderColor=""; }), 1500);
      resetearBotonUnirse();
      return;
    }

    const sala = salaSnap.data();
    if (sala.estado !== "esperando") {
      ejecutarToast("Esta sala ya está en uso", true);
      resetearBotonUnirse();
      return;
    }

    // Actualizar Firebase para avisar al Host que entramos
    await updateDoc(doc(db, "salas", roomId), {
      guestId:     myId,
      guestNombre: myName,
      estado:      "conectado"
    });

    const nombreAnfitrion = sala.hostNombre || "Anfitrión";
    abrirChat(nombreAnfitrion);

  } catch(err) {
    console.error("Error al unirse:", err);
    ejecutarToast("Error de conexión", true);
    resetearBotonUnirse();
  }
}

function resetearBotonUnirse() {
  isConnecting = false;
  const btn = $("btn-unirse");
  if (btn) {
    btn.textContent = "UNIRME AL CHAT";
    btn.disabled = false;
  }
}

function handleUnirse() {
  const name = $("input-name-unirse").value.trim();
  if (!name) { 
    $("input-name-unirse").focus(); 
    ejecutarToast("Escribe tu nombre primero"); 
    return; 
  }
  const code = [...digitInputs].map(d => d.value).join("");
  if (code.length < 6) { 
    digitInputs[0].focus(); 
    ejecutarToast("Ingresa el código completo"); 
    return; 
  }
  unirseConCodigo(name, code);
}

/* ── CAMBIO DE PANTALLA AL CHAT ACTIVO ──────────────── */

function abrirChat(nombreCompañero) {
  try {
    // 1. Ocultar de forma limpia las pantallas de acceso y espera
    if ($("screen-access")) {
      $("screen-access").classList.remove("active");
      $("screen-access").style.display = "none";
    }
    if ($("screen-espera")) {
      $("screen-espera").classList.remove("active");
      $("screen-espera").style.display = "none";
    }
    
    // 2. Activar la pantalla del chat
    const screenChat = $("screen-chat");
    if (screenChat) {
      screenChat.classList.add("active");
      screenChat.style.display = "flex"; 
    }

    // 3. Modificar textos de cabecera
    if ($("chat-peer-name")) $("chat-peer-name").textContent = nombreCompañero;
    if ($("chat-peer-avatar")) $("chat-peer-avatar").textContent = nombreCompañero.charAt(0).toUpperCase();
    if ($("chat-room-code")) $("chat-room-code").textContent = "# " + roomCode;

    // 4. Poner el círculo de estado en Verde Online
    const dot = $("chat-status-dot");
    if (dot) {
      dot.style.background = "#00ff66"; 
    }
    const txt = $("chat-status-txt");
    if (txt) txt.textContent = "en línea";

    // 5. Desbloquear entrada de mensaje
    const inputBar = $("input-bar");
    if (inputBar) inputBar.classList.remove("locked");

    ejecutarToast("¡Chat conectado!");
    escucharMensajes(); 

  } catch (error) {
    console.error("Error crítico dentro de abrirChat():", error);
  }
}

function ejecutarToast(mensaje, esError = false) {
  if (typeof toast === "function") {
    toast(mensaje);
  } else {
    console.log(`[Toast] ${mensaje}`);
  }
}

function escucharMensajes() {
  console.log("Chat listo y escuchando en la sala: " + roomId);
}

/* ── EVENTOS (LISTENERS) ────────────────────────────── */

$("btn-crear").addEventListener("click", handleCrear);
$("btn-unirse").addEventListener("click", handleUnirse);

digitInputs.forEach((inp, idx) => {
  inp.addEventListener("keyup", (e) => {
    if (e.key === "Backspace" || e.key === "ArrowLeft" || e.key === "ArrowRight") return;
    if (inp.value.length >= 1 && idx < digitInputs.length - 1) {
      digitInputs[idx + 1].focus();
    }
  });

  inp.addEventListener("input", () => {
    inp.value = inp.value.replace(/\D/g, "").slice(-1);
    inp.classList.toggle("filled", !!inp.value);
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
    const text = (e.clipboardData || window.clipboardData).getData("text").replace(/\D/g, "").slice(0, 6);
    [...text].forEach((ch, i) => { 
      if (digitInputs[i]) { 
        digitInputs[i].value = ch; 
        digitInputs[i].classList.add("filled"); 
      } 
    });
  });
});

$("tab-crear").addEventListener("click", () => {
  $("tab-crear").classList.add("active");
  $("tab-unirse").classList.remove("active");
  $("panel-crear").style.display = "flex";
  $("panel-unirse").style.display = "none";
});

$("tab-unirse").addEventListener("click", () => {
  $("tab-unirse").classList.add("active");
  $("tab-crear").classList.remove("active");
  $("panel-unirse").style.display = "flex";
  $("panel-crear").style.display = "none";
});