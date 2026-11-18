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
    // Si es modo básico, cambiamos el título de la cabecera
    if (modoBasico) {
        document.getElementById('titulo-catalogo').textContent = 'Catálogo de Productos (Sin Precios)';
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
        const esTermopanel = prod.categoria.toUpperCase().includes('TERMOPANEL');
        
        // Construcción de la tabla de variantes
        let tableHeaders = '';
        let tableRows = '';

        if (!modoBasico) {
            // MODO NORMAL (Con precios y stock)
            if (esTermopanel) {
                tableHeaders = `
                    <tr>
                        <th>Medida (mts)</th>
                        <th>Cant. Paneles</th>
                        <th>Precio</th>
                        <th>Total Mts</th>
                    </tr>`;
                prod.variantes.forEach(v => {
                    const cantPaneles = v.cantPaneles || 0;
                    const totalMts = Number.isInteger(v.stock) ? v.stock : v.stock.toFixed(2);
                    tableRows += `
                        <tr>
                            <td>${v.medida}</td>
                            <td>${cantPaneles}</td>
                            <td>$${v.precio.toFixed(2)}</td>
                            <td>${totalMts}</td>
                        </tr>`;
                });
            } else {
                tableHeaders = `
                    <tr>
                        <th>Medida</th>
                        <th>Precio</th>
                        <th>Stock</th>
                    </tr>`;
                prod.variantes.forEach(v => {
                    const stockMostrar = Number.isInteger(v.stock) ? v.stock : v.stock.toFixed(2);
                    tableRows += `
                        <tr>
                            <td>${v.medida}</td>
                            <td>$${v.precio.toFixed(2)}</td>
                            <td>${stockMostrar} uds</td>
                        </tr>`;
                });
            }
        } else {
            // MODO BÁSICO (Sin precios ni stock)
            if (esTermopanel) {
                tableHeaders = `
                    <tr>
                        <th>Medida (mts)</th>
                        <th>Cant. Paneles</th>
                    </tr>`;
                prod.variantes.forEach(v => {
                    tableRows += `
                        <tr>
                            <td>${v.medida}</td>
                            <td>${v.cantPaneles || 0}</td>
                        </tr>`;
                });
            } else {
                tableHeaders = `
                    <tr>
                        <th>Medida</th>
                    </tr>`;
                prod.variantes.forEach(v => {
                    tableRows += `
                        <tr>
                            <td>${v.medida}</td>
                        </tr>`;
                });
            }
        }

        const imgSrc = prod.fotoUrl ? prod.fotoUrl : 'https://via.placeholder.com/300x250?text=Sin+Foto';
        const descHTML = prod.descripcion ? `<div class="mt-2"><span class="label-text">Descripción:</span><br><span class="text-muted small">${prod.descripcion}</span></div>` : '';

        grid.innerHTML += `
            <div class="col-md-4 col-sm-6 mb-4">
                <div class="card public-card h-100 shadow-sm border-0">
                    <img src="${imgSrc}" class="card-img-top public-img" onerror="this.src='https://via.placeholder.com/300x250?text=Error'">
                    <div class="card-body pb-2">
                        <div class="mb-1">
                            <span class="label-text">Categoría:</span> 
                            <span class="badge bg-secondary">${prod.categoria}</span>
                        </div>
                        <div class="mb-2">
                            <span class="label-text">Nombre:</span> 
                            <h5 class="card-title fw-bold d-inline">${prod.nombre}</h5>
                        </div>
                        ${descHTML}
                    </div>
                    <div class="table-responsive mt-auto border-top">
                        <table class="table table-variantes table-bordered mb-0">
                            <thead>${tableHeaders}</thead>
                            <tbody>${tableRows}</tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    });
};
