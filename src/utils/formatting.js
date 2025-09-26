/**
 * Convierte una cadena a formato título (Capitaliza la primera letra de cada palabra).
 * @param {string} str La cadena a capitalizar (ej: "juan perez" o "MARIA LOPEZ").
 * @returns {string} La cadena capitalizada (ej: "Juan Perez").
 */
function capitalizeWords(str) {
    if (!str) return '';
    
    return str.toLowerCase().split(' ').map(word => {
        if (!word) return '';
        // Capitaliza la primera letra y concatena el resto
        return word.charAt(0).toUpperCase() + word.slice(1);
    }).join(' ');
}

// Exporta la función usando module.exports
module.exports = {
    capitalizeWords
};