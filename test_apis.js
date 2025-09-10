// test_apis.js
const moment = require('moment');
const domusApi = require('./src/api/domus');
const wiseApi = require('./src/api/wise');

const { createAndSendWiseCase } = require('./src/jobs/reminders');
const { createAndSendWiseSurveyCase } = require('./src/jobs/surveys');
const { sendReportMessage } = require('./src/jobs/reports');

// Carga las variables de entorno para las pruebas
require('dotenv').config();

const myPhoneNumber = "3153102895";

const TEST_PROPERTY_CODES = {
    bienco: '122027',
    uribienes: '214012',
    las_vegas: '512643'
};

const TEST_PROPERTY_IDS = {
    bienco: 3319903,
    uribienes: 3316270,
    las_vegas: 3317109
};

async function runTest() {
    console.log("--- INICIANDO PRUEBA COMPLETA DE FUNCIONES API ---");

    // --- 1. PRUEBA DEL JOB DE RECORDATORIOS DE CITAS ---
    await testAppointmentReminders();
    
    // --- 2. PRUEBA DEL JOB DE REPORTES SEMANALES ---
    await testWeeklyReports();

    // --- 3. PRUEBA DEL JOB DE ENCUESTAS DE SATISFACCIÓN ---
    await testSurveys();

    console.log("\n--- PRUEBA COMPLETA FINALIZADA ---");

}

async function testAppointmentReminders() {
    console.log("\n--- INICIANDO PRUEBA DEL JOB DE RECORDATORIOS DE CITAS ---");
    const inmobiliarias = ['BIENCO', 'URIBIENES', 'LAS_VEGAS'];

    for (const currentInmobiliaria of inmobiliarias) {
        console.log(`\n--- Procesando recordatorio para la inmobiliaria: ${currentInmobiliaria} ---`);
        
        // Simular un objeto de cita para la prueba
        const mockCita = {
            meeting_id: `112233`,
            start_date: '2025-10-15',
            place: 'Calle 10 # 5-20',
            person: [{ name: "Juan Perez", phone: myPhoneNumber, email: 'juan.perez@test.com' }],
            broker: { broker_name: "Pedro Perez" },
            branch: 'Sabaneta'
        };

        const templateId = getAppointmentTemplateId(currentInmobiliaria);
        const groupId = 23532;

        await createAndSendWiseCase(mockCita, groupId, templateId, currentInmobiliaria);
    }
    console.log("--- PRUEBA DEL JOB DE RECORDATORIOS FINALIZADA ---");
}

async function testWeeklyReports() {
    console.log("\n--- INICIANDO PRUEBA DEL JOB DE REPORTES SEMANALES ---");
    const inmobiliarias = ['BIENCO', 'URIBIENES', 'LAS_VEGAS'];
    const groupId = 23532;
    const propertyCode = '121464';
    const linkTemplate = `MjAyNS0wOS0wMQ==/MjAyNS0wOS0zMA==/MjA4/MzMxNjkxMQ==`;

    for (const currentInmobiliaria of inmobiliarias) {
        try {

            console.log("-> 1. Probando la función domusApi.getProperties...");
            const inmuebles = await domusApi.getProperties(currentInmobiliaria.toLowerCase());
            
            if (!inmuebles || inmuebles.length === 0) {
                console.log(`✅ No se encontraron inmuebles para ${currentInmobiliaria}. Probando con la siguiente.`);
                continue;
            }

            console.log(`✅ Se obtuvieron ${inmuebles.length} inmuebles de ${currentInmobiliaria}. Mostrando los 3 primeros:`);
            inmuebles.slice(0, 3).forEach(inmueble => {
                console.log(`   - Código: ${inmueble.codpro}, ID: ${inmueble.idpro}`);
            });
            
            console.log("\n-> 2. Enviando un único reporte de prueba con el enlace simulado.");
            
            const templateId = getReportTemplateId(currentInmobiliaria);
            
            if (templateId === null) {
                console.warn(`⚠️ Template ID para ${currentInmobiliaria} no válido. Se omite el envío.`);
                continue;
            }
            
            await sendReportMessage(
                "Propietario de Prueba",
                myPhoneNumber,
                linkTemplate,
                groupId,
                templateId,
                currentInmobiliaria,
                propertyCode
            );
        
            console.log(`Enviando enlace completo: https://crm.domus.la/file/property/${linkTemplate}`);

        } catch (error) {
            console.error(`❌ Ocurrió un error inesperado al procesar la inmobiliaria ${currentInmobiliaria}:`, error);
        }
    }
    console.log("--- PRUEBA DEL JOB DE REPORTES SEMANALES FINALIZADA ---");
}

async function testSurveys() {
    console.log("\n--- INICIANDO PRUEBA DEL JOB DE ENCUESTAS DE SATISFACCIÓN ---");
    const inmobiliarias = ['BIENCO', 'URIBIENES', 'LAS_VEGAS'];

    for (const currentInmobiliaria of inmobiliarias) {
        console.log(`\n--- Procesando encuesta para la inmobiliaria: ${currentInmobiliaria} ---`);

        const mockCita = {
            meeting_id: `334455`,
            start_date: '2025-09-08',
            person: [{ name: "Juan Perez", phone: myPhoneNumber, email: 'juan.perez@test.com' }],
            broker: { broker_name: "Juan Gomez", broker_id: "12345" },
            branch: 'Sabaneta'
        };

        const templateId = getSurveyTemplateId(currentInmobiliaria);
        const groupId = 23532; 

        await createAndSendWiseSurveyCase(mockCita, groupId, templateId, currentInmobiliaria);
    }
    console.log("--- PRUEBA DEL JOB DE ENCUESTAS DE SATISFACCIÓN FINALIZADA ---");
}

function getBrandName(inmobiliaria) {
    if (inmobiliaria === 'BIENCO') return 'bienco';
    if (inmobiliaria === 'URIBIENES') return 'uribienes';
    if (inmobiliaria === 'LAS_VEGAS') return 'las vegas';
    return '';
}

function getAppointmentTemplateId(inmobiliaria) {
    if (inmobiliaria === 'BIENCO') return 47158; 
    if (inmobiliaria === 'URIBIENES') return 47355;
    if (inmobiliaria === 'LAS_VEGAS') return 47350;
    return null;
}

function getReportTemplateId(inmobiliaria) {
    if (inmobiliaria === 'BIENCO') return 47157;
    if (inmobiliaria === 'URIBIENES') return 47353;
    if (inmobiliaria === 'LAS_VEGAS') return 47349;
    return null;
}

function getSurveyTemplateId(inmobiliaria) {
    if (inmobiliaria === 'BIENCO') return 47159;
    if (inmobiliaria === 'URIBIENES') return 47352; 
    if (inmobiliaria === 'LAS_VEGAS') return 47346;
    return null;
}

runTest();