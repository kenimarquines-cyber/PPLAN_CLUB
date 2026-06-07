window.onload = function() {
    if(localStorage.getItem('user_nombre')) document.getElementById('input-nombre').value = localStorage.getItem('user_nombre');
    if(localStorage.getItem('user_apellido')) document.getElementById('input-apellido').value = localStorage.getItem('user_apellido');
    if(localStorage.getItem('user_correo')) document.getElementById('input-correo').value = localStorage.getItem('user_correo');
    if(localStorage.getItem('user_telefono')) document.getElementById('input-telefono').value = localStorage.getItem('user_telefono');
    if(localStorage.getItem('user_photo')) {
        document.getElementById('mainProfilePic').innerHTML = `<img src="${localStorage.getItem('user_photo')}" class="profile-img-preview">`;
    }
};

function openNotificationModal() {
    document.getElementById("notificationModal").style.display = "flex";
}

function closeNotificationModal() {
    document.getElementById("notificationModal").style.display = "none";
}

window.onclick = function(event) {
    let modal = document.getElementById("notificationModal");
    if (event.target == modal) {
        closeNotificationModal();
    }
}

document.addEventListener("DOMContentLoaded", function() {
    
    const botonRegresar = document.getElementById("btn-regresar");

    botonRegresar.addEventListener("click", function() {
        window.history.back();
    });
});

function saveAllData() {
    const nombre = document.getElementById('input-nombre').value;
    const apellido = document.getElementById('input-apellido').value;
    const correo = document.getElementById('input-correo').value;
    const telefono = document.getElementById('input-telefono').value;

    localStorage.setItem('user_nombre', nombre);
    localStorage.setItem('user_apellido', apellido);
    localStorage.setItem('user_correo', correo);
    localStorage.setItem('user_telefono', telefono);

    alert("¡Datos guardados con éxito!");
}

let selectedPhotoSrc = "";
function openPhotoModal() { document.getElementById("photoEditModal").classList.add("show"); }
function closePhotoModal() { document.getElementById("photoEditModal").classList.remove("show"); }
function selectPhoto(el) {
    document.querySelectorAll(".profile-option").forEach(opt => opt.classList.remove("selected"));
    el.classList.add("selected");
    selectedPhotoSrc = el.getAttribute("data-photo-src");
}
function applyPhotoChange() {
    if(selectedPhotoSrc) {
        document.getElementById("mainProfilePic").innerHTML = `<img src="${selectedPhotoSrc}" class="profile-img-preview">`;
        localStorage.setItem('user_photo', selectedPhotoSrc);
    }
    closePhotoModal();
}