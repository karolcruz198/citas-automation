const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const moment = require('moment');
const domusApi = require('../api/domus');
const wiseApi = require ('../api/wise');

const INMOBILIARIAS = ['bienco', 'uribienes', 'las_vegas'];

const { getBrandName, getCityFromBranchName } = require('../utils/brands');
const { capitalizeWords } = require('../utils/formatting');

async function sendDailyReminders() {
    console.log("Iniciando tarea recordatorio citas");

    const hoy = moment().format('YYYY-MM-DD');
    //const groupId = parseInt(process.env.WISE_GROUP_ID_RECORDATORIO, 10);

    for (const inmobiliaria of INMOBILIARIAS) {
        console.log(`\n--- Procesando citas para la inmobiliaria: ${inmobiliaria.toUpperCase()} ---`);
        const envVarNameGrupo = `WISE_GROUP_ID_ENCUESTA_${inmobiliaria.toUpperCase()}`;
        const groupId = parseInt(process.env[envVarNameGrupo], 10);
        
        const envVarName = `WISE_TEMPLATE_ID_RECORDATORIO_${inmobiliaria.toUpperCase()}`;
        const templateId = parseInt(process.env[envVarName], 10);

        const envVarNameUser = `WISE_USER_ID_${inmobiliaria.toUpperCase()}`;
        const userId = parseInt(process.env[envVarNameUser], 10);

        if (isNaN(groupId) || isNaN(templateId) || isNaN(userId)) {
            console.error(`Error: Las variables para ${inmobiliaria.toUpperCase()} no están configuradas correctamente.`);
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
                        detalle,
                        groupId,
                        templateId,
                        inmobiliaria,
                        userId
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


async function createAndSendWiseCase(citaConDetalle, groupId, templateId, inmobiliaria, userId) {
    const cliente = citaConDetalle.contact || null;
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
        console.warn(`⚠️ Cita ${citaConDetalle.id} omitida. No se encontró el teléfono.`);
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

    

    const horaCita = moment(citaConDetalle.init_time, 'HH:mm:ss').format('hh:mm A');
    const direccionInmueble = citaConDetalle.address || "el inmueble";
    const asuntoCaso = `Recordatorio de Cita para ${nombreCliente}`;
    const marcaSpa = getBrandName(inmobiliaria);

    let cityName = "";
    const propertyDetails = citaConDetalle.detailProperties;
    if (propertyDetails && propertyDetails.length > 0 && propertyDetails[0].city) {
        cityName = propertyDetails[0].city;
    } else if (marcaSpa.toLowerCase() === "bienco") {
        cityName = getCityFromBranchName(citaConDetalle.branch?.name) || "Bienco";
    } else {
        cityName = "Antioquia";
    }

    let gestionSpa = null;
    if (Array.isArray(citaConDetalle.detailProperties) && citaConDetalle.detailProperties.length > 0) {
        gestionSpa = citaConDetalle.detailProperties[0].biz ?? citaConDetalle.detailProperties[0].biz_code ?? null;
    }

    //Obtener Nombre del Asesor (rol 'Anfitrión')
    let nombreAsesor = "";
    if (Array.isArray(citaConDetalle.profiles)) {
        const anfitrion = citaConDetalle.profiles.find(p => p.role?.name === "Anfitrión" || p.role?.id === 1);
        if (anfitrion && anfitrion.profile) {
            nombreAsesor = anfitrion.profile.full_name || `${anfitrion.profile.name} ${anfitrion.profile.last_name}`.trim();
        } else if (citaConDetalle.profiles[0]?.profile) {
            // Por si no encuentra un rol explícito, toma el primer perfil como respaldo
            nombreAsesor = citaConDetalle.profiles[0].profile.full_name || "";
        }
    }

    //Obtener Código de Cita
    const codigoCita = citaConDetalle.code ? String(citaConDetalle.code) : "";

    //Obtener Código Web
    let codigoWeb = "";
    if (Array.isArray(citaConDetalle.detailProperties) && citaConDetalle.detailProperties.length > 0) {
        codigoWeb = citaConDetalle.detailProperties[0].codpro ? String(citaConDetalle.detailProperties[0].codpro) : "";
    }

    const payload = {
        group_id: groupId,
        user_id: userId,
        source_channel: "outgoing_whatsapp",
        subject: asuntoCaso,
        tags: ["Creado por API", "Domus - Recordatorios Cita"],
        custom_fields: [
            { field: "email_1", value: citaConDetalle.date ?? "" },
            { field: "email_2", value: String(citaConDetalle.id) },
            { field: "email_3", value: direccionInmueble },
            { field: "email_4", value: horaCita },
            { field: "marca_spa", value: marcaSpa },
            { field: "gestion_spa", value: gestionSpa ?? "" },
            { field: "nombre_asesor", value: nombreAsesor },
            { field: "codigo_de_cita", value: codigoCita },
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
                    { key: "2", value: direccionInmueble },
                    { key: "3", value: horaCita }
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
        console.log(`Intentando crear caso para la cita ${citaConDetalle.id}...`);
        const response = await wiseApi.createCaseAndSend(payload, null);
        const caseId = response?.case_id;

        if (response && caseId) {
            console.log(`✅ Recordatorio enviado exitosamente a ${nombreCliente} para la cita ${citaConDetalle.id}.`);
            await wiseApi.updateCaseStatus(caseId, 'solved');
            console.log(`✅ Caso ${caseId} resuelto exitosamente.`);
        } else if (response?.error === 'OPEN_CASES_EXIST' && response?.opened_cases?.length > 0) {
            const openCaseId = response.opened_cases[0];
            console.log(`⚠️ Ya existe un caso abierto (${openCaseId}). Cerrándolo...`);

            await wiseApi.updateCaseStatus(openCaseId, 'closed');
            console.log(`✅ Caso ${openCaseId} cerrado exitosamente.`);

            console.log(`🔄 Reintentando creación del caso...`);
            const retryResponse = await wiseApi.createCaseAndSend(payload, null);
            const retryCaseId = retryResponse?.case_id;

            if (retryResponse && retryCaseId) {
                console.log(`✅ Recordatorio reenviado exitosamente para la cita ${citaConDetalle.id}.`);
                await wiseApi.updateCaseStatus(retryCaseId, 'solved');
            } else {
                console.error(`❌ Falló el reintento para la cita ${citaConDetalle.id}.`);
            }
        } else {
            console.error(`❌ Falló el envío del recordatorio para la cita ${citaConDetalle.id}.`, response);
        }
    } catch (error) {
        const errorData = error.response ? error.response.data : null;
        console.error(`❌ Falló el intento inicial de crear el caso. Es probable que ya exista uno.`, errorData || error.message);

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