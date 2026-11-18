import { db, auth, showAlert, showConfirm, checkAuth } from './firebase.js';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, where } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

let currentUser = null;
let productosCache = []; 
let categoriasCache = [];
let productoEditandoId = null;
let isTermopanelMode = false;

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
// LÓGICA DE CATEGORÍAS
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
// LÓGICA DE TERMOPANEL
// ==========================================
function esCategoriaTermopanel(categoria) {
    if (!categoria) return false;
    return categoria.trim().toLowerCase().includes('termopanel');
}

window.verificarCategoriaTermopanel = function() {
    const cat = document.getElementById('prod-categoria').value;
    const nuevoModo = esCategoriaTermopanel(cat);

    if (nuevoModo !== isTermopanelMode) {
        isTermopanelMode = nuevoModo;
        
        // Guardar datos actuales de las filas antes de redibujar
        const filasActuales = [];
        document.querySelectorAll('.variante-row').forEach(fila => {
            filasActuales.push({
                medida: fila.querySelector('.var-medida').value,
                precio: fila.querySelector('.var-precio').value,
                stock: fila.querySelector('.var-stock') ? fila.querySelector('.var-stock').value : (fila.querySelector('.var-stock-hidden') ? fila.querySelector('.var-stock-hidden').value : ''),
                cantPaneles: fila.querySelector('.var-cant-paneles') ? fila.querySelector('.var-cant-paneles').value : ''
            });
        });

        document.getElementById('contenedor-variantes').innerHTML = '';
        
        if (filasActuales.length === 0) {
            agregarFilaVariante();
        } else {
            filasActuales.forEach(f => agregarFilaVariante(f.medida, f.precio, f.stock, f.cantPaneles));
        }
    }
};

window.calcularMtsFila = function(input) {
    const row = input.closest('.variante-row');
    const medida = parseFloat(row.querySelector('.var-medida').value) || 0;
    const cant = parseFloat(row.querySelector('.var-cant-paneles').value) || 0;
    const mts = medida * cant;
    
    row.querySelector('.var-mts').value = mts.toFixed(2);
    row.querySelector('.var-stock-hidden').value = mts; // El stock real es el total de metros
};

// ==========================================
// LÓGICA DE PRODUCTOS
// ==========================================
async function cargarProductos() {
    const tbody = document.getElementById('tabla-inventario');
    tbody.innerHTML = '<tr><td colspan="6" class="text-center">Cargando inventario...</td></tr>';
    
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
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No se encontraron productos.</td></tr>';
        return;
    }

    filtrados.forEach(prod => {
        let stockTotal = 0;
        let variantesHTML = '';
        const esTermopanel = esCategoriaTermopanel(prod.categoria); 

        prod.variantes.forEach(v => {
            stockTotal += v.stock;
            const colorStock = v.stock <= 0 ? 'stock-out' : 'stock-in';
            const stockMostrar = Number.isInteger(v.stock) ? v.stock : v.stock.toFixed(2);
            const unidad = esTermopanel ? 'mts' : 'uds';
            
            variantesHTML += `<span class="badge-stock">${v.medida}: $${v.precio.toFixed(2)} | <span class="${colorStock}">${stockMostrar} ${unidad}</span></span>`;
        });

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

window.agregarFilaVariante = function(medida = '', precio = '', stock = '', cantPaneles = '') {
    const container = document.getElementById('contenedor-variantes');
    const div = document.createElement('div');
    
    if (isTermopanelMode) {
        div.className = 'variante-row termopanel-row';
        div.innerHTML = `
            <input type="text" class="form-control form-control-sm var-medida" placeholder="Medida (mts)" value="${medida}" oninput="calcularMtsFila(this)">
            <input type="number" class="form-control form-control-sm var-precio" placeholder="Precio $" step="0.01" value="${precio}">
            <input type="number" class="form-control form-control-sm var-cant-paneles" placeholder="Cant. Paneles" value="${cantPaneles}" oninput="calcularMtsFila(this)">
            <input type="text" class="form-control form-control-sm var-mts" placeholder="Total Mts" value="${stock}" readonly style="background-color: #e9ecef;">
            <input type="hidden" class="var-stock-hidden" value="${stock}">
            <button class="btn-remove-row" onclick="this.parentElement.remove()">X</button>
        `;
    } else {
        div.className = 'variante-row';
        div.innerHTML = `
            <input type="text" class="form-control form-control-sm var-medida" placeholder="Medida" value="${medida}">
            <input type="number" class="form-control form-control-sm var-precio" placeholder="Precio $" step="0.01" value="${precio}">
            <input type="number" class="form-control form-control-sm var-stock" placeholder="Stock" step="0.01" value="${stock}">
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
        
        let stock = 0;
        let cantPaneles = null;

        if (esTermopanel) {
            stock = parseFloat(fila.querySelector('.var-stock-hidden').value) || 0;
            cantPaneles = parseFloat(fila.querySelector('.var-cant-paneles').value) || 0;
        } else {
            stock = parseFloat(fila.querySelector('.var-stock').value) || 0;
        }
        
        if (medida && !isNaN(precio)) {
            variantes.push({ medida, precio, stock, cantPaneles });
        }
    });

    if (variantes.length === 0) return showAlert('Aviso', 'Agrega al menos una variante válida.', 'warning');

    const payload = { 
        userId: currentUser.uid, 
        nombre, 
        categoria, 
        descripcion, 
        fotoUrl, 
        variantes, 
        fechaActualizacion: new Date().toISOString() 
    };

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
    prod.variantes.forEach(v => agregarFilaVariante(v.medida, v.precio, v.stock, v.cantPaneles));

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
// MOVIMIENTOS RÁPIDOS (Lote)
// ==========================================
window.abrirModalMovimiento = function() {
    document.getElementById('tabla-lote-movimiento').querySelector('tbody').innerHTML = '';
    document.getElementById('mov-codigo-gen').value = '';
    document.getElementById('mov-num-dte').value = '';
    
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
    selectVar.innerHTML = '';
    if (!prodId) {
        selectVar.innerHTML = '<option value="">-- Seleccione producto --</option>';
        return;
    }
    const prod = productosCache.find(p => p.id === prodId);
    const esTermopanel = esCategoriaTermopanel(prod.categoria);
    
    prod.variantes.forEach((v, index) => {
        const stockMostrar = Number.isInteger(v.stock) ? v.stock : v.stock.toFixed(2);
        const unidad = esTermopanel ? 'mts' : 'uds';
        selectVar.innerHTML += `<option value="${index}">${v.medida} (Stock: ${stockMostrar} ${unidad})</option>`;
    });
};

window.registrarLoteMovimiento = async function() {
    const prodId = document.getElementById('mov-producto').value;
    const varIndex = document.getElementById('mov-variante').value;
    const tipo = document.getElementById('mov-tipo').value;
    const cantidad = parseFloat(document.getElementById('mov-cantidad').value);
    const codGen = document.getElementById('mov-codigo-gen').value.trim();
    const numDte = document.getElementById('mov-num-dte').value.trim();

    if (!prodId || varIndex === "" || isNaN(cantidad) || cantidad <= 0) {
        return showAlert('Aviso', 'Complete producto, variante y cantidad válida.', 'warning');
    }

    const prod = productosCache.find(p => p.id === prodId);
    let stockActual = prod.variantes[varIndex].stock;

    if (tipo === 'salida' && cantidad > stockActual) return showAlert('Aviso', 'Stock insuficiente.', 'warning');

    prod.variantes[varIndex].stock += (tipo === 'entrada' ? cantidad : -cantidad);
    
    try {
        await updateDoc(doc(db, "inventario", prodId), { variantes: prod.variantes });
        await addDoc(collection(db, "movimientos_inventario"), {
            userId: currentUser.uid, productoId: prodId, productoNombre: prod.nombre,
            medida: prod.variantes[varIndex].medida, tipo, cantidad,
            comentario: '', codigoGeneracion: codGen, numeroDTE: numDte, fecha: new Date().toISOString()
        });
        showAlert('Éxito', 'Movimiento registrado.', 'success');
        bootstrap.Modal.getInstance(document.getElementById('modal-movimiento')).hide();
        await cargarProductos();
    } catch (e) { showAlert('Error', e.message, 'danger'); }
};

// ==========================================
// COMPARTIR ENLACES (URLs LIMPIAS)
// ==========================================
window.copiarEnlacePublico = function() {
    const baseUrl = window.location.origin + window.location.pathname.replace('inventario.html', '');
    // Enlace al catálogo con stock y precios
    const publicUrl = `${baseUrl}stock.html`; 
    
    navigator.clipboard.writeText(publicUrl).then(() => {
        showAlert('Éxito', 'Enlace del catálogo con stock copiado.', 'success');
    });
};

window.copiarEnlacePublicoBasico = function() {
    const baseUrl = window.location.origin + window.location.pathname.replace('inventario.html', '');
    // Enlace al catálogo básico (solo medidas)
    const publicUrl = `${baseUrl}catalogo.html`;
    
    navigator.clipboard.writeText(publicUrl).then(() => {
        showAlert('Éxito', 'Enlace del catálogo básico copiado.', 'success');
    });
};
