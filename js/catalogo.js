import { db } from './firebase.js';
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let publicProductosCache = [];

// Leer los parámetros de la URL
const urlParams = new URLSearchParams(window.location.search);
const publicUid = urlParams.get('uid');
const modoBasico = urlParams.get('modo') === 'basico';

if (!publicUid) {
    document.getElementById('public-inventario-grid').innerHTML = '<div class="col-12 text-center text-danger"><h4>Enlace inválido o falta el ID del catálogo.</h4></div>';
} else {
    // Si es modo básico, podemos cambiar el título de la página
    if (modoBasico) {
        document.querySelector('.public-header h1').textContent = 'Catálogo de Productos';
    }
    cargarInventarioPublico(publicUid);
}

async function cargarInventarioPublico(uid) {
    const grid = document.getElementById('public-inventario-grid');
    grid.innerHTML = '<div class="col-12 text-center"><div class="spinner-border text-primary"></div></div>';

    const q = query(collection(db, "inventario"), where("userId", "==", uid));
    const snapshot = await getDocs(q);
    
    publicProductosCache = snapshot.docs.map(doc => doc.data());
    publicProductosCache.sort((a, b) => a.nombre.localeCompare(b.nombre));

    const categoriasUnicas = [...new Set(publicProductosCache.map(p => p.categoria))].filter(Boolean);
    const filtroSelect = document.getElementById('public-filtro-categoria');
    filtroSelect.innerHTML = '<option value="">Todas las categorías</option>';
    categoriasUnicas.forEach(cat => { filtroSelect.innerHTML += `<option value="${cat}">${cat}</option>`; });

    renderizarCatalogoPublico();
}

window.renderizarCatalogoPublico = function() {
    const grid = document.getElementById('public-inventario-grid');
    const contador = document.getElementById('public-contador');
    const buscador = document.getElementById('public-buscador').value.toLowerCase().trim();
    const categoriaFiltro = document.getElementById('public-filtro-categoria').value;

    const productosFiltrados = publicProductosCache.filter(prod => {
        const coincideNombre = prod.nombre.toLowerCase().includes(buscador);
        const coincideCategoria = categoriaFiltro === "" || prod.categoria === categoriaFiltro;
        return coincideNombre && coincideCategoria;
    });

    grid.innerHTML = '';
    contador.textContent = `${productosFiltrados.length} Ítems`;

    if (productosFiltrados.length === 0) {
        grid.innerHTML = '<div class="col-12 text-center text-muted py-5"><h4>No se encontraron productos</h4></div>';
        return;
    }

    productosFiltrados.forEach(prod => {
        // DETECTAR SI ES TERMOPANEL (Robusto a mayúsculas/minúsculas)
        const esTermopanel = prod.categoria.toUpperCase().includes('TERMOPANEL');
        
        let variantesHTML = '';
        prod.variantes.forEach(v => {
            let stockHTML = '';
            
            // Si NO es modo básico, mostramos el stock adaptado
            if (!modoBasico) {
                const unidad = esTermopanel ? 'mts' : 'uds';
                const colorClass = v.stock <= 0 ? 'text-danger' : 'text-success';
                const texto = v.stock > 0 ? `Stock: ${Number.isInteger(v.stock) ? v.stock : v.stock.toFixed(2)} ${unidad}` : 'Agotado';
                stockHTML = `<span class="small fw-bold ${colorClass}">${texto}</span>`;
            }

            // Si NO es modo básico, mostramos el precio
            let precioHTML = '';
            if (!modoBasico) {
                precioHTML = `<span class="text-muted">$${v.precio.toFixed(2)}</span>`;
            }

            variantesHTML += `<li class="list-group-item d-flex justify-content-between align-items-center py-2 px-3">
                <span class="fw-semibold">${v.medida} ${esTermopanel ? '(mts)' : ''}</span> 
                ${precioHTML}
                ${stockHTML}
            </li>`;
        });

        const imgSrc = prod.fotoUrl ? prod.fotoUrl : 'https://via.placeholder.com/300x250?text=Sin+Foto';
        const desc = prod.descripcion ? `<p class="text-muted small mb-0 mt-2">${prod.descripcion}</p>` : '';

        grid.innerHTML += `
            <div class="col-md-4 col-sm-6 mb-4">
                <div class="card public-card h-100 shadow-sm border-0">
                    <img src="${imgSrc}" class="card-img-top public-img" onerror="this.src='https://via.placeholder.com/300x250?text=Error'">
                    <div class="card-body pb-2">
                        <span class="badge bg-secondary mb-2">${prod.categoria}</span>
                        <h5 class="card-title fw-bold mb-1">${prod.nombre}</h5>
                        ${desc}
                    </div>
                    <ul class="list-group list-group-flush mt-auto">${variantesHTML}</ul>
                </div>
            </div>
        `;
    });
};
