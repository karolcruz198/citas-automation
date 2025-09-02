const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const moment = require('moment');
const domusApi = require('../api/domus');
const wiseApi = require ('../api/wise');

// Lista de las inmobiliarias a procesar.
const INMOBILIARIAS = ['bienco', 'uribienes', 'las_vegas'];

async function sendDailyReminders() {
    console.log("Iniciando tarea recordatorio citas");

    const hoy = moment().format('YYYY-MM-DD');

    // Analiza los IDs numéricos del archivo .env y los verifica
    const groupId = parseInt(process.env.WISE_GROUP_ID, 10);
    const templateId = parseInt(process.env.WISE_TEMPLATE_ID_RECORDATORIO, 10);

    // Verificamos si la conversión fue exitosa
    if (isNaN(groupId) || isNaN(templateId)) {
        console.error("Error: WISE_GROUP_ID o WISE_TEMPLATE_ID_RECORDATORIO no son números válidos en el archivo .env.");
        console.error(`Valores leídos: WISE_GROUP_ID='${process.env.WISE_GROUP_ID}', WISE_TEMPLATE_ID_RECORDATORIO='${process.env.WISE_TEMPLATE_ID_RECORDATORIO}'`);
        return; // Detenemos la ejecución si los IDs no son válidos
    }
    
    for (const inmobiliaria of INMOBILIARIAS) {
        console.log(`\n--- Procesando citas para la inmobiliaria: ${inmobiliaria.toUpperCase()} ---`);
        
        try {
            const response = await domusApi.getMeetingsForDay(inmobiliaria, hoy);
            const citasHoy = response.data.data; // Acceso correcto a los datos de la API
    
            if (!citasHoy || citasHoy.length === 0) {
                console.log("No se encontraron citas para hoy. Siguiente inmobiliaria.");
                continue;
            }
            
            console.log(`Se encontraron ${citasHoy.length} citas. Enviando recordatorios...`);
    
            for (const cita of citasHoy) {
                // Se envía cada cita sin filtro de estado
                await createAndSendWiseCase(cita, groupId, templateId);
            }
        } catch (error) {
            console.error(`❌ Falló la obtención de citas para la inmobiliaria ${inmobiliaria}:`, error.message);
            continue;
        }
    }

    console.log("Tarea de recordatorios finalizada");
}

async function createAndSendWiseCase(cita, groupId, templateId) {
    try {
        const cliente = (cita.person && cita.person.length > 0) ? cita.person[0] : null;

        if (!cliente || !cliente.phone) {
            console.warn(`⚠️ Cita ${cita.meeting_id} omitida. No se encontró información de la persona o el teléfono.`);
            return;
        }

        // Remueve todos los caracteres que no sean dígitos del número de teléfono.
        const telefono = cliente.phone.replace(/[^\d]/g, '');

        // Asegura que los valores sean seguros para el payload.
        const nombreCliente = cliente.name || "Cliente";
        const horaCita = moment(cita.start_date).format('hh:mm A');
        const direccionInmueble = cita.place || "el inmueble";

        const asuntoCaso = `Recordatorio de Cita para ${nombreCliente}`;

        const payload = {
            group_id: groupId,
            source_channel: "whatsapp",
            subject: asuntoCaso,
            tags: ["recordatorio", "domus"],
            type_id: 0,
            activities: [{
                type: "user_reply",
                user_id: parseInt(process.env.WISE_USER_ID, 10), 
                channel: "whatsapp",
                template: {
                    template_id: templateId,
                    parameters: [
                        { key: "1", value: nombreCliente },
                        { key: "2", value: direccionInmueble },
                        { key: "3", value: horaCita }
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
            }]
        };

        const response = await wiseApi.createCaseAndSendTemplate(payload);

        if (response) {
            console.log(`✅ Recordatorio enviado exitosamente a ${nombreCliente} para la cita ${cita.meeting_id}.`);
        } else {
            console.error(`❌ Falló el envío del recordatorio para la cita ${cita.meeting_id}.`);
        }
    } catch (error) {
        console.error(`Ocurrió un error inesperado al procesar la cita ${cita.meeting_id}:`, error);
    }
}

module.exports = {
    sendDailyReminders
};