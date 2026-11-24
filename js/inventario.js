import { db, auth, showAlert, showConfirm, checkAuth } from './firebase.js';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, where } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

let currentUser = null;
let productosCache = []; 
let categoriasCache = [];
let productoEditandoId = null;
let isTermopanelMode = false;
let loteMovimientosTemp = [];

checkAuth((user) => {
    currentUser = user;
    inicializarAppPrivada();
});

window.logout = function() { 
    signOut(auth).then(() => window.location.href = 'index.html'); 
};

async function inicializarAppPrivada() {
    await cargarCategorias();
    await cargarProductos();
}

// ==========================================
// CATEGORÍAS
// ==========================================
async function cargarCategorias() {
    const q = query(collection(db, "categorias"), where("userId", "==", currentUser.uid));
    const snap = await getDocs(q);
    categoriasCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    
    const select = document.getElementById('prod-categoria');
    select.innerHTML = '<option value="">-- Seleccionar --</option>';
    categoriasCache.forEach(c => { select.innerHTML += `<option value="${c.nombre}">${c.nombre}</option>`; });

    const lista = document.getElementById('lista-categorias');
    lista.innerHTML = '';
    categoriasCache.forEach(c => {
        lista.innerHTML += `<li class="list-group-item d-flex justify-content-between align-items-center">${c.nombre}<button class="btn btn-sm btn-outline-danger" onclick="eliminarCategoria('${c.id}')">🗑️</button></li>`;
    });
}

window.abrirModalCategoria = () => new bootstrap.Modal(document.getElementById('modal-categoria')).show();

window.guardarCategoria = async function() {
    const nombre = document.getElementById('nueva-categoria-nombre').value.trim();
    if (!nombre) return showAlert('Aviso', 'Escribe un nombre.', 'warning');
    if (categoriasCache.some(c => c.nombre.toLowerCase() === nombre.toLowerCase())) return showAlert('Aviso', 'Ya existe.', 'warning');
    await addDoc(collection(db, "categorias"), { userId: currentUser.uid, nombre });
    document.getElementById('nueva-categoria-nombre').value = '';
    await cargarCategorias();
    showAlert('Éxito', 'Categoría agregada.', 'success');
};

window.eliminarCategoria = async function(id) {
    if (await showConfirm('¿Eliminar categoría?')) {
        await deleteDoc(doc(db, "categorias", id));
        await cargarCategorias();
        showAlert('Eliminado', 'La categoría fue borrada.', 'success');
    }
};

// ==========================================
// LÓGICA TERMOPANEL
// ==========================================
function esCategoriaTermopanel(categoria) {
    return categoria && categoria.trim().toLowerCase().includes('termopanel');
}

window.verificarCategoriaTermopanel = function() {
    const cat = document.getElementById('prod-categoria').value;
    const nuevoModo = esCategoriaTermopanel(cat);
    if (nuevoModo !== isTermopanelMode) {
        isTermopanelMode = nuevoModo;
        const filasActuales = [];
        document.querySelectorAll('.variante-row').forEach(fila => {
            filasActuales.push({
                medida: fila.querySelector('.var-medida').value,
                precio: fila.querySelector('.var-precio').value,
                stock: fila.querySelector('.var-stock') ? fila.querySelector('.var-stock').value : fila.querySelector('.var-stock-hidden').value,
                cantPaneles: fila.querySelector('.var-cant-paneles') ? fila.querySelector('.var-cant-paneles').value : '',
                danado: fila.querySelector('.var-danado').value,
                amarillo: fila.querySelector('.var-amarillo').value
            });
        });

        document.getElementById('contenedor-variantes').innerHTML = '';
        if (filasActuales.length === 0) agregarFilaVariante();
        else filasActuales.forEach(f => agregarFilaVariante(f.medida, f.precio, f.stock, f.cantPaneles, f.danado, f.amarillo));
    }
};

window.calcularMtsFila = function(input) {
    const row = input.closest('.variante-row');
    const medida = parseFloat(row.querySelector('.var-medida').value) || 0;
    const cant = parseFloat(row.querySelector('.var-cant-paneles').value) || 0;
    const mts = medida * cant;
    
    row.querySelector('.var-mts').value = mts.toFixed(2);
    row.querySelector('.var-stock-hidden').value = mts;
};

// ==========================================
// PRODUCTOS
// ==========================================
async function cargarProductos() {
    const tbody = document.getElementById('tabla-inventario');
    tbody.innerHTML = '<tr><td colspan="7" class="text-center">Cargando inventario...</td></tr>';
    
    const q = query(collection(db, "inventario"), where("userId", "==", currentUser.uid));
    const snapshot = await getDocs(q);
    
    productosCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    productosCache.sort((a, b) => a.nombre.localeCompare(b.nombre));
    
    const categoriasUnicas = [...new Set(productosCache.map(p => p.categoria))].filter(Boolean);
    const selectFiltro = document.getElementById('inv-filtro-categoria');
    const valorActual = selectFiltro.value; 
    selectFiltro.innerHTML = '<option value="">Todas las categorías</option>';
    categoriasUnicas.forEach(cat => { selectFiltro.innerHTML += `<option value="${cat}">${cat}</option>`; });
    selectFiltro.value = valorActual; 

    filtrarInventario();
}

window.filtrarInventario = function() {
    const tbody = document.getElementById('tabla-inventario');
    const buscador = document.getElementById('inv-buscador').value.toLowerCase().trim();
    const categoriaFiltro = document.getElementById('inv-filtro-categoria').value;

    const filtrados = productosCache.filter(prod => {
        const coincideTexto = prod.nombre.toLowerCase().includes(buscador) || (prod.descripcion && prod.descripcion.toLowerCase().includes(buscador));
        const coincideCat = categoriaFiltro === "" || prod.categoria === categoriaFiltro;
        return coincideTexto && coincideCat;
    });

    tbody.innerHTML = '';
    if (filtrados.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No se encontraron productos.</td></tr>';
        return;
    }

    filtrados.forEach(prod => {
        let stockTotal = 0;
        let variantesHTML = '';
        let danadosHTML = '';
        const esTermopanel = esCategoriaTermopanel(prod.categoria); 

        prod.variantes.forEach(v => {
            stockTotal += v.stock;
            const colorStock = v.stock <= 0 ? 'stock-out' : 'stock-in';
            const stockMostrar = Number.isInteger(v.stock) ? v.stock : v.stock.toFixed(2);
            const unidad = esTermopanel ? 'mts' : 'uds';
            
            variantesHTML += `<span class="badge-stock">${v.medida}: $${v.precio.toFixed(2)} | <span class="${colorStock}">${stockMostrar} ${unidad}</span></span>`;
            
            if (v.danado > 0 || v.amarillo > 0) {
                danadosHTML += `<div class="small mb-1"><b>${v.medida}:</b> `;
                if (v.danado > 0) danadosHTML += `<span class="badge bg-danger me-1">Dañado: ${v.danado}</span>`;
                if (v.amarillo > 0) danadosHTML += `<span class="badge bg-warning text-dark">Amarillo: ${v.amarillo}</span>`;
                danadosHTML += `</div>`;
            }
        });

        if (danadosHTML === '') danadosHTML = '<span class="text-muted small">Ninguno</span>';
        const imgSrc = prod.fotoUrl ? prod.fotoUrl : 'https://via.placeholder.com/50?text=No';
        const unidadTotal = esTermopanel ? 'mts' : 'uds';

        tbody.innerHTML += `
            <tr>
                <td><img src="${imgSrc}" class="img-thumb" onerror="this.src='https://via.placeholder.com/50?text=Err'"></td>
                <td>
                    <div class="fw-bold">${prod.nombre}</div>
                    <div class="text-muted small">${prod.descripcion || ''}</div>
                </td>
                <td><span class="badge bg-secondary">${prod.categoria}</span></td>
                <td>${variantesHTML}</td>
                <td><b>${Number.isInteger(stockTotal) ? stockTotal : stockTotal.toFixed(2)} ${unidadTotal}</b></td>
                <td>${danadosHTML}</td>
                <td>
                    <button onclick="editarProducto('${prod.id}')" class="btn btn-sm btn-outline-primary" title="Editar">✏️</button>
                    <button onclick="eliminarProducto('${prod.id}')" class="btn btn-sm btn-outline-danger" title="Eliminar">🗑️</button>
                </td>
            </tr>
        `;
    });
};

window.abrirModalProducto = function() {
    productoEditandoId = null;
    isTermopanelMode = false;
    document.getElementById('modal-prod-titulo').textContent = 'Nuevo Producto';
    document.getElementById('prod-nombre').value = '';
    document.getElementById('prod-categoria').value = '';
    document.getElementById('prod-descripcion').value = '';
    document.getElementById('prod-foto-url').value = '';
    document.getElementById('preview-foto-container').style.display = 'none';
    document.getElementById('contenedor-variantes').innerHTML = '';
    
    agregarFilaVariante();
    new bootstrap.Modal(document.getElementById('modal-producto')).show();
};

window.actualizarPreviewFoto = function() {
    const url = document.getElementById('prod-foto-url').value.trim();
    const container = document.getElementById('preview-foto-container');
    const img = document.getElementById('preview-foto');
    if (url) {
        img.src = url;
        container.style.display = 'block';
        img.onerror = () => { container.style.display = 'none'; };
    } else { container.style.display = 'none'; }
};

window.agregarFilaVariante = function(medida = '', precio = '', stock = '', cantPaneles = '', danado = '0', amarillo = '0') {
    const container = document.getElementById('contenedor-variantes');
    const div = document.createElement('div');
    
    if (isTermopanelMode) {
        div.className = 'variante-row termopanel-row';
        div.innerHTML = `
            <input type="text" class="form-control form-control-sm var-medida" placeholder="Medida (mts)" value="${medida}" oninput="calcularMtsFila(this)">
            <input type="number" class="form-control form-control-sm var-precio" placeholder="Precio $" step="0.01" value="${precio}">
            <input type="number" class="form-control form-control-sm var-cant-paneles" placeholder="Cant. Paneles" value="${cantPaneles}" oninput="calcularMtsFila(this)">
            <input type="text" class="form-control form-control-sm var-mts" placeholder="Total Mts" value="${stock}" readonly style="background-color: #e9ecef;">
            <input type="number" class="form-control form-control-sm var-danado" placeholder="Dañados" value="${danado}">
            <input type="number" class="form-control form-control-sm var-amarillo" placeholder="Amarillos" value="${amarillo}">
            <input type="hidden" class="var-stock-hidden" value="${stock}">
            <button class="btn-remove-row" onclick="this.parentElement.remove()">X</button>
        `;
    } else {
        div.className = 'variante-row';
        div.innerHTML = `
            <input type="text" class="form-control form-control-sm var-medida" placeholder="Medida" value="${medida}">
            <input type="number" class="form-control form-control-sm var-precio" placeholder="Precio $" step="0.01" value="${precio}">
            <input type="number" class="form-control form-control-sm var-stock" placeholder="Stock" step="0.01" value="${stock}">
            <input type="number" class="form-control form-control-sm var-danado" placeholder="Dañados" value="${danado}">
            <input type="number" class="form-control form-control-sm var-amarillo" placeholder="Amarillos" value="${amarillo}">
            <button class="btn-remove-row" onclick="this.parentElement.remove()">X</button>
        `;
    }
    container.appendChild(div);
};

window.guardarProducto = async function() {
    const nombre = document.getElementById('prod-nombre').value.trim();
    const categoria = document.getElementById('prod-categoria').value;
    const descripcion = document.getElementById('prod-descripcion').value.trim();
    const fotoUrl = document.getElementById('prod-foto-url').value.trim();
    
    if (!nombre || !categoria) return showAlert('Aviso', 'Nombre y Categoría son obligatorios.', 'warning');
    const esTermopanel = esCategoriaTermopanel(categoria); 
    const variantes = [];
    
    document.querySelectorAll('.variante-row').forEach(fila => {
        const medida = fila.querySelector('.var-medida').value.trim();
        const precio = parseFloat(fila.querySelector('.var-precio').value);
        const danado = parseFloat(fila.querySelector('.var-danado').value) || 0;
        const amarillo = parseFloat(fila.querySelector('.var-amarillo').value) || 0;
        
        let stock = 0;
        let cantPaneles = null;

        if (esTermopanel) {
            stock = parseFloat(fila.querySelector('.var-stock-hidden').value) || 0;
            cantPaneles = parseFloat(fila.querySelector('.var-cant-paneles').value) || 0;
        } else {
            stock = parseFloat(fila.querySelector('.var-stock').value) || 0;
        }
        
        if (medida && !isNaN(precio)) {
            variantes.push({ medida, precio, stock, cantPaneles, danado, amarillo });
        }
    });

    if (variantes.length === 0) return showAlert('Aviso', 'Agrega al menos una variante válida.', 'warning');

    const payload = { userId: currentUser.uid, nombre, categoria, descripcion, fotoUrl, variantes, fechaActualizacion: new Date().toISOString() };

    try {
        if (productoEditandoId) {
            await updateDoc(doc(db, "inventario", productoEditandoId), payload);
            showAlert('Éxito', 'Producto actualizado.', 'success');
        } else {
            payload.fechaCreacion = new Date().toISOString();
            await addDoc(collection(db, "inventario"), payload);
            showAlert('Éxito', 'Producto creado.', 'success');
        }
        bootstrap.Modal.getInstance(document.getElementById('modal-producto')).hide();
        await cargarProductos();
    } catch (e) { showAlert('Error', e.message, 'danger'); }
};

window.editarProducto = function(id) {
    const prod = productosCache.find(p => p.id === id);
    if (!prod) return;
    
    productoEditandoId = id;
    isTermopanelMode = esCategoriaTermopanel(prod.categoria);
    
    document.getElementById('modal-prod-titulo').textContent = 'Editar Producto';
    document.getElementById('prod-nombre').value = prod.nombre;
    document.getElementById('prod-categoria').value = prod.categoria;
    document.getElementById('prod-descripcion').value = prod.descripcion || '';
    document.getElementById('prod-foto-url').value = prod.fotoUrl || '';
    
    actualizarPreviewFoto();
    document.getElementById('contenedor-variantes').innerHTML = '';
    prod.variantes.forEach(v => agregarFilaVariante(v.medida, v.precio, v.stock, v.cantPaneles, v.danado || 0, v.amarillo || 0));

    new bootstrap.Modal(document.getElementById('modal-producto')).show();
};

window.eliminarProducto = async function(id) {
    if (await showConfirm('¿Estás seguro de eliminar este producto del inventario?')) {
        await deleteDoc(doc(db, "inventario", id));
        await cargarProductos();
        showAlert('Eliminado', 'El producto ha sido borrado.', 'success');
    }
};

// ==========================================
// MOVIMIENTOS
// ==========================================
window.abrirModalMovimiento = function() {
    loteMovimientosTemp = [];
    document.getElementById('tabla-lote-movimiento').querySelector('tbody').innerHTML = '';
    document.getElementById('mov-codigo-gen').value = '';
    document.getElementById('mov-num-dte').value = '';
    document.getElementById('div-mov-unidad').style.display = 'none';
    
    const select = document.getElementById('mov-producto');
    select.innerHTML = '<option value="">-- Seleccionar --</option>';
    productosCache.forEach(p => { select.innerHTML += `<option value="${p.id}">${p.nombre}</option>`; });
    
    document.getElementById('mov-variante').innerHTML = '<option value="">-- Seleccione producto --</option>';
    document.getElementById('mov-cantidad').value = '1';
    new bootstrap.Modal(document.getElementById('modal-movimiento')).show();
};

window.cargarVariantesMovimiento = function() {
    const prodId = document.getElementById('mov-producto').value;
    const selectVar = document.getElementById('mov-variante');
    const divUnidad = document.getElementById('div-mov-unidad');
    selectVar.innerHTML = '';
    divUnidad.style.display = 'none';

    if (!prodId) {
        selectVar.innerHTML = '<option value="">-- Seleccione producto --</option>';
        return;
    }
    const prod = productosCache.find(p => p.id === prodId);
    const esTermopanel = esCategoriaTermopanel(prod.categoria);
    
    if (esTermopanel) divUnidad.style.display = 'block';

    prod.variantes.forEach((v, index) => {
        const stockMostrar = Number.isInteger(v.stock) ? v.stock : v.stock.toFixed(2);
        const unidad = esTermopanel ? 'mts' : 'uds';
        selectVar.innerHTML += `<option value="${index}">${v.medida} (Normal: ${stockMostrar} ${unidad} | Dañ: ${v.danado || 0} | Am: ${v.amarillo || 0})</option>`;
    });
};

window.agregarItemAlLote = function() {
    const prodId = document.getElementById('mov-producto').value;
    const varIndex = document.getElementById('mov-variante').value;
    const tipoStock = document.getElementById('mov-tipo-stock').value;
    const tipo = document.getElementById('mov-tipo').value;
    const cantidad = parseFloat(document.getElementById('mov-cantidad').value);
    const prod = productosCache.find(p => p.id === prodId);

    if (!prodId || varIndex === "" || isNaN(cantidad) || cantidad <= 0) return showAlert('Aviso', 'Complete los campos correctamente.', 'warning');

    const esTermopanel = esCategoriaTermopanel(prod.categoria);
    const unidad = esTermopanel ? document.getElementById('mov-unidad').value : 'uds';
    const variante = prod.variantes[varIndex];

    // Validar stock
    if (tipo === 'salida') {
        if (tipoStock === 'normal' && cantidad > variante.stock) return showAlert('Aviso', 'Stock normal insuficiente.', 'warning');
        if (tipoStock === 'danado' && cantidad > (variante.danado || 0)) return showAlert('Aviso', 'Stock dañado insuficiente.', 'warning');
        if (tipoStock === 'amarillo' && cantidad > (variante.amarillo || 0)) return showAlert('Aviso', 'Stock amarillo insuficiente.', 'warning');
    }

    // Agregar a la lista temporal
    loteMovimientosTemp.push({
        prodId, varIndex: parseInt(varIndex), prodNombre: prod.nombre, medida: variante.medida,
        tipoStock, tipo, cantidad, unidad, esTermopanel
    });
    renderizarLoteTabla();
    
    document.getElementById('mov-producto').value = '';
    document.getElementById('mov-variante').innerHTML = '<option value="">-- Seleccione producto --</option>';
    document.getElementById('mov-cantidad').value = '1';
    document.getElementById('div-mov-unidad').style.display = 'none';
};

function renderizarLoteTabla() {
    const tbody = document.getElementById('tabla-lote-movimiento').querySelector('tbody');
    tbody.innerHTML = '';
    loteMovimientosTemp.forEach((item, index) => {
        let labelStock = item.tipoStock === 'normal' ? 'Normal' : (item.tipoStock === 'danado' ? 'Dañado' : 'Amarillo');
        let labelUnidad = item.esTermopanel ? (item.unidad === 'mts' ? 'Metros' : 'Paneles') : 'Uds';
        tbody.innerHTML += `
            <tr>
                <td>${item.prodNombre}</td>
                <td>${item.medida}</td>
                <td><span class="badge ${item.tipoStock === 'normal' ? 'bg-primary' : (item.tipoStock === 'danado' ? 'bg-danger' : 'bg-warning text-dark')}">${labelStock}</span></td>
                <td>${labelUnidad}</td>
                <td><span class="badge ${item.tipo === 'entrada' ? 'bg-success' : 'bg-secondary'}">${item.tipo}</span></td>
                <td>${item.cantidad}</td>
                <td><button class="btn btn-sm btn-outline-danger" onclick="eliminarItemLote(${index})">X</button></td>
            </tr>
        `;
    });
}

window.eliminarItemLote = function(index) { loteMovimientosTemp.splice(index, 1); renderizarLoteTabla(); };

window.registrarLoteMovimiento = async function() {
    if (loteMovimientosTemp.length === 0) return showAlert('Aviso', 'No has agregado movimientos.', 'warning');

    const codGen = document.getElementById('mov-codigo-gen').value.trim();
    const numDte = document.getElementById('mov-num-dte').value.trim();

    try {
        for (const item of loteMovimientosTemp) {
            const prod = productosCache.find(p => p.id === item.prodId);
            const variante = prod.variantes[item.varIndex];
            
            let cantAfectada = item.cantidad;
            let cantPanelesAfectada = 0;

            if (item.esTermopanel && item.unidad === 'paneles') {
                const medida = parseFloat(variante.medida);
                cantAfectada = item.cantidad * medida; // Convertir paneles a metros
                cantPanelesAfectada = item.cantidad;
            }

            // Lógica para modificar el stock correspondiente
            if (item.tipo === 'entrada') {
                if (item.tipoStock === 'normal') {
                    variante.stock += cantAfectada;
                    if (item.esTermopanel && item.unidad === 'paneles') variante.cantPaneles += cantPanelesAfectada;
                }
                if (item.tipoStock === 'danado') variante.danado = (variante.danado || 0) + cantAfectada;
                if (item.tipoStock === 'amarillo') variante.amarillo = (variante.amarillo || 0) + cantAfectada;
            } else {
                if (item.tipoStock === 'normal') {
                    variante.stock -= cantAfectada;
                    if (item.esTermopanel && item.unidad === 'paneles') variante.cantPaneles -= cantPanelesAfectada;
                }
                if (item.tipoStock === 'danado') variante.danado -= cantAfectada;
                if (item.tipoStock === 'amarillo') variante.amarillo -= cantAfectada;
            }

            // Actualizar en Firestore
            await updateDoc(doc(db, "inventario", item.prodId), { variantes: prod.variantes });

            // Registrar en el historial
            await addDoc(collection(db, "movimientos_inventario"), {
                userId: currentUser.uid, productoId: item.prodId, productoNombre: item.prodNombre,
                medida: item.medida, tipo: item.tipo, tipoStock: item.tipoStock,
                cantidad: item.cantidad, unidad: item.esTermopanel ? item.unidad : 'uds',
                cantidadAfectadaStock: cantAfectada,
                comentario: '', codigoGeneracion: codGen, numeroDTE: numDte, fecha: new Date().toISOString()
            });
        }

        showAlert('Éxito', 'Lote de movimientos registrado.', 'success');
        bootstrap.Modal.getInstance(document.getElementById('modal-movimiento')).hide();
        await cargarProductos();
    } catch (e) { showAlert('Error', e.message, 'danger'); }
};

// ==========================================
// COMPARTIR ENLACES
// ==========================================
window.copiarEnlacePublico = function() {
    const baseUrl = window.location.origin + window.location.pathname.replace('inventario.html', '');
    navigator.clipboard.writeText(`${baseUrl}stock.html`).then(() => showAlert('Éxito', 'Enlace de stock copiado.', 'success'));
};

window.copiarEnlacePublicoBasico = function() {
    const baseUrl = window.location.origin + window.location.pathname.replace('inventario.html', '');
    navigator.clipboard.writeText(`${baseUrl}catalogo.html`).then(() => showAlert('Éxito', 'Enlace del catálogo copiado.', 'success'));
};
