const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const moment = require('moment');
const domusApi = require('../api/domus');
const wiseApi = require ('../api/wise');

// Lista de las inmobiliarias a procesar.
const INMOBILIARIAS = ['bienco', 'uribienes', 'las_vegas'];

const { getBrandName } = require('../utils/brands');

async function sendDailyReminders() {
    console.log("Iniciando tarea recordatorio citas");

    const hoy = moment().format('YYYY-MM-DD');

    const groupId = parseInt(process.env.WISE_GROUP_ID, 10);

    if (isNaN(groupId)) {
        console.error("Error: WISE_GROUP_ID no es un número válido");
        return; 
    }
    
    for (const inmobiliaria of INMOBILIARIAS) {
        console.log(`\n--- Procesando citas para la inmobiliaria: ${inmobiliaria.toUpperCase()} ---`);
        
        const envVarName = `WISE_TEMPLATE_ID_RECORDATORIO_${inmobiliaria.toUpperCase()}`;
        const templateId = parseInt(process.env[envVarName], 10);

        if (isNaN(templateId) || templateId === 0) {
            console.warn(`⚠️ La variable de entorno '${envVarName}' no está definida. Esta inmobiliaria será omitida.`);
            continue; 
        }

        try {
            const citasHoy = await domusApi.getMeetingsForDay(inmobiliaria, hoy);

            if (!citasHoy || citasHoy.length === 0) {
                console.log("No se encontraron citas para hoy. Siguiente inmobiliaria.");
                continue;
            }
            
            console.log(`Se encontraron ${citasHoy.length} citas. Enviando recordatorios...`);

            for (const cita of citasHoy) {
                try {
                    const detalle = await domusApi.getMeetingDetail(inmobiliaria, cita.id);


                    await createAndSendWiseCase(
                        { ...cita, detalle },
                        groupId,
                        templateId,
                        inmobiliaria
                    );

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

    console.log("Tarea de recordatorios finalizada");
}


async function createAndSendWiseCase(citaConDetalle, groupId, templateId, inmobiliaria) {
    const cliente = citaConDetalle.contact || null;

    if (!cliente || !cliente.phone) {
        console.warn(`⚠️ Cita ${citaConDetalle.id} omitida. No se encontró información de la persona o el teléfono.`);
        return;
    }

    const telefono = wiseApi.formatPhoneNumber(cliente.phone);
    const nombreCliente = cliente.name || "Cliente";
    const horaCita = moment(citaConDetalle.init_time, 'HH:mm:ss').format('hh:mm A');
    const direccionInmueble = citaConDetalle.address || "el inmueble";
    const asuntoCaso = `Recordatorio de Cita para ${nombreCliente}`;
    const marcaSpa = getBrandName(inmobiliaria);

    let cityName = "Antioquia"; // por defecto
    if (marcaSpa.toLowerCase() === "bienco") {
        cityName = citaConDetalle.city 
            || (citaConDetalle.branch && citaConDetalle.branch.name) 
            || "Antioquia";
    }
    let gestionSpa = null;
    if (Array.isArray(citaConDetalle.detailProperties) && citaConDetalle.detailProperties.length > 0) {
        gestionSpa = citaConDetalle.detailProperties[0].biz ?? citaConDetalle.detailProperties[0].biz_code ?? null;
    }

    const payload = {
        group_id: groupId,
        source_channel: "whatsapp",
        subject: asuntoCaso,
        tags: ["Creado por API", "Domus - Recordatorios Cita"],
        custom_fields: [
            { field: "email_1", value: citaConDetalle.date ?? "" },
            { field: "email_2", value: String(citaConDetalle.id) },
            { field: "email_3", value: direccionInmueble },
            { field: "email_4", value: horaCita },
            { field: "marca_spa", value: marcaSpa },
            { field: "gestion_spa", value: gestionSpa ?? "" }
        ],
        type_id: 0,
        activities: [{
            type: "user_reply",
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
                phone: telefono,
                city: cityName
            }]
        }]
        
    };

    try {
        console.log(`Intentando crear caso para la cita ${cita.id}...`);
        const response = await wiseApi.createCaseAndSend(payload, null);
        const caseId = response?.case_id;

        if (response && caseId) {
            console.log(`✅ Recordatorio enviado exitosamente a ${nombreCliente} para la cita ${cita.id}.`);
            await wiseApi.updateCaseStatus(caseId, 'solved');
            console.log(`✅ Caso ${caseId} resuelto exitosamente.`);
        } else {
            console.error(`❌ Falló el envío del recordatorio para la cita ${cita.id}. No se recibió una respuesta exitosa.`);
        }
    } catch (error) {
        const errorData = error.response ? error.response.data : null;
        console.error(`❌ Falló el intento inicial de crear el caso. Es probable que ya exista uno.`, errorData || error.message);

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
            const retryResponse = await wiseApi.createCaseAndSend(payload, contactId);
            const retryCaseId = retryResponse?.case_id;

            if (retryResponse && retryCaseId) {
                console.log(`✅ Recordatorio enviado exitosamente después de la recuperación para la cita ${cita.id}.`);
                await wiseApi.updateCaseStatus(retryCaseId, 'closed');
            } else {
                console.error(`❌ Falló el reintento de envío del recordatorio para la cita ${cita.id}.`);
            }

        } catch (recoveryError) {
            console.error(`❌ Error crítico durante el proceso de recuperación y reintento para la cita ${cita.id}:`, recoveryError.response ? recoveryError.response.data : recoveryError.message);
        }
    }
}

module.exports = {
    sendDailyReminders,
    createAndSendWiseCase
};

//Para que el script se ejecute al ser llamado por cron
if (require.main === module) {
    sendDailyReminders();
}