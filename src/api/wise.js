const axios = require('axios');
require('dotenv').config({ path: '../../.env' });

//urls endpoints wise cx
const WISE_API_URL = process.env.WISE_API_URL || "https://api.wcx.cloud/core/v1";

/** 
 * @returns {Promise<string|null>}
*/
async function authenticateAndGetToken() {
    const wiseApiKeyAuth = process.env.WISE_AUTH_TOKEN;
    const wiseUser = process.env.WISE_USER;

    if (!wiseApiKeyAuth || !wiseUser) {
        console.error("Error de autenticacion WISE")
        return null;
        
    }

    try {
        const headers = {
            'x-api-key': wiseApiKeyAuth,
            'Content-Type': 'application/json'
        };

        const url = `${WISE_API_URL}/authenticate?user=${wiseUser}`;

        const response = await axios.get(url, { headers });
        console.log("Autenticacion existosa");
        return response.data.token;
        
    } catch (error) {
        console.error(`Error al autenticar en WISE: ${error.message}`);
        if (error.response) {
            console.error("Detalle del error:", error.response.data);
        }
        return null;     
    }
    
}

/**
 * @param {object} payload
 * @returns {Promise<object|null>}
 */
async function createCaseAndSend(payload) {
    //1.Obtener token
    const token = await authenticateAndGetToken();

    if (!token) {
        console.error("No se pudo obtener el token");
        return null;
        
    }

    //2.Llamada al endpoint
    const headers = {
        'x-api-key': process.env.WISE_AUTH_TOKEN,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };

    const url = `${WISE_API_URL}/cases`;

    try {
        const response = await axios.post(url, payload, { headers });
        console.log(`Exito. Wise CX Caso creado`);
        return response.data;
        
    } catch (error) {
        console.error(`Error al crear el caso: ${error.message}`);
        if (error.response){
            console.error("Detalle del error:", error.response.data);
            
        }
        return null;
        
    }
    

}

module.exports = {
    authenticateAndGetToken,
    createCaseAndSend
};