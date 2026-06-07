
// --- VARIABLES GLOBALES ---
let mesasSeleccionadas = [];
let tempUser = {};
let dbReservas = JSON.parse(localStorage.getItem('planclub_db')) || [];

// --- CONFIGURACIÓN DE MESAS (Tu mapa original) ---
const configMesas = [
    {id: 1, c: 'm-r', g: 'grid-row:8;grid-column:1;'}, {id: 2, c: 'm-r', g: 'grid-row:7;grid-column:1;'},
    {id: 3, c: 'm-r', g: 'grid-row:6;grid-column:1;'}, {id: 4, c: 'm-y', g: 'grid-row:5;grid-column:1;'},
    {id: 5, c: 'm-y', g: 'grid-row:4;grid-column:1;'}, {id: 6, c: 'm-y', g: 'grid-row:3;grid-column:1;'},
    {id: 7, c: 'm-y', g: 'grid-row:2;grid-column:1;'}, {id: 8, c: 'm-y', g: 'grid-row:2;grid-column:2;'},
    {id: 9, c: 'm-y', g: 'grid-row:2;grid-column:3;'}, {id: 10, c: 'm-y', g: 'grid-row:2;grid-column:4;'},
    {id: 11, c: 'm-y', g: 'grid-row:2;grid-column:5;'}, {id: 12, c: 'm-y', g: 'grid-row:2;grid-column:6;'},
    {id: 13, c: 'm-y', g: 'grid-row:3;grid-column:6;'}, {id: 14, c: 'm-y', g: 'grid-row:4;grid-column:6;'},
    {id: 15, c: 'm-r', g: 'grid-row:5;grid-column:6;'}, {id: 16, c: 'm-r', g: 'grid-row:6;grid-column:6;'},
    {id: 17, c: 'm-r', g: 'grid-row:7;grid-column:6;'}, {id: 18, c: 'm-o', g: 'grid-row:4;grid-column:2;'},
    {id: 19, c: 'm-o', g: 'grid-row:4;grid-column:5;'}, {id: 20, c: 'm-b', g: 'grid-row:5;grid-column:3;'},
    {id: 30, c: 'm-b', g: 'grid-row:5;grid-column:4;'}, {id: 100, c: 'm-t', g: 'grid-row:6;grid-column:3;'},
    {id: 101, c: 'm-t', g: 'grid-row:6;grid-column:4;'}
];

// --- NAVEGACIÓN ---
function showView(id) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const target = document.getElementById('view-' + id);
    if (target) target.classList.add('active');
    
    if (id === 'map') renderMapa();
    if (id === 'list') renderList();
    if (id === 'pago') {
        document.getElementById('resumen-pago').innerHTML = `
            <b>Cliente:</b> ${tempUser.nombre}<br>
            <b>Mesas:</b> ${mesasSeleccionadas.join(', ')}<br>
            <b>Total:</b> $${(mesasSeleccionadas.length * 40000).toLocaleString()} COP
        `;
    }
}

// --- VALIDACIONES DE INICIO ---
function confirmarDatos() {
    const n = document.getElementById('nombre').value;
    const f = document.getElementById('fecha').value;
    const p = parseInt(document.getElementById('personas').value);
    
    const hoy = new Date();
    hoy.setHours(0,0,0,0);
    const fechaElegida = new Date(f);
    const limiteFuturo = new Date();
    limiteFuturo.setMonth(limiteFuturo.getMonth() + 3);

    if (!n || !f || !p) return alert("Completa todos los campos.");
    if (p > 10) return alert("Máximo 10 personas por reserva.");
    if (fechaElegida < hoy) return alert("No puedes reservar en fechas pasadas.");
    if (fechaElegida > limiteFuturo) return alert("Solo permitimos reservas hasta con 3 meses de anticipación.");

    tempUser = { nombre: n, fecha: f, personas: p }; 
    showView('map'); 
}

// --- RENDERIZADO DEL MAPA ---
function renderMapa() {
    const grid = document.getElementById('mapa-grid');
    grid.innerHTML = '<div class="dj-set">DJ</div>';
    
    // Lista de IDs que ya están en la DB
    const ocupadas = dbReservas.flatMap(r => r.mesas);

    configMesas.forEach(m => {
        const div = document.createElement('div');
        const estaOcupada = ocupadas.includes(m.id);
        const estaSeleccionada = mesasSeleccionadas.includes(m.id);

        // Clases según estado
        div.className = `mesa ${m.c}`;
        if (estaOcupada) div.classList.add('ocupada');
        if (estaSeleccionada) div.classList.add('selected');

        div.style = m.g; 
        div.innerText = m.id;

        // Click solo si está libre
        if (!estaOcupada) {
            div.onclick = () => {
                if (mesasSeleccionadas.includes(m.id)) {
                    mesasSeleccionadas = mesasSeleccionadas.filter(i => i !== m.id);
                } else {
                    mesasSeleccionadas.push(m.id);
                }
                renderMapa();
            };
        } else {
            div.innerText = "X";
        }
        grid.appendChild(div);
    });
    
    // Panel inferior
    const info = document.getElementById('map-info');
    if (mesasSeleccionadas.length > 0) {
        info.style.display = "block";
        document.getElementById('txt-mesas').innerText = "Mesas: " + mesasSeleccionadas.join(', ');
        document.getElementById('txt-total').innerText = "$" + (mesasSeleccionadas.length * 40000).toLocaleString() + " COP";
    } else {
        info.style.display = "none";
    }
}

// --- FINALIZAR Y GUARDAR ---
function finalizarPago() {
    if (mesasSeleccionadas.length === 0) return alert("Selecciona al menos una mesa.");
    
    alert("¡Reserva exitosa en PlanClub! 🥂");
    dbReservas.push({ 
        id: Date.now(), 
        ...tempUser, 
        mesas: [...mesasSeleccionadas], 
        total: mesasSeleccionadas.length * 40000 
    });
    
    localStorage.setItem('planclub_db', JSON.stringify(dbReservas));
    mesasSeleccionadas = [];
    showView('home');
}

function renderList() {
    const container = document.getElementById('reserva-container');
    container.innerHTML = dbReservas.length === 0 ? "<p>No hay reservas.</p>" : 
        dbReservas.map(r => `
            <div class="card" style="border-left:5px solid var(--neon-cyan);">
                <h4>Mesas: ${r.mesas.join(', ')}</h4>
                <p>${r.nombre} • ${r.fecha} • $${r.total.toLocaleString()}</p>
            </div>
        `).join('');
}

function toggleSettings() {
    const menu = document.getElementById('settings-menu');
    menu.style.display = (menu.style.display === 'flex') ? 'none' : 'flex';
}
