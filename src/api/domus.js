const axios = require('axios');
const moment = require('moment-timezone');

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
    let apiKey;

    switch (apiType) {
        case 'citas':
            baseUrl = process.env.DOMUS_CRM_BASE_URL;
            apiKey = process.env[`DOMUS_API_KEY_CRM_${inmobiliaria.toUpperCase()}`];
            break;
        case 'owners':
            baseUrl = process.env.DOMUS_OWNERS_URL;
            apiKey = process.env[`DOMUS_KEY_OWNERS_${inmobiliaria.toUpperCase()}`];
            break;
        case 'reports':
            baseUrl = process.env.DOMUS_CRM_BASE_URL;
            apiKey = process.env[`DOMUS_API_KEY_CRM_${inmobiliaria.toUpperCase()}`];
            break;
        default:
            console.error(`Error: Tipo de API desconocido: '${apiType}'.`);
            return null;
    }

     if (!apiKey || !baseUrl) {
        console.error(`Error: Credenciales no encontradas para la inmobiliaria '${inmobiliaria}' y tipo de API '${apiType}'.`);
        return null;
    }

    const headers = {
        'Authorization': apiKey,
        ...extraHeaders
    };

    try {
        const url = new URL(endpoint, baseUrl).toString();
        //console.log(`Parámetros para la llamada a ${inmobiliaria}:`, params);
        const response = await axios.get(url, { params, headers });
        console.log(`✅ GET ${url} para ${inmobiliaria}`);
        //console.log("Respuesta completa de Axios:", response);
        return response.data;

    } catch (error) {
        console.error(`❌ Error GET Domus (${inmobiliaria}): ${error.message}`);
        if (error.response) {
        console.error("Detalle del error:", error.response.data);
        }
        return null;
            
    }
    
}

async function postToDomus(inmobiliaria, endpoint, data) {
    const baseUrl = process.env.DOMUS_CRM_BASE_URL;
    const apiKey = process.env[`DOMUS_API_KEY_CRM_${inmobiliaria.toUpperCase()}`];


    if (!apiKey || !baseUrl) {
        console.error(`Error: Credenciales no encontradas para la inmobiliaria '${inmobiliaria}'.`);
        return null;
    }

    const headers = {
        'Authorization': apiKey
    };

    try {
        const url = new URL(endpoint, baseUrl).toString();
        const response = await axios.post(url, data, { headers });
        console.log(`✅ POST ${url} para ${inmobiliaria}`);
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
  const params = { startDate: today, endDate: today };

  const typeIds = getAppointmentTypeIds(inmobiliaria);
  if (typeIds.length > 0) {
    params.type = typeIds.join(',');
  }

  const appointments = await getFromDomus(inmobiliaria, 'citas', 'api/public/appointments', params);
  return Array.isArray(appointments) ? appointments : [];
}

async function getConcludedMeetings(inmobiliaria, date) {
    const today = moment(date).tz("America/Bogota").format('YYYY-MM-DD');
    const params = {
        startDate: today,
        endDate: today
    };

    const typeIds = getAppointmentTypeIds(inmobiliaria);
    if (typeIds.length > 0) {
        params.type = typeIds.join(',');
    }
    
    const appointments = await getFromDomus(inmobiliaria, 'citas', 'api/public/appointments', params);

    if (!Array.isArray(appointments)) {
        console.error("Error: La respuesta de la API no es un array válido de citas.");
        return [];
    }

    const now = moment().tz("America/Bogota");
    console.log(`Hora actual de la prueba: ${now.format('YYYY-MM-DD HH:mm:ss')}`);

    const startOfRange = now.clone().startOf("hour");
    const previousHour = now.clone().subtract(1, "hour").startOf("hour");    

    const concludedMeetings = appointments.filter(appointment => {
        const appointmentEnd = moment.tz(
            `${appointment.date} ${appointment.end_time}`,
            "YYYY-MM-DD HH:mm:ss",
            "America/Bogota"
        );
        
        return (
            appointmentEnd.isAfter(previousHour) &&       // terminó después de la hora anterior
            appointmentEnd.isSameOrBefore(now) &&        // y antes o igual a la hora actual
            appointment.status !== "Cancelada" &&        // excluir canceladas
            appointment.status !== "Reprogramada"      // excluir reprogramadas
        );
    });

    return concludedMeetings;
}

async function getWeeklyMeetings(inmobiliaria) {
    const today = moment().tz("America/Bogota");
    const startOfWeek = today.clone().isoWeekday(1).format('YYYY-MM-DD');
    const endOfWeek = today.clone().isoWeekday(6).format('YYYY-MM-DD');
    
    const params = {
        startDate: startOfWeek,
        endDate: endOfWeek
    };

    const typeIds = getAppointmentTypeIds(inmobiliaria);
    if (typeIds.length > 0) {
        params.type = typeIds.join(',');
    }

    return getFromDomus(inmobiliaria, 'citas', 'api/public/appointments', params);
    
}

async function getOwnerDetails(inmobiliaria, propertyCode) {
    try {
    
        const listResponse = await getFromDomus(inmobiliaria, 'owners', 'owners', { codpro: propertyCode });

        if (!listResponse || !listResponse.data || listResponse.data.length === 0) {
            console.warn(`AVISO: No se encontraron datos de propietario para el código de propiedad ${propertyCode}.`);
            return null;
        }

        const owner = listResponse.data[0];
        const ownerDocument = owner.document;

        const detailResponse = await getFromDomus(inmobiliaria, 'owners', `owners/${ownerDocument}`);

        if (!detailResponse || !detailResponse.data) {
            console.warn(`AVISO: No se encontraron detalles para el propietario con documento ${ownerDocument}.`);
            return null;
        }

        const detailData = detailResponse.data;

        const phone =
            (Array.isArray(detailData.phones) && detailData.phones.length > 0 && detailData.phones[0].number) ||
            (Array.isArray(owner.phones) && owner.phones.length > 0 && owner.phones[0].number) ||
            null;

        const email = detailData.email || owner.email || null;

        return {
            ...detailData,
            phone,
            email
        };

    } catch (error) {
        console.error(`Error en el flujo de obtención de datos del propietario para ${propertyCode}: ${error.message}`);
        return null;
    }
   
}

async function getOwnerLink(inmobiliaria, property_idpro, startDate, endDate) {
    try {
        const baseUrl = process.env.DOMUS_CRM_BASE_URL;
        const apiKey = process.env[`DOMUS_API_KEY_CRM_${inmobiliaria.toUpperCase()}`];
        
        if (!apiKey || !baseUrl) {
            console.error(`Error: No se encontró la API Key o la URL de reportes para ${inmobiliaria}.`);
            return null;
        }

        const url = `${baseUrl}/api/public/owner/link`;
        
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
        
        //console.log(`📤 POST ${url} para ${inmobiliaria} con body:`, body);

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

async function getMeetingDetail(inmobiliaria, meetingId) {
    try {
        const response = await getFromDomus(
            inmobiliaria,
            'citas',
            `api/public/appointments/${meetingId}`,
            {}
        );

        if (!response || !response.data) {
            console.warn(`⚠️ No se encontraron datos de cita ${meetingId} para ${inmobiliaria}.`);
            return null;
        }

        // Retorna el objeto completo tal cual lo entrega la API
        return response.data;
    } catch (error) {
        console.error(`❌ Error al obtener detalle de cita ${meetingId} para ${inmobiliaria}:`, error.message);
        return null;
    }
}
function getAppointmentTypeIds(inmobiliaria) {
  const envVar = process.env[`APPOINTMENT_TYPE_IDS_${inmobiliaria.toUpperCase()}`];
  if (!envVar) {
    console.warn(`Advertencia: No se encontraron IDs para la inmobiliaria '${inmobiliaria}'.`);
    return [];
  }
  return envVar.split(',').map(id => parseInt(id.trim(), 10));
}

module.exports = {
    getFromDomus,
    postToDomus,
    getMeetingsForDay,
    getConcludedMeetings,
    getWeeklyMeetings,
    getOwnerDetails,
    getOwnerLink,
    getProperties,
    getMeetingDetail
};