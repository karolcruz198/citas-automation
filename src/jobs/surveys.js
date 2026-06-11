const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const moment = require('moment');
const domusApi = require('../api/domus');
const wiseApi = require ('../api/wise');

const INMOBILIARIAS = ['bienco', 'uribienes', 'las_vegas'];

const { getBrandName, getCityFromBranchName } = require('../utils/brands');
const { capitalizeWords } = require('../utils/formatting');

async function sendSurveys() {
    console.log("Iniciando tarea programada de envío de encuestas de satisfacción...");

    const horaActual = moment().format('YYYY-MM-DD HH:mm:ss');

    for (const inmobiliaria of INMOBILIARIAS) {
        console.log(`\n--- Procesando citas concluidas para la inmobiliaria: ${inmobiliaria.toUpperCase()} ---`);

        const envVarNameGrupo = `WISE_GROUP_ID_ENCUESTA_${inmobiliaria.toUpperCase()}`;
        const groupId = parseInt(process.env[envVarNameGrupo], 10);

        const envVarNameUser = `WISE_USER_ID_${inmobiliaria.toUpperCase()}`;
        const userId = parseInt(process.env[envVarNameUser], 10);

        const envVarName = `WISE_TEMPLATE_ID_ENCUESTA_${inmobiliaria.toUpperCase()}`;
        const templateId = parseInt(process.env[envVarName], 10);

        if (isNaN(groupId) || isNaN(templateId) || isNaN(userId)) {
            console.error(`Error: Las variables para ${inmobiliaria.toUpperCase()} no están configuradas correctamente.`);
            continue;
        }

        try {
            const citasConcluidas = await domusApi.getConcludedMeetings(inmobiliaria, horaActual);

            if (!citasConcluidas || citasConcluidas.length === 0) {
                console.log("No se encontraron citas concluidas en la última hora. Siguiente inmobiliaria.");
                continue;
            }

            console.log(`Se encontraron ${citasConcluidas.length} citas. Enviando encuestas...`);

            for (const cita of citasConcluidas) {
                try {
                    const detalleCita = await domusApi.getMeetingDetail(inmobiliaria, cita.id);

                    if (detalleCita) {
                        await createAndSendWiseSurveyCase(detalleCita, groupId, templateId, inmobiliaria, userId);
                    } else {
                        console.warn(`⚠️ No se pudo obtener el detalle de la cita con ID ${cita.id}. Se omite.`);
                    }
                } catch (err) {
                    console.error(`❌ Falló al obtener detalles de la cita ${cita.id} en ${inmobiliaria}:`, err.message);
                    continue;
                }
            }
        } catch (error) {
            console.error(`❌ Falló la obtención de citas para la inmobiliaria ${inmobiliaria}:`, error.message);
            continue;
        }
    }

    console.log("\nTarea de encuestas finalizada.");
}

async function createAndSendWiseSurveyCase(detalleCita, groupId, templateId, inmobiliaria, userId) {
    const cliente = detalleCita.contact || null;
    let telefono = null;

    if (cliente) {
        if (cliente.phone) {
            telefono = cliente.phone;
        }
        else if (Array.isArray(cliente.phones) && cliente.phones.length > 0) {
            telefono = cliente.phones[0].phone;
        }
    }

    if (!telefono) {
        console.warn(`⚠️ Cita ${detalleCita.id} omitida. No se encontró el teléfono.`);
        return;
    } 

    const telefonoFormateado = wiseApi.formatPhoneNumber(telefono);

    const nombreCompletoFormateado = capitalizeWords(cliente.full_name || '').trim();

    let nombreCliente;
    if (nombreCompletoFormateado) {
        nombreCliente = nombreCompletoFormateado;
    } else {
        const nombre = capitalizeWords(cliente.name || '');
        const apellido = capitalizeWords(cliente.last_name || '');
        
        nombreCliente = `${nombre} ${apellido}`.trim();
    }
    
    if (!nombreCliente) {
        nombreCliente = "Cliente";
    }

    const property = Array.isArray(detalleCita.detailProperties) ? detalleCita.detailProperties[0] : null;
    const brokerObj = property?.broker?.[0] || property?.brokers?.[0] || null;
    const brokerName = brokerObj?.name || "Asesor asignado";
    const brokerId = brokerObj?.code ? String(brokerObj.code) : "N/A";

    const marcaSpa = getBrandName(inmobiliaria);

    let cityName = "";
    const propertyDetails = detalleCita.detailProperties;
    if (propertyDetails && propertyDetails.length > 0 && propertyDetails[0].city) {
        cityName = propertyDetails[0].city;
    } else if (marcaSpa.toLowerCase() === "bienco") {
        cityName = getCityFromBranchName(detalleCita.branch?.name) || "Bienco";
    } else {
        cityName = "Antioquia";
    }

    //Obtener Nombre del Asesor (rol 'Anfitrión')
    let nombreAsesor = "";
    if (Array.isArray(detalleCita.profiles)) {
        const anfitrion = detalleCita.profiles.find(p => p.role?.name === "Anfitrión" || p.role?.id === 1);
        if (anfitrion && anfitrion.profile) {
            nombreAsesor = anfitrion.profile.full_name || `${anfitrion.profile.name} ${anfitrion.profile.last_name}`.trim();
        } else if (detalleCita.profiles[0]?.profile) {
            // Por si no encuentra un rol explícito, toma el primer perfil como respaldo
            nombreAsesor = detalleCita.profiles[0].profile.full_name || "";
        }
    }

    //Obtener Código de Cita
    const codigoCita = detalleCita.code ? String(detalleCita.code) : "";

    //Obtener Código Web
    let codigoWeb = "";
    if (Array.isArray(detalleCita.detailProperties) && detalleCita.detailProperties.length > 0) {
        codigoWeb = detalleCita.detailProperties[0].codpro ? String(detalleCita.detailProperties[0].codpro) : "";
    }

    const payload = {
        group_id: groupId,
        user_id: userId,
        source_channel: "outgoing_whatsapp",
        subject: `Encuesta de Satisfacción - ${nombreCliente}`,
        tags: ["Creado por API", "Domus - Encuesta"],
        custom_fields: [
            { "field": "email_1", "value": detalleCita.date },
            { "field": "email_2", "value": String(detalleCita.id) },
            { "field": "email_3", "value": brokerName },
            { "field": "marca_spa", "value": marcaSpa },
            { field: "nombre_asesor", value: nombreAsesor },
            { field: "codigo_cita", value: codigoCita },
            { field: "codigo_web", value: codigoWeb }
        ],
        type_id: 0,
        activities: [{
            type: "user_reply",
            user_id: 0,
            channel: "outgoing_whatsapp",
            template: {
                template_id: templateId,
                parameters: [
                    { key: "1", value: nombreCliente },
                    { key: "2", value: brokerName }
                ]
            },
            contacts_to: [{
                name: nombreCliente,
                phone: telefonoFormateado,
                city: cityName
            }]
        }]
    };

    try {
        console.log(`Intentando crear caso de encuesta para la cita ${detalleCita.id}...`);
        const response = await wiseApi.createCaseAndSend(payload, null);
        const caseId = response?.case_id;

        if (response && caseId) {
            console.log(`✅ Encuesta de satisfacción enviada exitosamente para la cita ${detalleCita.id}.`);
            await wiseApi.updateCaseStatus(caseId, 'solved');
            console.log(`✅ Caso ${caseId} actualizado a estado resuelto.`);

        } else if (response?.error === 'OPEN_CASES_EXIST' && response?.opened_cases?.length > 0) {
            const openCaseId = response.opened_cases[0];
            console.log(`⚠️ Ya existe un caso abierto (${openCaseId}). Cerrándolo...`);

            await wiseApi.updateCaseStatus(openCaseId, 'closed');
            console.log(`✅ Caso ${openCaseId} cerrado exitosamente.`);

            console.log(`🔄 Reintentando creación del caso...`);
            const retryResponse = await wiseApi.createCaseAndSend(payload, null);
            const retryCaseId = retryResponse?.case_id;

            if (retryResponse && retryCaseId) {
                console.log(`✅ Encuesta reenviada exitosamente para la cita ${detalleCita.id}.`);
                await wiseApi.updateCaseStatus(retryCaseId, 'solved');
            } else {
                console.error(`Falló el reintento de la encuesta para la cita ${detalleCita.id}.`);
            }
        } else {
            console.error(`Falló el envío de la encuesta para la cita ${detalleCita.id}.`, response);
        }
    } catch (error) {
        const errorData = error.response ? error.response.data : null;
        console.error(`Falló el intento inicial de crear el caso de encuesta. Es probable que ya exista uno.`, errorData || error.message);

    }
}

module.exports = {
    sendSurveys,
    createAndSendWiseSurveyCase
};

//Para que el script se ejecute al ser llamado por cron
if (require.main === module) {
    sendSurveys();
}