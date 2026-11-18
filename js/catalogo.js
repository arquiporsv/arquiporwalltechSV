import { db } from './firebase.js';
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ==========================================
// CONFIGURACIÓN FIJA DE LA TIENDA
// ==========================================
const USER_ID = "qzrkTfw212gfpbePrIpyiF2AZhK2"; // <-- Tu UID de Firebase
const NUMERO_WHATSAPP = "50362757163"; // <-- Número de WhatsApp (con código de país 503)

let publicProductosCache = [];

// Detectar automáticamente si estamos en catalogo.html (básico) o stock.html (completo)
const esModoBasico = window.location.pathname.includes('catalogo.html');

if (esModoBasico) {
    document.getElementById('titulo-catalogo').textContent = 'CATALOGO ARQUIPOR / WALLTECH';
} else {
    document.getElementById('titulo-catalogo').textContent = 'Catálogo Completo';
}

cargarInventarioPublico();

// ==========================================
// CARGA Y RENDERIZADO
// ==========================================
async function cargarInventarioPublico() {
    const grid = document.getElementById('public-inventario-grid');
    grid.innerHTML = '<div class="col-12 text-center"><div class="spinner-border text-primary"></div></div>';

    const q = query(collection(db, "inventario"), where("userId", "==", USER_ID));
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
        
        let tableHeaders = '';
        let tableRows = '';
        let botonWhatsAppBottom = ''; // Para el botón general de Termopanel

        if (!esModoBasico) {
            // ==========================================
            // MODO STOCK (Sin WhatsApp, con precios y cantidades)
            // ==========================================
            if (esTermopanel) {
                tableHeaders = `<tr><th>Medida (mts)</th><th>Cant. Paneles</th><th>Precio</th><th>Total Mts</th></tr>`;
                prod.variantes.forEach(v => {
                    const totalMts = Number.isInteger(v.stock) ? v.stock : v.stock.toFixed(2);
                    tableRows += `<tr><td>${v.medida}</td><td>${v.cantPaneles || 0}</td><td>$${v.precio.toFixed(2)}</td><td>${totalMts}</td></tr>`;
                });
            } else {
                tableHeaders = `<tr><th>Medida</th><th>Precio</th><th>Stock</th></tr>`;
                prod.variantes.forEach(v => {
                    const stockMostrar = Number.isInteger(v.stock) ? v.stock : v.stock.toFixed(2);
                    tableRows += `<tr><td>${v.medida}</td><td>$${v.precio.toFixed(2)}</td><td>${stockMostrar} uds</td></tr>`;
                });
            }
        } else {
            // ==========================================
            // MODO CATÁLOGO (Con WhatsApp, sin precios)
            // ==========================================
            if (esTermopanel) {
                // REQUERIMIENTO 1: Termopanel no muestra tabla. 
                // Creamos un botón general de WhatsApp
                const mensajeWA = encodeURIComponent(`Hola, estoy interesado en el producto Termopanel: ${prod.nombre}. ¿Me pueden dar más información?`);
                const urlWA = `https://wa.me/${NUMERO_WHATSAPP}?text=${mensajeWA}`;
                
                botonWhatsAppBottom = `
                    <div class="p-3 bg-light border-top mt-auto">
                        <a href="${urlWA}" target="_blank" class="btn btn-success w-100 d-flex justify-content-center align-items-center gap-2 fw-bold">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" class="bi bi-whatsapp" viewBox="0 0 16 16"><path d="M13.601 2.326A7.854 7.854 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.933 7.933 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.898 7.898 0 0 0 13.6 2.326zM7.994 14.521a6.573 6.573 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.557 6.557 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592zm3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.729.729 0 0 0-.529.247c-.182.198-.691.677-.691 1.654 0 .977.71 1.916.81 2.049.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232z"/></svg>
                            Consultar medidas
                        </a>
                    </div>
                `;
            } else {
                // REQUERIMIENTO 2: Para productos normales, el WhatsApp va en cada medida
                tableHeaders = `<tr><th>Medida</th><th>Consulta</th></tr>`;
                prod.variantes.forEach(v => {
                    const mensajeWA = encodeURIComponent(`Hola, me interesa el producto: ${prod.nombre} en la medida: ${v.medida}. ¿Me pueden dar más información?`);
                    const urlWA = `https://wa.me/${NUMERO_WHATSAPP}?text=${mensajeWA}`;
                    
                    tableRows += `
                        <tr>
                            <td class="fw-semibold">${v.medida}</td>
                            <td>
                                <a href="${urlWA}" target="_blank" class="btn btn-sm btn-outline-success">
                                    Consultar
                                </a>
                            </td>
                        </tr>`;
                });
            }
        }

        // Construir la tabla solo si hay datos
        let tablaHTML = '';
        if (tableHeaders !== '') {
            tablaHTML = `
                <div class="table-responsive mt-auto border-top">
                    <table class="table table-variantes table-bordered mb-0">
                        <thead>${tableHeaders}</thead>
                        <tbody>${tableRows}</tbody>
                    </table>
                </div>
            `;
        }

        const imgSrc = prod.fotoUrl ? prod.fotoUrl : 'https://via.placeholder.com/300x250?text=Sin+Foto';
        const descHTML = prod.descripcion ? `<div class="mt-2"><span class="label-text">Descripción:</span><br><span class="text-muted small">${prod.descripcion}</span></div>` : '';

        grid.innerHTML += `
            <div class="col-md-4 col-sm-6 mb-4">
                <div class="card public-card h-100 shadow-sm border-0 d-flex flex-column">
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
                    
                    ${tablaHTML}
                    ${botonWhatsAppBottom}
                    
                </div>
            </div>
        `;
    });
};
