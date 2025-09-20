const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const moment = require('moment');
const domusApi = require('../api/domus');
const wiseApi = require ('../api/wise');

const INMOBILIARIAS = ['bienco', 'uribienes', 'las_vegas']; 
const { getBrandName } = require('../utils/brands');

async function sendWeeklyReports() {
    console.log("Iniciando tarea programada de envío de reportes semanales...");

    const groupId = parseInt(process.env.WISE_GROUP_ID, 10);
    
    if (isNaN(groupId)) {
        console.error("Error: WISE_GROUP_ID no es un número válido");
        return;
    }

    const endDate = moment();
    const startDate = moment().subtract(6, 'months');

    for (const inmobiliaria of INMOBILIARIAS) {
        console.log(`\n--- Procesando reportes para la inmobiliaria: ${inmobiliaria.toUpperCase()} ---`);
        const envVarName = `WISE_TEMPLATE_ID_REPORTE_${inmobiliaria.toUpperCase()}`;
        const templateId = parseInt(process.env[envVarName], 10);

        if (isNaN(templateId) || templateId === 0) {
            console.warn(`⚠️ La variable de entorno '${envVarName}' no está definida. Se omite el envío de reportes para esta inmobiliaria.`);
            continue;
        }

        const inmuebles = await domusApi.getProperties(inmobiliaria);
        
        if (!inmuebles || inmuebles.length === 0) {
            console.log("No se encontraron inmuebles para esta inmobiliaria. Siguiente.");
            continue;
        }

        const processedProperties = new Set();

        for (const inmueble of inmuebles) {
            const propertyIdpro = inmueble.idpro;
            const propertyCode = inmueble.codpro;
            
            if (!propertyIdpro || !propertyCode) {
                console.warn(`AVISO: El inmueble con ID ${inmueble.idpro} no tiene datos completos. Se omite.`);
                continue;
            }

            if (processedProperties.has(propertyCode)) {
                continue;
            }
            processedProperties.add(propertyCode);

            try {
                const ownerDetails = await domusApi.getOwnerDetails(inmobiliaria, propertyCode);

                if (!ownerDetails || (!ownerDetails.phone && !ownerDetails.email)) {
                    console.warn(`AVISO: No se encontraron detalles de contacto para el propietario del inmueble ${propertyCode}. Se omite.`);
                    continue;
                }

                const linkResponse = await domusApi.getOwnerLink(inmobiliaria, propertyIdpro, startDate, endDate);
                
                if (!linkResponse || !linkResponse.data || !linkResponse.data.data) {
                    console.warn(`AVISO: No se pudo generar el enlace de reporte para el inmueble ${propertyCode}. Se omite.`);
                    continue;
                }
                
                const urlData = linkResponse.data.data;
                const linkCompleto = `https://crm.domus.la${urlData}`;
                const linkTemplate = urlData.split('/file/property/')[1];
                
                console.log(`Enlace generado para el inmueble ${propertyCode}`);
                console.log(`Enlace generado: ${linkCompleto}`);

                await sendReportMessage(
                    ownerDetails.name,
                    ownerDetails.phone,
                    linkTemplate,
                    groupId,
                    templateId,
                    inmobiliaria,
                    propertyCode
                );

            } catch (error) {
                console.error(`ERROR: No se pudo procesar el inmueble ${propertyCode}. Error:`, error.message);
                continue;
            }
        }
    }

    console.log("\nTarea de reportes finalizada.");
}

async function sendReportMessage(ownerName, ownerPhone, linkTemplate, groupId, templateId, inmobiliaria, propertyCode) {
    if (!ownerPhone) {
        console.warn(`AVISO: El propietario ${ownerName} no tiene un teléfono válido. No se puede enviar el reporte.`);
        return;
    }

    const telefono = wiseApi.formatPhoneNumber(ownerPhone);
    const marcaSpa = getBrandName(inmobiliaria);

    const payload = {
        group_id: groupId,
        source_channel: "whatsapp",
        subject: `Reporte semanal de visitas - ${ownerName}`,
        tags: ["Creado por API", "Domus - Informe Propietarios"],
        custom_fields: [
            { "field": "email_1", "value": moment().format('YYYY-MM-DD') },
            { "field": "email_2", "value": String(propertyCode) },
            { "field": "marca_spa", "value": marcaSpa }
        ],
        type_id: 0,
        activities: [{
            type: "user_reply",
            channel: "whatsapp",
            template: {
                template_id: templateId,
                parameters: [
                    { key: "1", value: ownerName },
                    { key: "https://crm.domus.la/file/property/", value: linkTemplate }
                ]
            },
            contacts_to: [{
                name: ownerName,
                phone: telefono
            }]
        }]
        
    };

    try {
        console.log(`Intentando crear caso de reporte para el inmueble ${propertyCode}...`);

        const response = await wiseApi.createCaseAndSend(payload, null);
        const caseId = response?.case_id;

        if (response && caseId) {
            console.log(`✅ Reporte enviado exitosamente a ${ownerName} para el inmueble ${propertyCode}.`);
            await wiseApi.updateCaseStatus(caseId, 'closed');
            console.log(`✅ Caso ${caseId} actualizado a estado cerrado.`);
        } else {
            console.error(`❌ Falló el envío del reporte para el inmueble ${propertyCode}. No se recibió una respuesta exitosa.`);
        }
    } catch (error) {
        const errorData = error.response ? error.response.data : null;
        console.error(`❌ Falló el intento inicial de crear el caso de reporte. Es probable que ya exista uno.`, errorData || error.message);

        try {
            let openCaseId = null;

            if (errorData && errorData.error === 'OPEN_CASES_EXIST' && Array.isArray(errorData.opened_cases) && errorData.opened_cases.length > 0) {
                openCaseId = String(errorData.opened_cases[0]);
                console.log(`✅ ID de caso abierto obtenido directamente del error: ${openCaseId}.`);
            } else {
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
                console.log(`✅ Caso ${openCaseId} cerrado. Reintentando la creación...`);
            } else {
                console.log(`⚠️ No se pudo encontrar un caso abierto para cerrar. Intentando reintentar...`);
            }

            const retryResponse = await wiseApi.createCaseAndSend(payload, null);
            const retryCaseId = retryResponse?.case_id;

            if (retryResponse && retryCaseId) {
                console.log(`✅ Reporte enviado exitosamente después de la recuperación para el inmueble ${propertyCode}.`);
                await wiseApi.updateCaseStatus(retryCaseId, 'closed');
            } else {
                console.error(`❌ Falló el reintento de envío del reporte para el inmueble ${propertyCode}.`);
            }
        } catch (recoveryError) {
            console.error(`❌ Error crítico durante el proceso de recuperación y reintento para el inmueble ${propertyCode}:`, recoveryError.response ? recoveryError.response.data : recoveryError.message);
        }
    }
}

async function main() {
    await sendWeeklyReports();
}

if (require.main === module) {
    main();
}

module.exports = {
    sendWeeklyReports,
    sendReportMessage
};