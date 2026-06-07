/* ── UNIRSE A SALA ──────────────────────────────────── */
$("btn-unirse").addEventListener("click", handleUnirse);

// Inputs de dígitos (Se declaran antes de usarse para evitar fallos de lectura)
const digitInputs = document.querySelectorAll(".code-digit");

digitInputs.forEach((inp, idx) => {
  inp.addEventListener("input", () => {
    inp.value = inp.value.replace(/\D/g,"").slice(-1);
    
    // Pasar al siguiente input si se llenó este
    if (inp.value && idx < digitInputs.length - 1) {
      digitInputs[idx+1].focus();
    }
    
    inp.classList.toggle("filled", !!inp.value);
    
    // COMPROBACIÓN AUTOMÁTICA AL TERMINAR DE ESCRIBIR
    const code = [...digitInputs].map(d => d.value).join("");
    if (code.length === 6) {
      const name = $("input-name-unirse").value.trim();
      if (name) {
        unirseConCodigo(name, code); // Enlace automático instantáneo
      } else {
        $("input-name-unirse").focus();
        toast("Escribe tu nombre primero");
      }
    }
  });

  inp.addEventListener("keydown", e => {
    if (e.key === "Backspace" && !inp.value && idx > 0) {
      digitInputs[idx-1].focus();
      digitInputs[idx-1].value = "";
      digitInputs[idx-1].classList.remove("filled");
    }
  });

  inp.addEventListener("paste", e => {
    e.preventDefault();
    const text = (e.clipboardData||window.clipboardData).getData("text").replace(/\D/g,"").slice(0,6);
    [...text].forEach((ch,i) => { 
      if(digitInputs[i]) { 
        digitInputs[i].value = ch; 
        digitInputs[i].classList.add("filled"); 
      } 
    });
    
    if (text.length === 6) {
      const name = $("input-name-unirse").value.trim();
      if (name) {
        unirseConCodigo(name, text); // Enlace automático por pegado
      } else {
        $("input-name-unirse").focus();
        toast("Escribe tu nombre primero");
      }
    }
  });
});

function handleUnirse() {
  const name = $("input-name-unirse").value.trim();
  if (!name) { $("input-name-unirse").focus(); toast("Escribe tu nombre primero"); return; }
  const code = [...digitInputs].map(d => d.value).join("");
  if (code.length < 6) { digitInputs[0].focus(); toast("Ingresa el código completo"); return; }
  unirseConCodigo(name, code);
}

async function unirseConCodigo(name, code) {
  roomCode = code;
  roomId   = "sala_" + code;

  // Comprobamos si el usuario ya pertenecía a esta sala (Reconexión)
  const localRoom = localStorage.getItem("planclub_room");
  const localId   = localStorage.getItem("planclub_id");
  
  if (localRoom === roomId && localId) {
    myId = localId;
  } else {
    myId = "usr_" + uid();
  }

  myName = name;
  myRole = "guest";

  // Guardamos credenciales en el navegador
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
    console.error("Error de conexión a Firestore:", err);
    toast("Error de conexión", true);
    btn.textContent = "UNIRME AL CHAT"; 
    btn.disabled = false;
    return;
  }

  if (!salaSnap.exists()) {
    toast("Código incorrecto — sala no encontrada", true);
    digitInputs.forEach(d => { d.style.borderColor="#ff4455"; });
    setTimeout(() => digitInputs.forEach(d => { d.style.borderColor=""; }), 1500);
    btn.textContent = "UNIRME AL CHAT"; 
    btn.disabled = false;
    return;
  }

  const sala = salaSnap.data();
  
  // Si la sala ya no está esperando, pero tú eres el mismo Guest/Host que se desconectó, te deja pasar
  if (sala.estado !== "esperando" && sala.guestId !== myId && sala.hostId !== myId) {
    toast("Esta sala ya está en uso por otros usuarios", true);
    btn.textContent = "UNIRME AL CHAT"; 
    btn.disabled = false;
    return;
  }

  try {
    // Registramos el ingreso en la base de datos
    await updateDoc(doc(db, "salas", roomId), {
      guestId:     myId,
      guestNombre: myName,
      estado:      "conectado"
    });
  } catch(err) {
    console.error("Error al actualizar sala:", err);
    toast("Error al unirse a la sala", true);
    btn.textContent = "UNIRME AL CHAT"; 
    btn.disabled = false;
    return;
  }

  abrirChat(sala.hostNombre);
}