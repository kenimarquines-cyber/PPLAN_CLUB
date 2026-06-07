// 1. Importamos las librerías oficiales de Firebase desde la CDN de Google
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// 2. Tus credenciales reales de PlanClub extraídas de tu consola
const firebaseConfig = {
  apiKey: "AIzaSyDX6EWo3Y4M0a4bg0zmEF6DVU-ewd6aadE",
  authDomain: "chatplanclub.firebaseapp.com",
  projectId: "chatplanclub",
  storageBucket: "chatplanclub.firebasestorage.app",
  messagingSenderId: "495297083014",
  appId: "1:495297083014:web:0e0d1b3e17e583840b0307"
};

// 3. Inicializamos Firebase y la base de datos Firestore en este archivo
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ── CONFIGURACIÓN GLOBAL Y UTILERÍAS ──────────────────
let roomId, roomCode, myId, myName, myRole;
const $ = (id) => document.getElementById(id);

// Selección de los inputs del código (se ejecuta cuando carga el script)
const digitInputs = document.querySelectorAll(".code-digit");


/* ── FUNCIONES DE INTERFAZ COMPARTIDAS ───────────────── */

function mostrarCodigoCreado(code) {
  // Ocultar pantalla de acceso y mostrar pantalla de espera
  $("screen-access").classList.remove("active");
  $("screen-espera").classList.add("active");
  $("screen-espera").style.display = "flex"; // Forzar renderizado visual
  
  // Inyectar los datos en las etiquetas del HTML
  $("espera-code").textContent = code;
  $("espera-name").textContent = myName;
}


/* ── CREAR SALA ────────────────────────────────────── */

// 1. Función para crear la sala en Firebase
async function crearSalaConCodigo(name) {
  // Generar un código aleatorio de 6 dígitos
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  roomId = "sala_" + code;
  roomCode = code;

  myId = "usr_" + crypto.randomUUID().split("-")[0]; // Generar ID de usuario único
  myName = name;
  myRole = "host";

  // Guardar datos en el almacenamiento local
  localStorage.setItem("planclub_id", myId);
  localStorage.setItem("planclub_name", myName);
  localStorage.setItem("planclub_role", "host");
  localStorage.setItem("planclub_room", roomId);

  const btn = $("btn-crear");
  btn.innerHTML = "<span>Creando sala...</span>";
  btn.disabled = true;

  try {
    // Crear el documento de la sala en Firebase
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

  } catch(err) {
    console.error("ERROR DETECTADO:", err);
    alert("Error al crear la sala: " + err.message);
    btn.innerHTML = "<span>GENERAR CÓDIGO</span>"; 
    btn.disabled = false;
  }
}


// 2. Controlador del botón Crear
function handleCrear() {
  const name = $("input-name-crear").value.trim();
  if (!name) { 
    $("input-name-crear").focus(); 
    if (typeof toast === "function") toast("Escribe tu nombre primero"); 
    return; 
  }
  crearSalaConCodigo(name);
}


/* ── UNIRSE A SALA ──────────────────────────────────── */

// 1. Función de conexión
async function unirseConCodigo(name, code) {
  roomCode = code;
  roomId   = "sala_" + code;

  // Comprobamos reconexión local
  const localRoom = localStorage.getItem("planclub_room");
  const localId   = localStorage.getItem("planclub_id");

  if (localRoom === roomId && localId) {
    myId = localId;
  } else {
    myId = "usr_" + crypto.randomUUID().split("-")[0];
  }

  myName = name;
  myRole = "guest";

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
    console.error(err);
    if (typeof toast === "function") toast("Error de conexión", true);
    btn.textContent = "UNIRME AL CHAT"; btn.disabled = false;
    return;
  }

  if (!salaSnap.exists()) {
    if (typeof toast === "function") toast("Código incorrecto — sala no encontrada", true);
    digitInputs.forEach(d => { d.style.borderColor="#ff4455"; });
    setTimeout(() => digitInputs.forEach(d => { d.style.borderColor=""; }), 1500);
    btn.textContent = "UNIRME AL CHAT"; btn.disabled = false;
    return;
  }

  const sala = salaSnap.data();
  if (sala.estado !== "esperando" && sala.guestId !== myId && sala.hostId !== myId) {
    if (typeof toast === "function") toast("Esta sala ya está en uso", true);
    btn.textContent = "UNIRME AL CHAT"; btn.disabled = false;
    return;
  }

  try {
    await updateDoc(doc(db, "salas", roomId), {
      guestId:     myId,
      guestNombre: myName,
      estado:      "conectado"
    });
  } catch(err) {
    if (typeof toast === "function") toast("Error al unirse", true);
    btn.textContent = "UNIRME AL CHAT"; btn.disabled = false;
    return;
  }

  if (typeof abrirChat === "function") abrirChat(sala.hostNombre);
}

// 2. Controlador del botón de Unirse
function handleUnirse() {
  const name = $("input-name-unirse").value.trim();
  if (!name) { $("input-name-unirse").focus(); if (typeof toast === "function") toast("Escribe tu nombre primero"); return; }
  const code = [...digitInputs].map(d => d.value).join("");
  if (code.length < 6) { digitInputs[0].focus(); if (typeof toast === "function") toast("Ingresa el código completo"); return; }
  unirseConCodigo(name, code);
}


/* ── EVENTOS DE LA INTERFAZ (LISTENERS) ──────────────── */

// Listeners de los botones principales
$("btn-crear").addEventListener("click", handleCrear);
$("btn-unirse").addEventListener("click", handleUnirse);

// Lógica avanzada de los inputs (Salto automático, borrado y pegado)
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

    const code = [...digitInputs].map(d => d.value).join("");
    if (code.length === 6) {
      const name = $("input-name-unirse").value.trim();
      if (name) {
        unirseConCodigo(name, code);
      } else {
        $("input-name-unirse").focus();
        if (typeof toast === "function") toast("Escribe tu nombre primero");
      }
    }
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
    
    if (text.length === 6) {
      const name = $("input-name-unirse").value.trim();
      if (name) unirseConCodigo(name, text);
    }
  });
});

// Lógica para alternar vistas (Crear sala / Unirse a sala)
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