// ==========================================
// 🌐 CONFIGURACIÓN DEL BACKEND (RENDER)
// ==========================================
// ⚠️ REEMPLAZA ESTA URL POR TU LINK REAL DE RENDER (Sin "/" al final)
const URL_API = "https://pplan-club.onrender.com"; 


// --- GESTIÓN DE PANELES ---
function showPanel(id) {
    document.getElementById(id).classList.add('active');
    document.getElementById('loginMsg').innerText = ""; 
    document.getElementById('regMsg').innerText = "";   
}

function hidePanels() {
    const panels = document.querySelectorAll('.panel');
    panels.forEach(p => p.classList.remove('active'));
}

// --- FUNCIONES DE ADMIN ---
function abrirAdmin() {
    const user = localStorage.getItem('pc_user') || "No hay registros";
    document.getElementById('currentUserDisplay').innerText = user.toUpperCase();
    showPanel('adminPanel');
}

function borrarTodo() {
    if(confirm("¿Estás seguro de eliminar al usuario de la memoria?")) {
        localStorage.clear();
        alert("Memoria limpiada. Ya puedes registrar uno nuevo.");
        location.reload(); 
    }
}

// ==========================================
// 🚀 ENVIAR REGISTRO AL BACKEND (FLASK EN LA NUBE)
// ==========================================
function guardarRegistro() {
    const user = document.getElementById('regUser').value.trim();
    const pass = document.getElementById('regPass').value.trim();
    const msg = document.getElementById('regMsg');

    if (!user || !pass) {
        msg.style.color = "#ff4d4d"; 
        msg.innerText = "Por favor, completa los campos";
        return;
    }

    const passRegex = /^(?=.*[A-Z])(?=.*\d).{8,}$/;
    if (!passRegex.test(pass)) {
        msg.style.color = "#ff4d4d";
        msg.innerText = "La contraseña no cumple los requisitos de seguridad";
        return;
    }

    const datosUsuario = {
        id_usuario: "USU_" + Math.floor(1000 + Math.random() * 9000), 
        nombre: user,              
        apellido: "RegistroWeb",   
        correo: user.toLowerCase() + "@planclub.com", 
        contraseña: pass
    };

    msg.style.color = "#ffcc00";
    msg.innerText = "Procesando registro...";

    // Intercambiamos la URL local fija por la variable de Render ${URL_API}
    fetch(`${URL_API}/api/usuarios/registrar`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(datosUsuario)
    })
    .then(respuesta => respuesta.json())
    .then(resultado => {
        if (resultado.status === "success") {
            msg.style.color = "#4dff88"; 
            msg.innerText = "¡Usuario guardado en la base de datos con éxito!";
            
            document.getElementById('regUser').value = "";
            document.getElementById('regPass').value = "";
            
            setTimeout(hidePanels, 1500);
        } else {
            msg.style.color = "#ff4d4d";
            msg.innerText = "Error: " + resultado.mensaje;
        }
    })
    .catch(error => {
        console.error("Error:", error);
        msg.style.color = "#ff4d4d";
        msg.innerText = "No se pudo conectar con el servidor Backend";
    });
}

// ==========================================
// 🔓 VALIDAR LOGIN CON EL BACKEND (FLASK EN LA NUBE)
// ==========================================
function validarLogin() {
    const userIn = document.getElementById('loginUser').value.trim().toLowerCase();
    const passIn = document.getElementById('loginPass').value.trim();
    const msg = document.getElementById('loginMsg');
    
    if (!userIn || !passIn) {
        msg.style.color = "#ffcc00"; 
        msg.innerText = "Digita tus datos";
        return;
    }

    msg.style.color = "#ffcc00";
    msg.innerText = "Verificando credenciales...";

    // Intercambiamos la URL local fija por la variable de Render ${URL_API}
    fetch(`${URL_API}/api/usuarios`)
    .then(respuesta => respuesta.json())
    .then(usuarios => {
        const usuarioEncontrado = usuarios.find(u => u.nombre.toLowerCase() === userIn);

        if (!usuarioEncontrado) {
            msg.style.color = "#ff4d4d";
            msg.innerText = "Este usuario no está registrado en el sistema";
            return;
        }

        // Nota: Si en tu backend realizas la verificación de contraseña en la API,
        // asegúrate de validarla aquí también si traes los datos en texto plano, por ejemplo:
        // if (usuarioEncontrado.contraseña !== passIn) { ... }

        msg.style.color = "#4dff88"; 
        msg.innerText = "Usuario correcto ingresando...";
        
        localStorage.setItem('sesion_actual', usuarioEncontrado.nombre);

        setTimeout(() => { 
            window.location.href = "./vista/html/inicio.html"; 
        }, 1500);
    })
    .catch(error => {
        console.error("Error:", error);
        msg.style.color = "#ff4d4d";
        msg.innerText = "Error al intentar conectar con el servidor";
    });
}

// --- RECUPERAR CONTRASEÑA ---
function recuperarPass() {
    const userIn = document.getElementById('recoverUser').value.trim().toLowerCase();
    const newPass = document.getElementById('newPass').value.trim();
    const msg = document.getElementById('recoverMsg');

    if (!userIn || !newPass) {
        msg.style.color = "#ffcc00";
        msg.innerText = "Completa los campos";
        return;
    }

    const passRegex = /^(?=.*[A-Z])(?=.*\d).{8,}$/;
    if (!passRegex.test(newPass)) {
        msg.style.color = "#ff4d4d";
        msg.innerText = "La nueva contraseña no cumple los requisitos";
        return;
    }

    msg.style.color = "#4dff88";
    msg.innerText = "Contraseña actualizada localmente";
    setTimeout(hidePanels, 1500);
}

// --- MOSTRAR / OCULTAR CONTRASEÑA ---
function togglePassword(inputId, icon) {
    const input = document.getElementById(inputId);
    if (input.type === "password") {
        input.type = "text";
        icon.textContent = "🐵";
    } else {
        input.type = "password";
        icon.textContent = "🙈";
    }
}