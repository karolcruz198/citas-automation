const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const moment = require('moment');
const domusApi = require('../api/domus');
const wiseApi = require ('../api/wise');

const INMOBILIARIAS = ['bienco', 'uribienes', 'las_vegas']; 
const REPORT_BASE_URL = 'https://crm_api.domus.la';

function getFechasDeLaSemana() {
    const today = moment();
    
    const fechaInicio = today.startOf('isoWeek').format('YYYY-MM-DD');
    
    //Obtiene el final de la semana (sábado)
    const fechaFin = moment(fechaInicio).add(5, 'days').format('YYYY-MM-DD')

    return { fechaInicio, fechaFin };
}

async function sendWeeklyReports() {
    console.log("Iniciando tarea programada de envío de reportes semanales...");

    // Analiza los IDs numéricos del archivo .env y los verifica
    const groupId = parseInt(process.env.WISE_GROUP_ID, 10);
    const templateId = parseInt(process.env.WISE_TEMPLATE_ID_REPORTE, 10);
    
    if (isNaN(groupId) || isNaN(templateId)) {
        console.error("Error: WISE_GROUP_ID o WISE_TEMPLATE_ID_REPORTE no son números válidos en el archivo .env.");
        console.error(`Valores leídos: WISE_GROUP_ID='${process.env.WISE_GROUP_ID}', WISE_TEMPLATE_ID_REPORTE='${process.env.WISE_TEMPLATE_ID_REPORTE}'`);
        return;
    }

    const { fechaInicio, fechaFin } = getFechasDeLaSemana();

    for (const inmobiliaria of INMOBILIARIAS) {
        console.log(`\n--- Procesando reportes para la inmobiliaria: ${inmobiliaria.toUpperCase()} ---`);

        const response = await domusApi.getCitasDeLaSemana(inmobiliaria);
        const citas = response.data;
        
        if (!citas || citas.length === 0) {
            console.log("No se encontraron citas esta semana. Siguiente inmobiliaria.");
            continue;
        }

        const processedProperties = new Set();

        for (const cita of citas) {
            const propertyIdpro = cita.property_id;
            const propertyCode = cita.property_code;
            const person = cita.person[0];

            if (!propertyIdpro || !propertyCode) {
                console.warn(`AVISO: La cita ${cita.meeting_id} no tiene datos completos. Se omite.`);
                continue;
            }

            if (processedProperties.has(propertyCode)) {
                continue;
            }
            processedProperties.add(propertyCode);

            try {

                const ownerDetails = await domusApi.getOwnerDetails(inmobiliaria, propertyCode);

                if (!ownerDetails || (!ownerDetails.phone && !ownerDetails.email)) {
                    console.warn(`AVISO: No se encontraron detalles de contacto (teléfono o email) para el propietario del inmueble ${propertyCode}. Se omite.`);
                    continue;
                }

                const linkResponse = await domusApi.getOwnerLink(inmobiliaria, propertyIdpro, fechaInicio, fechaFin);
                
                if (!linkResponse || !linkResponse.data || !linkResponse.data.data) {
                    console.warn(`AVISO: No se pudo generar el enlace de reporte para el inmueble ${propertyCode}. Se omite.`);
                    continue;
                }
                
                const urlData = linkResponse.data.data;
                const linkCompleto = `https://crm.domus.la${urlData}`;
                
                console.log(`Enlace generado para el inmueble ${propertyCode}`);
                console.log(`Enlace generado: ${linkCompleto}`);

                await sendReportMessage(
                    ownerDetails.name,
                    ownerDetails.phone,
                    ownerDetails.email,
                    linkCompleto,
                    groupId,
                    templateId,
                    inmobiliaria,
                    propertyCode
                );

            } catch (error) {
                console.error(`ERROR: No se pudo procesar el inmueble ${propertyCode}. Error:`, error.message);
                continue; // Continúa con el siguiente inmueble en caso de error
            }

            // const wiseResponse = await wiseApi.createCaseAndSend(payload);
            // console.log("Respuesta de Wise CX:", wiseResponse);
        }
    }

    console.log("\nTarea de reportes finalizada.");
}

async function sendReportMessage(ownerName, ownerPhone, ownerEmail, reportLink, groupId, templateId, inmobiliaria, propertyCode) {
    let payload = null;
    let messageContent = "";

    if (ownerPhone) {
        // Payload para WhatsApp
        payload = {
            group_id: groupId,
            source_channel: "whatsapp",
            subject: `Reporte semanal de visitas - ${ownerName}`,
            tags: ["reporte", "domus", "propietario"],
            type_id: 0,
            activities: [{
                type: "user_reply",
                user_id: 0,
                channel: "whatsapp",
                template: {
                    template_id: templateId,
                    parameters: [
                        { key: "1", value: ownerName },
                        { key: "2", value: reportLink }
                    ]
                },
                contacts_to: [{
                    name: ownerName,
                    phone: ownerPhone
                }]
            }],
            custom_fields: [{
                field: "fecha_reporte",
                value: moment().format('YYYY-MM-DD')
            }, {
                field: "codigo_inmueble_domus",
                value: String(propertyCode)
            }, {
                field: "inmobiliaria",
                value: inmobiliaria
            }]
        };
        console.log(`Enviando reporte a ${ownerName} por WhatsApp...`);

    } else if (ownerEmail) {
        // Payload para Email
        payload = {
            group_id: groupId,
            source_channel: "email",
            subject: `Reporte semanal de visitas - ${ownerName}`,
            tags: ["reporte", "domus", "propietario"],
            type_id: 0,
            activities: [{
                type: "user_reply",
                user_id: 0,
                channel: "email",
                content: `Hola ${ownerName},<br/><br/>
                          ¡Tenemos un nuevo reporte para tu inmueble!<br/><br/>
                          Puedes revisarlo en el siguiente enlace: <a href="${reportLink}">${reportLink}</a><br/><br/>
                          ¡Gracias por tu confianza!`,
                contacts_to: [{
                    name: ownerName,
                    email: ownerEmail
                }]
            }],
            custom_fields: [{
                field: "fecha_reporte",
                value: moment().format('YYYY-MM-DD')
            }, {
                field: "codigo_inmueble_domus",
                value: String(propertyCode)
            }, {
                field: "inmobiliaria",
                value: inmobiliaria
            }]
        };
        console.log(`Enviando reporte a ${ownerName} por Email...`);

    } else {
        console.warn(`AVISO: El propietario ${ownerName} no tiene teléfono ni correo electrónico. No se puede enviar el reporte.`);
        return;
    }

    await wiseApi.createCaseAndSend(payload);
}

async function main() {
    await sendWeeklyReports();
}

if (require.main === module) {
    main();
}

module.exports = {
    sendWeeklyReports,
    main
};