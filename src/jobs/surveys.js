const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const moment = require('moment');
const domusApi = require('../api/domus');
const wiseApi = require ('../api/wise');

const INMOBILIARIAS = ['bienco', 'uribienes', 'las_vegas'];

async function sendSurveys() {
    console.log("Iniciando tarea programada de envío de encuestas de satisfacción...");

    const horaActual = moment().format('YYYY-MM-DD HH:mm:ss');
    const horaAnterior = moment().subtract(1, 'hour').format('YYYY-MM-DD HH:mm:ss');

    // Analiza los IDs numéricos del archivo .env y los verifica
    const groupId = parseInt(process.env.WISE_GROUP_ID, 10);
    const templateId = parseInt(process.env.WISE_TEMPLATE_ID_ENCUESTA, 10);
    
    if (isNaN(groupId) || isNaN(templateId)) {
        console.error("Error: WISE_GROUP_ID o WISE_TEMPLATE_ID_ENCUESTA no son números válidos en el archivo .env.");
        console.error(`Valores leídos: WISE_GROUP_ID='${process.env.WISE_GROUP_ID}', WISE_TEMPLATE_ID_ENCUESTA='${process.env.WISE_TEMPLATE_ID_ENCUESTA}'`);
        return;
    }

    // Itera sobre cada inmobiliaria para procesar sus citas
    for (const inmobiliaria of INMOBILIARIAS) {
        console.log(`\n--- Procesando citas concluidas para la inmobiliaria: ${inmobiliaria.toUpperCase()} ---`);

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
    try {
        const cliente = (cita.person && cita.person.length > 0) ? cita.person[0] : null;

        if (!cliente || !cliente.phone) {
            console.warn(`⚠️ Cita con ID ${cita.meeting_id} no tiene un número de teléfono válido. Se omite la encuesta.`);
            return;
        }

        const telefono = cliente.phone.replace(/[\s-+,]/g, '');
        const nombreCliente = cliente.name || "Cliente";
        const brokerName = (cita.broker && cita.broker.broker_name) ? cita.broker.broker_name : "el asesor";

        const payload = {
            group_id: groupId,
            source_channel: "whatsapp",
            subject: `Encuesta de Satisfacción - ${nombreCliente}`,
            tags: ["encuesta", "domus"],
            type_id: 0,
            activities: [{
                type: "user_reply",
                user_id: parseInt(process.env.WISE_USER_ID, 10),
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
                    phone: telefono
                }]
            }],
            custom_fields: [{
                field: "fecha_cita",
                value: cita.start_date
            }, {
                field: "id_cita_domus",
                value: String(cita.meeting_id)
            }, {
                field: "inmobiliaria",
                value: inmobiliaria
            }]
        };
        
        const response = await wiseApi.createCaseAndSendTemplate(payload);

        if (response) {
            console.log(`✅ Encuesta de satisfacción enviada exitosamente para la cita ${cita.meeting_id}.`);
        } else {
            console.error(`❌ Falló el envío de la encuesta para la cita ${cita.meeting_id}.`);
        }
    } catch (error) {
        console.error(`Ocurrió un error inesperado al procesar la cita ${cita.meeting_id}:`, error);
    }
}

module.exports = {
    sendSurveys
};