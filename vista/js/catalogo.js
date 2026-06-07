let carrito = {};

function agregar(nombre, precio) {
    if (!carrito[nombre]) carrito[nombre] = { precio: precio, cantidad: 0 };
    carrito[nombre].cantidad++;
    actualizarContador();
}

function actualizarContador() {
    let totalItems = 0;
    for (let item in carrito) totalItems += carrito[item].cantidad;
    document.getElementById("cart-count").innerText = totalItems;
}

function verPedido() {
    document.getElementById("catalogo-screen").style.display = "none";
    document.getElementById("main-nav").style.display = "none";
    document.getElementById("pedido").style.display = "block";
    document.getElementById("btnBack").style.display = "flex";
    renderPedido();
}

// ESTA ES LA FUNCIÓN QUE HACE QUE EL BOTÓN FUNCIONE
function regresar() {
    const pantallaPedido = document.getElementById("pedido");
    const pantallaCatalogo = document.getElementById("catalogo-screen");
    const overlay = document.getElementById("overlay");

    // 1. Si el modal (confirmación) está abierto, solo lo cerramos
    if (overlay.style.display === "flex") {
        overlay.style.display = "none";
    } 
    // 2. Si estás en la pantalla de pedido, volvemos a ver los productos
    else if (pantallaPedido.style.display === "block") {
        pantallaPedido.style.display = "none";
        pantallaCatalogo.style.display = "block";
        document.getElementById("main-nav").style.display = "block";
    } 
    // 3. SI YA ESTÁS EN EL CATÁLOGO: Aquí es donde te manda a inicio
    else {
        window.location.href = "inicio.html"; 
    }
}

function renderPedido() {
    let lista = document.getElementById("listaPedido");
    lista.innerHTML = "";
    let total = 0;
    for (let item in carrito) {
        let data = carrito[item];
        total += data.precio * data.cantidad;
        lista.innerHTML += `
        <div class="pedido-item">
            <div><strong>${item}</strong><br><span class="price">$${data.precio.toLocaleString()}</span></div>
            <div class="qty">
                <button onclick="cambiar('${item}',-1)">-</button>
                <span style="margin:0 10px">${data.cantidad}</span>
                <button onclick="cambiar('${item}',1)">+</button>
            </div>
        </div>`;
    }
    document.getElementById("total").innerText = total.toLocaleString();
}

function cambiar(nombre, valor) {
    carrito[nombre].cantidad += valor;
    if (carrito[nombre].cantidad <= 0) delete carrito[nombre];
    actualizarContador();
    renderPedido();
}

function vaciarCarrito() {
    if(confirm("¿Deseas vaciar el carrito?")) { 
        carrito = {}; 
        actualizarContador(); 
        regresar(); 
    }
}

function abrirConfirmacion() {
    if (Object.keys(carrito).length === 0) return alert("El carrito está vacío");
    document.getElementById("overlay").style.display = "flex";
    document.getElementById("modal-confirmacion").style.display = "block";
    document.getElementById("modal-gracias").style.display = "none";
}

function procesarPedido() {
    document.getElementById("modal-confirmacion").style.display = "none";
    document.getElementById("modal-gracias").style.display = "block";
    carrito = {};
    actualizarContador();
}

function reiniciarApp() {
    location.reload();
}