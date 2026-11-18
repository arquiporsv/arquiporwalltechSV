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
