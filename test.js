// test.js

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const moment = require('moment');
const { getBrandName, getCityFromBranchName } = require('./src/utils/brands');
const { createAndSendWiseCase } = require('./src/jobs/reminders');

const wiseApi = require('./src/api/wise');

const TEST_PHONE_NUMBER = "3153102895";
const INMOBILIARIAS = ['bienco', 'uribienes', 'las_vegas'];
const GROUP_ID = parseInt(process.env.WISE_GROUP_ID, 10) || 12345;
const REPORT_BASE_URL = 'https://crm.domus.la';

// --- Mocks para citas (Recordatorios y Encuestas) ---
const mockAppointmentData = {
    'bienco': { 
        id: 119691, 
        contact: { name: 'Test Api CRM', phone: TEST_PHONE_NUMBER }, 
        address: 'Carrera 10 # 20-30', 
        init_time: '10:00:00',
        date: moment().add(1, 'day').format('YYYY-MM-DD'), 
        detailProperties: [
            { biz_code: 'Arriendo' }
        ],
        branch: { name: 'Bienco Cali' } 
    },
    'uribienes': { 
        id: 117064, 
        contact: { name: 'Test Api CRM', phone: TEST_PHONE_NUMBER }, 
        address: 'Calle 5 # 10-15', 
        init_time: '10:00:00',
        date: moment().add(1, 'day').format('YYYY-MM-DD'),
        detailProperties: [
            { city: 'Medellín', biz_code: 'Arriendo' } 
        ]
    },
    'las_vegas': { 
        id: 118524, 
        contact: { name: 'Test Api CRM', phone: TEST_PHONE_NUMBER }, 
        address: 'Avenida 20 # 50-60', 
        init_time: '10:00:00',
        date: moment().add(1, 'day').format('YYYY-MM-DD'),
        detailProperties: [
            { biz_code: 'Venta' }
        ]
    }
};

const mockConcludedAppointments = (inmobiliaria) => [{ id: mockAppointmentData[inmobiliaria].id }];
const mockConcludedAppointmentDetails = (inmobiliaria) => mockAppointmentData[inmobiliaria];

// --- Mocks para reportes ---
const mockReportPropertyData = {
    'bienco': { idpro: 3346548, codpro: 122342 },
    'uribienes': { idpro: 3346704, codpro: 214253 },
    'las_vegas': { idpro: 3346690, codpro: 512804 }
};

const mockReportOwnerDetails = {
    'bienco': { name: 'MARTHA', phones: [{ number: TEST_PHONE_NUMBER }] },
    'uribienes': { name: 'CARLOS', phones: [{ number: TEST_PHONE_NUMBER }] },
    'las_vegas': { name: 'ANA', phones: [{ number: TEST_PHONE_NUMBER }] }
};

const mockReportLinkData = {
    'bienco': { data: { data: '/file/property/MjAyNS0wOS0wMQ==/MjAyNS0wOS0xNQ==/MjA4/MzM0NjU0OA==' } },
    'uribienes': { data: { data: '/file/property/MjAyNS0wOS0wMQ==/MjAyNS0wOS0xNQ==/MjM1/MzM0NjcwNA==' } },
    'las_vegas': { data: { data: '/file/property/MjAyNS0wOS0wMQ==/MjAyNS0wOS0xNQ==/MjM2/MzM0NjY5MA==' } }
};

// --- Mock de las APIs de Domus y Wise ---
const domusApi = {
    // Mocks para Recordatorios
    getScheduledAppointments: async (inmobiliaria) => {
        console.log(`MOCK: Buscando citas programadas para ${inmobiliaria.toUpperCase()}...`);
        return [mockAppointmentData[inmobiliaria]];
    },
    // Mocks para Encuestas
    getConcludedAppointments: async (inmobiliaria) => {
        console.log(`MOCK: Buscando citas concluidas para ${inmobiliaria.toUpperCase()}...`);
        return mockConcludedAppointments(inmobiliaria);
    },
    getAppointmentDetails: async (inmobiliaria, appointmentId) => {
        console.log(`MOCK: Consultando detalle de la cita con ID ${appointmentId}...`);
        return mockConcludedAppointmentDetails(inmobiliaria);
    },
    // Mocks para Reportes
    getProperties: async (inmobiliaria) => {
        console.log(`MOCK: Buscando propiedades para ${inmobiliaria.toUpperCase()}...`);
        return { data: [mockReportPropertyData[inmobiliaria]] };
    },
    getOwnerDetails: async (inmobiliaria, propertyCode) => {
        console.log(`MOCK: Obteniendo detalles de propietario para ${propertyCode}...`);
        return { data: [mockReportOwnerDetails[inmobiliaria]] };
    },
    getOwnerLink: async (inmobiliaria, propertyIdpro) => {
        console.log(`MOCK: Generando enlace de reporte para la propiedad con ID ${propertyIdpro}...`);
        return mockReportLinkData[inmobiliaria];
    }
};

async function runRemindersTest(inmobiliaria) {
    console.log(`\n--- Test de RECORDATORIOS para: ${inmobiliaria.toUpperCase()} ---`);
    const templateId = parseInt(process.env[`WISE_TEMPLATE_ID_RECORDATORIO_${inmobiliaria.toUpperCase()}`], 10) || 12345;
    const appointments = await domusApi.getScheduledAppointments(inmobiliaria);
    const appointment = appointments[0];
    
    if (appointment) {
        try {
            // Llama a la función principal. Ella se encargará de todo.
            await createAndSendWiseCase(appointment, GROUP_ID, templateId, inmobiliaria);
            console.log(`✅ Test de Recordatorio para ${inmobiliaria.toUpperCase()} completado.`);
        } catch (error) {
            console.error(`Falló el test de recordatorio para ${inmobiliaria.toUpperCase()}:`, error.message);
        }
    }
}

async function runSurveysTest(inmobiliaria) {
    console.log(`\n--- Test de ENCUESTAS para: ${inmobiliaria.toUpperCase()} ---`);
    const templateId = parseInt(process.env[`WISE_TEMPLATE_ID_ENCUESTA_${inmobiliaria.toUpperCase()}`], 10) || 67890;
    const appointments = await domusApi.getConcludedAppointments(inmobiliaria);
    const appointmentId = appointments[0]?.id;

    if (appointmentId) {
        const appointmentDetails = await domusApi.getAppointmentDetails(inmobiliaria, appointmentId);
        
        const contactName = appointmentDetails.contact?.name;
        const brokerName = "Test Asesor"; 
        const contactPhone = appointmentDetails.contact?.phone;
        
        const brandName = getBrandName(inmobiliaria);

        const payload = {
            group_id: GROUP_ID,
            source_channel: "whatsapp",
            subject: `Encuesta de Satisfacción - ${contactName}`,
            tags: ["Creado por API", "Domus - Encuesta"],
            custom_fields: [
                { field: "email_1", value: appointmentDetails.date },
                { field: "email_2", value: String(appointmentDetails.id) },
                { field: "email_3", value: brokerName },
                { field: "marca_spa", value: brandName }
            ],
            type_id: 0,
            activities: [{
                type: "user_reply",
                channel: "whatsapp",
                template: {
                    template_id: templateId,
                    parameters: [
                        { key: "1", value: contactName },
                        { key: "2", value: brokerName }
                    ]
                },
                contacts_to: [{ name: contactName, phone: wiseApi.formatPhoneNumber(contactPhone), city: appointmentDetails.city }]
            }]
        };

        try {
            console.log(`Intentando crear caso de encuesta para la cita ${appointmentDetails.id}...`);
            const response = await wiseApi.createCaseAndSend(payload, null);
            const caseId = response?.case_id;

            if (response && caseId) {
                console.log(`✅ Encuesta enviada exitosamente a ${contactName} para la cita ${appointmentDetails.id}.`);
                await wiseApi.updateCaseStatus(caseId, 'solved');
                console.log(`✅ Caso ${caseId} resuelto exitosamente.`);
            } else {
                console.error(`Falló el envío de la encuesta para la cita ${appointmentDetails.id}. No se recibió una respuesta exitosa.`);
            }
        } catch (error) {
            console.error(`Falló el intento de crear el caso de encuesta para la cita ${appointmentDetails.id}:`, error.message);
        };
    }
}

async function runReportsTest(inmobiliaria) {
    console.log(`\n--- Test de REPORTES para: ${inmobiliaria.toUpperCase()} ---`);
    const templateId = parseInt(process.env[`WISE_TEMPLATE_ID_REPORTE_${inmobiliaria.toUpperCase()}`], 10) || 78901;
    const propertiesResponse = await domusApi.getProperties(inmobiliaria);
    const property = propertiesResponse.data[0];
    if (property) {
        const ownerResponse = await domusApi.getOwnerDetails(inmobiliaria, property.codpro);
        const ownerDetails = ownerResponse.data[0];
        const linkResponse = await domusApi.getOwnerLink(inmobiliaria, property.idpro);
        const urlData = linkResponse.data.data;
        const linkTemplate = urlData.split('/file/property/')[1]; 
        const brandName = getBrandName(inmobiliaria);

        const payload = {
            group_id: GROUP_ID,
            source_channel: "whatsapp",
            subject: `Reporte semanal de visitas - ${ownerDetails.name}`,
            tags: ["Creado por API", "Domus - Informe Propietarios"],
            custom_fields: [
                { field: "email_1", value: moment().format('YYYY-MM-DD') },
                { field: "email_2", value: String(property.codpro) },
                { field: "marca_spa", value: brandName }
            ],
            type_id: 0,
            activities: [{
                type: "user_reply",
                channel: "whatsapp",
                template: {
                    template_id: templateId,
                    parameters: [
                        { key: "1", value: ownerDetails.name },
                        { key: "https://crm.domus.la/file/property/", value: linkTemplate }
                    ]
                },
                contacts_to: [{ name: ownerDetails.name, phone: wiseApi.formatPhoneNumber(ownerDetails.phones[0].number) }]
            }]
        };
        try {
            console.log(`Intentando crear caso de reporte para el inmueble ${property.codpro}...`);
            const response = await wiseApi.createCaseAndSend(payload, null);
            const caseId = response?.case_id;

            if (response && caseId) {
                console.log(`✅ Reporte enviado exitosamente a ${ownerDetails.name} para el inmueble ${property.codpro}.`);
                await wiseApi.updateCaseStatus(caseId, 'closed');
                console.log(`✅ Caso ${caseId} actualizado a estado cerrado.`);
            } else {
                console.error(`Falló el envío del reporte para el inmueble ${property.codpro}. No se recibió una respuesta exitosa.`);
            }
        } catch (error) {
            console.error(`Falló el intento de crear el caso de reporte para el inmueble ${property.codpro}:`, error.message);
        }
    }
}

// --- Flujo principal de la prueba ---
async function runAllTests() {
    console.log("Iniciando prueba consolidada para todas las tareas...");
    for (const inmobiliaria of INMOBILIARIAS) {
        try {
            //await runRemindersTest(inmobiliaria);
            //await runSurveysTest(inmobiliaria);
            await runReportsTest(inmobiliaria);
        } catch (error) {
            console.error(`ERROR al ejecutar prueba para ${inmobiliaria.toUpperCase()}:`, error.message);
        }
    }
    console.log("\nPrueba consolidada finalizada.");
}

runAllTests();