const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const moment = require('moment');
const domusApi = require('../api/domus');
const wiseApi = require ('../api/wise');

const INMOBILIARIAS = ['bienco', 'uribienes', 'las_vegas'];

const { getBrandName } = require('../utils/brands');

async function sendSurveys() {
    console.log("Iniciando tarea programada de envío de encuestas de satisfacción...");

    const horaActual = moment().format('YYYY-MM-DD HH:mm:ss');
    const horaAnterior = moment().subtract(1, 'hour').format('YYYY-MM-DD HH:mm:ss');

    // Analiza los IDs numéricos del archivo .env y los verifica
    const groupId = parseInt(process.env.WISE_GROUP_ID, 10);
    
    if (isNaN(groupId)) {
        console.error("Error: WISE_GROUP_ID no es un número válido");
    }

    for (const inmobiliaria of INMOBILIARIAS) {
        console.log(`\n--- Procesando citas concluidas para la inmobiliaria: ${inmobiliaria.toUpperCase()} ---`);

        const envVarName = `WISE_TEMPLATE_ID_ENCUESTA_${inmobiliaria.toUpperCase()}`;
        const templateId = parseInt(process.env[envVarName], 10);

        if (isNaN(templateId) || templateId === 0) {
            console.warn(`⚠️ La variable de entorno '${envVarName}' no está definida o es 0. Se omite el envío de encuestas para esta inmobiliaria.`);
            continue;
        }

        try {
            const response = await domusApi.getConcludedMeetings(inmobiliaria, horaAnterior, horaActual);
            const citasConcluidas = response.data.data;

            if (!citasConcluidas || citasConcluidas.length === 0) {
                console.log("No se encontraron citas concluidas en la última hora. Siguiente inmobiliaria.");
                continue;
            }

            console.log(`Se encontraron ${citasConcluidas.length} citas. Enviando encuestas...`);

            for (const cita of citasConcluidas) {
                await createAndSendWiseSurveyCase(cita, groupId, templateId, inmobiliaria);
            }
        } catch (error) {
            console.error(`❌ Falló la obtención de citas para la inmobiliaria ${inmobiliaria}:`, error.message);
            continue;
        }
    }

    console.log("\nTarea de encuestas finalizada.");
}

async function createAndSendWiseSurveyCase(cita, groupId, templateId, inmobiliaria) {
    const cliente = (cita.person && cita.person.length > 0) ? cita.person[0] : null;

    if (!cliente || !cliente.phone) {
        console.warn(`⚠️ Cita con ID ${cita.meeting_id} no tiene un número de teléfono válido. Se omite la encuesta.`);
        return;
    }   

    const telefono = wiseApi.formatPhoneNumber(cliente.phone);
    const nombreCliente = cliente.name || "Cliente";
    const brokerName = (cita.broker && cita.broker.broker_name) ? cita.broker.broker_name : "el asesor";
    const brokerId = (cita.broker && cita.broker.broker_id) ? String(cita.broker.broker_id) : "N/A";
    const marcaSpa = getBrandName(inmobiliaria);

    const cityName = (inmobiliaria === 'bienco' && cita.branch)
        ? await domusApi.getCityByBranchName(inmobiliaria, cita.branch)
        : 'Antioquia';

    const payload = {
        group_id: groupId,
        source_channel: "whatsapp",
        subject: `Encuesta de Satisfacción - ${nombreCliente}`,
        tags: ["Creado por API", "Domus - Encuesta"],
        custom_fields: [
            { "field": "email_1", "value": cita.start_date },
            { "field": "email_2", "value": cita.meeting_id },
            { "field": "email_3", "value": brokerName },
            { "field": "marca_spa", "value": marcaSpa }
        ],
        type_id: 0,
        activities: [{
            type: "user_reply",
            channel: "whatsapp",
            template: {
                template_id: templateId,
                parameters: [
                    { key: "1", value: nombreCliente },
                    { key: "2", value: brokerName }
                ]
            },
            contacts_to: [{
                name: nombreCliente,
                phone: telefono,
                city: cityName
            }]
        }]
    };

    try {
        console.log(`Intentando crear caso de encuesta para la cita ${cita.meeting_id}...`);
        const response = await wiseApi.createCaseAndSend(payload, null);
        const caseId = response?.case_id;

        if (response && caseId) {
            console.log(`✅ Encuesta de satisfacción enviada exitosamente para la cita ${cita.meeting_id}.`);
            await wiseApi.updateCaseStatus(caseId, 'solved');
            console.log(`✅ Caso ${caseId} actualizado a estado resuelto.`);
        } else {
            console.error(`❌ Falló el envío de la encuesta para la cita ${cita.meeting_id}. No se recibió una respuesta exitosa.`);
        }
    } catch (error) {
        const errorData = error.response ? error.response.data : null;
        console.error(`❌ Falló el intento inicial de crear el caso de encuesta. Es probable que ya exista uno.`, errorData || error.message);

        try {
            let openCaseId = null;

            if (errorData?.error === 'OPEN_CASES_EXIST' && errorData?.opened_cases?.length > 0) {
                openCaseId = errorData.opened_cases[0];
                console.log(`✅ ID de caso abierto obtenido directamente del error: ${openCaseId}.`);
            }

            if (!openCaseId) {
                console.log(`❌ No se encontró ID de caso abierto en el error. Iniciando lógica de búsqueda...`);
                const contact = await wiseApi.getContactIdByPhone(telefono);
                const contactId = contact?.id;

                if (contactId) {
                    openCaseId = await wiseApi.getOpenCaseIdByContactId(contactId);
                }
            }

            if (openCaseId) {
                console.log(`✅ Caso abierto encontrado o capturado. ID: ${openCaseId}. Cerrando caso...`);
                await wiseApi.updateCaseStatus(openCaseId, 'closed');
            } else {
                console.log(`⚠️ No se pudo encontrar un caso abierto para cerrar. Intentando reintentar...`);
            }

            console.log(`Reintentando la creación del caso...`);
            const retryResponse = await wiseApi.createCaseAndSend(payload, null);
            const retryCaseId = retryResponse?.case_id;

            if (retryResponse && retryCaseId) {
                console.log(`✅ Encuesta enviada exitosamente después de la recuperación para la cita ${cita.meeting_id}.`);
                await wiseApi.updateCaseStatus(retryCaseId, 'closed');
            } else {
                console.error(`❌ Falló el reintento de envío de la encuesta para la cita ${cita.meeting_id}.`);
            }
        } catch (recoveryError) {
            console.error(`❌ Error crítico durante el proceso de recuperación y reintento para la cita ${cita.meeting_id}:`, recoveryError.response ? recoveryError.response.data : recoveryError.message);
        }
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