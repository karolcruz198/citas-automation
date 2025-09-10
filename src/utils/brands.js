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

module.exports = {
    getBrandName
};