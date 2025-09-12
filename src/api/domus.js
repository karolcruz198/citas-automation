const axios = require('axios');
const moment = require('moment');

require('dotenv').config({ path: '../../.env' });

/**
 * @param {string} inmobiliaria
 * @param {string} apiType
 * @param {string} endpoint
 * @param {object} params
 * @param {object} extraHeaders
 * @returns {Promise<object|null>}
 */

async function getFromDomus(inmobiliaria, apiType, endpoint, params, extraHeaders = {}) {
    let baseUrl;
    let authHeaderValue;

    switch (apiType) {
        case 'citas':
            baseUrl = process.env.DOMUS_API_URL;
            break;
        case 'reports':
            baseUrl = process.env.DOMUS_REPORTS_URL;
            break;
        case 'owners':
            baseUrl = process.env.DOMUS_OWNERS_URL;
            break;
        default:
            console.error(`Error: Tipo de API desconocido: '${apiType}'.`);
            return null;
    }

    const keyVariableName = (apiType === 'reports') ? 
        `DOMUS_KEY_REPORTS_${inmobiliaria.toUpperCase()}` :
        `DOMUS_KEY_CITAS_${inmobiliaria.toUpperCase()}`;

    const apiKey = process.env[keyVariableName];

    if (!apiKey || !baseUrl) {
        console.error(`Error: Credenciales no encontradas para la inmobiliaria '${inmobiliaria}' y tipo de API '${apiType}'.`);
        return null;
    }

    const headers = {
        'Authorization': apiKey,
        'Content-Type': 'application/json',
        'Inmobiliaria': 1,
        ...extraHeaders
    };

    try {
        const url = `${baseUrl}${endpoint}`;
        const response = await axios.get(url, { params, headers });
        console.log(`Éxito: Consulta GET a ${url} para ${inmobiliaria} realizada.`);
        return response.data;

    } catch (error) {
        console.error(`Error en la consulta GET a la API de Domus para ${inmobiliaria}: ${error.message}`);
        if (error.response) {
            console.error("Detalle del error:", error.response.data);
        }
        return null;
        
    }
    
}

async function postToDomus(inmobiliaria, endpoint, data) {
    const baseUrl = process.env.DOMUS_REPORTS_URL;
    const apiKey = process.env[`DOMUS_KEY_REPORTS_${inmobiliaria.toUpperCase()}`];


    if (!apiKey || !baseUrl) {
        console.error(`Error: Credenciales no encontradas para la inmobiliaria '${inmobiliaria}' y tipo de API '${apiType}'.`);
        return null;
    }

    const headers = {
        'Authorization': apiKey,
        'Content-Type': 'application/json'
    };

    try {
        const url = `${baseUrl}${endpoint}`;
        const response = await axios.post(url, data, { headers });
        console.log(`Éxito: Consulta POST a ${url} para ${inmobiliaria} realizada.`);
        return response.data;
    } catch (error) {
        console.error(`Error en la consulta POST a la API de Domus para ${inmobiliaria}: ${error.message}`);
        if (error.response) {
            console.error("Detalle del error:", error.response.data);
        }
        return null;
    }
}

async function getMeetingsForDay(inmobiliaria, date) {
    const today = moment(date).format('YYYY-MM-DD');
    const params = {
        start_date: `${today} 00:00:00`,
        end_date: `${today} 23:59:59`
    };
    return getFromDomus(inmobiliaria, 'citas', 'meetings', params);
    
}

async function getConcludedMeetings(inmobiliaria, startTime, endTime) {
    const params = {
        start_date: startTime,
        end_date: endTime
        
    };
    return getFromDomus(inmobiliaria, 'citas', 'meetings', params);
}


async function getWeeklyMeetings(inmobiliaria) {
    const fechaFin = moment().format('YYYY-MM-DD');
    const fechaInicio = moment().startOf('week').format('YYYY-MM-DD');
    
    const params = {
        start_date: `${fechaInicio} 00:00:00`,
        end_date: `${fechaFin} 23:59:59`
    };

    return getFromDomus(inmobiliaria, 'citas', 'meetings', params);
    
}

async function getOwnerDetails(inmobiliaria, propertyCode) {
    try {
    
        const listResponse = await getFromDomus(inmobiliaria, 'owners', 'owners', { codpro: propertyCode });

        if (!listResponse || !listResponse.data || listResponse.data.length === 0) {
            console.warn(`AVISO: No se encontraron datos de propietario para el código de propiedad ${propertyCode}.`);
            return null;
        }

        const ownerDocument = listResponse.data[0].document;
        
        const detailResponse = await getFromDomus(inmobiliaria, 'owners', `owners/${ownerDocument}`);

        if (!detailResponse || !detailResponse.data) {
            console.warn(`AVISO: No se encontraron detalles para el propietario con documento ${ownerDocument}.`);
            return null;
        }

        return detailResponse.data;

    } catch (error) {
        console.error(`Error en el flujo de obtención de datos del propietario para ${propertyCode}: ${error.message}`);
        return null;
    }
   
}

async function getOwnerLink(inmobiliaria, property_idpro, startDate, endDate) {
    try {
        const DOMUS_REPORTS_URL = process.env.DOMUS_REPORTS_URL;
        const domusReportsApiKey = process.env[`DOMUS_KEY_REPORTS_${inmobiliaria.toUpperCase()}`];
        
        if (!domusReportsApiKey || !DOMUS_REPORTS_URL) {
            console.error(`Error: No se encontró la API Key o la URL de reportes para ${inmobiliaria}.`);
            return null;
        }

        const url = `${DOMUS_REPORTS_URL}/owner/link`;
        
        const headers = {
            'Authorization': domusReportsApiKey,
            'Content-Type': 'application/json'
        };

        const body = {
            property: {
                id: String(property_idpro)
            },
            start_date: startDate,
            end_date: endDate
        };
        
        console.log("Enviando solicitud POST para obtener el enlace del reporte...");
        //console.log(`URL de la solicitud: ${url}`);
        //console.log(`Body de la solicitud: ${JSON.stringify(body, null, 2)}`);

        const response = await axios.post(url, body, { headers });
        
        return response;

    } catch (error) {
        console.error(`Error en la consulta POST a la API de Domus para ${inmobiliaria}: ${error.message}`);
        if (error.response) {
            console.error("Detalle del error:", error.response.data);
        }
        return null;
    }
}

async function getCityByBranchName(inmobiliaria, branchName) {
    try {
        const response = await getFromDomus(inmobiliaria, 'owners', 'administrative/branches', {});

        if (!response || !response.data) {
            console.warn(`AVISO: No se pudieron obtener los datos de sucursales para ${inmobiliaria}.`);
            return null;
        }

        const branchData = response.data.find(branch => branch.name === branchName);

        if (branchData && branchData.city_name) {
            return branchData.city_name.trim();
        }

        console.warn(`AVISO: No se encontró la ciudad para la sucursal '${branchName}' en ${inmobiliaria}.`);
        return null;
    } catch (error) {
        console.error(`Error al obtener la ciudad de la sucursal ${branchName} para ${inmobiliaria}:`, error.message);
        return null;
    }
}

/**
 * @param {string} inmobiliaria
 * @returns {Array<object>}
 */
async function getProperties(inmobiliaria) {
    try {
        const extraHeaders = {
            'Perpage': 50
        };

        const response = await getFromDomus(inmobiliaria, 'owners', 'properties', {}, extraHeaders);

        if (response && response.data) {
            console.log(`✅ Se obtuvieron ${response.data.length} inmuebles para ${inmobiliaria}.`);
            return response.data;
        } else {
            console.warn(`AVISO: No se encontraron inmuebles para ${inmobiliaria}.`);
            return [];
        }
    } catch (error) {
        console.error(`❌ ERROR en la función getProperties para ${inmobiliaria}:`, error.message);
        return [];
    }
}

module.exports = {
    getFromDomus,
    postToDomus,
    getMeetingsForDay,
    getConcludedMeetings,
    getWeeklyMeetings,
    getOwnerDetails,
    getOwnerLink,
    getCityByBranchName,
    getProperties
};