/**
 * @param {string} inmobiliaria
 * @returns {string} 
 */
function getBrandName(inmobiliaria) {
    switch (inmobiliaria) {
        case 'bienco':
            return 'bienco';
        case 'uribienes':
            return 'uribienes';
        case 'las_vegas':
            return 'las vegas';
        default:
            return inmobiliaria;
    }
}

/**
 * Extrae el nombre de la ciudad de una cadena de texto.
 * Ejemplo: "Bienco Pereira" -> "Pereira"
 *
 * @param {string} branchName
 * @returns {string | null}
 */
function getCityFromBranchName(branchName) {
    if (!branchName) {
        return null;
    }
    const parts = branchName.split(' ');
    return parts.length > 1 ? parts[1].trim() : null;
}

module.exports = {
    getBrandName,
    getCityFromBranchName
};