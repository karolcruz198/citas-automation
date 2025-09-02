// test_apis.js
const moment = require('moment');
const domusApi = require('./src/api/domus');
const wiseApi = require('./src/api/wise');

// Carga las variables de entorno para las pruebas
require('dotenv').config();

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

// Define las inmobiliarias que quieres probar
const INMOBILIARIAS_A_PROBAR = ['bienco', 'uribienes', 'las_vegas']; 

const MOCK_MEETINGS_DATA = {
    "total": 1,
    "from": null,
    "to": null,
    "data": [
        {
            "meeting_id": 12345,
            "start_date": "2025-08-25 7:00:00",
            "finish_date": "2025-08-30 18:59:59",
            "property_id": 3319903,
            "property_code": "122027",
            "broker_name": "Perenzano Perez",
            "title": "MOSTRAR INMUEBLE Perenzano Perez 3:00 PM",
            "notes": "CRM - 1.162.781",
            "place": "Calle 41 NORTE # 6BN - 34",
            "rol": 1,
            "type_id": 243,
            "type": "MOSTRAR INMUEBLE",
            "status": "Cancelada",
            "branch_id": 54,
            "branch": "Bienco Cali Norte",
            "user": "Perenzano Perez",
            "service": 1,
            "nd": 1,
            "verified": 0,
            "can_edit": 0,
            "opportunity": 16942,
            "opportunity_code": 10778,
            "property_image": "http://pictures.domus.la/inmobiliaria_301/5685_0_3675632.jpeg",
            "person": [
                {
                    "person_id": 42058,
                    "person_document": "",
                    "verification_number": "0",
                    "document_type": "Cédula de Ciudadania",
                    "name": "Fulanita de tal",
                    "last_name": "",
                    "email": "Fulana2008@hotmail.com",
                    "city": "CALI",
                    "phone": null //"3174601278,"
                }
            ],
            "broker": {
                "broker_id": 260,
                "broker_name": "Perenzano Perez",
                "broker_document": "9697639",
                "broker_phone": "4855656,",
                "broker_mobil_phone": "3185141430,",
                "broker_email": "Perenzano.perez@bienco.com.co",
                "broker_photo": "http://pictures.domus.la/perfiles/inmobiliaria_301/min_11900_0.JPG"
            }
        }
    ]
};

const { sendDailyReminders } = require('./src/jobs/reminders');
const { sendSurveys } = require('./src/jobs/surveys');
const { sendWeeklyReports } = require('./src/jobs/reports');

async function runTest() {
    console.log("--- INICIANDO PRUEBA COMPLETA DE FUNCIONES API ---");

    // --- Prueba de Wise CX (sin enviar un caso real) ---
    console.log("\n-> Probando la conexión con la API de Wise CX...");
    const wiseResponse = await wiseApi.createCaseAndSend({
        group_id: parseInt(process.env.WISE_GROUP_ID),
        source_channel: "whatsapp",
        subject: "PRUEBA DE CONEXIÓN",
        activities: [{
            type: "note",
            channel: "internal",
            user_id: 0,
            content: "Esta es una nota de prueba para validar la creación de casos."
        }]
    });

    if (wiseResponse) {
        console.log("✅Conexión con Wise CX exitosa.");
    } else {
        console.error("❌Conexión con Wise CX fallida.");
    }
    
    // --- Prueba de la API de Domus ---
    for (const inmobiliaria of INMOBILIARIAS_A_PROBAR) {
        console.log(`\n--- Probando API de Domus para ${inmobiliaria.toUpperCase()} ---`);
        
        // 1. getMeetingsForDay
        console.log(`  - Probando getMeetingsForDay...`);
        const hoy = moment().format('YYYY-MM-DD');
        let meetingsToday = await domusApi.getMeetingsForDay(inmobiliaria, moment().format('YYYY-MM-DD'));
        
        if (meetingsToday.data.length === 0) {
            meetingsToday = MOCK_MEETINGS_DATA;
            console.log(`⚠️ Se usaron datos de prueba para getMeetingsForDay.`);
        } else {
            console.log(`✅ getMeetingsForDay consumió la API exitosamente.`);
        }
        console.log(`Citas encontradas: ${meetingsToday.data.length}`);

        // 2. getWeeklyMeetings
        console.log(` - Probando getWeeklyMeetings...`);
        let weeklyMeetings = await domusApi.getWeeklyMeetings(inmobiliaria);
        
        if (weeklyMeetings.data.length === 0) {
            weeklyMeetings = MOCK_MEETINGS_DATA;
            console.log(`⚠️ Se usaron datos de prueba para getWeeklyMeetings.`);
        } else {
            console.log(`✅ getWeeklyMeetings consumió la API exitosamente.`);
        }
        console.log(`Citas encontradas: ${weeklyMeetings.data.length}`);

        // 3. getConcludedMeetings
        console.log(` - Probando getConcludedMeetings...`);
        const lastWeekStart = moment().subtract(7, 'days').startOf('week').format('YYYY-MM-DD HH:mm:ss');
        const lastWeekEnd = moment().subtract(7, 'days').endOf('week').format('YYYY-MM-DD HH:mm:ss');
        let concludedMeetings = await domusApi.getConcludedMeetings(inmobiliaria, lastWeekStart, lastWeekEnd);
        
        if (concludedMeetings.data.length === 0) {
            concludedMeetings = MOCK_MEETINGS_DATA;
            console.log(`⚠️ Se usaron datos de prueba para getConcludedMeetings.`);
        } else {
            console.log(`✅ getConcludedMeetings consumió la API exitosamente.`);
        }
        console.log(`Citas encontradas: ${concludedMeetings.data.length}`);

        // 4. getOwnerDetails
        console.log(` - Probando getOwnerDetails...`);
        const propertyCode = TEST_PROPERTY_CODES[inmobiliaria];
        const ownerDetails = await domusApi.getOwnerDetails(inmobiliaria, propertyCode);
        if (ownerDetails) {
            console.log(`✅ getOwnerDetails exitoso. Propietario encontrado: ${ownerDetails.name} ${ownerDetails.last_name}`);
        } else {
            console.error("❌ getOwnerDetails falló.");
        }

        // 5. getOwnerLink
        console.log(` - Probando getOwnerLink...`);
        const propertyId = TEST_PROPERTY_IDS[inmobiliaria];
        const startDate = moment().startOf('month').format('YYYY-MM-DD');
        const endDate = moment().endOf('month').format('YYYY-MM-DD');
        const ownerLinkResponse = await domusApi.getOwnerLink(inmobiliaria, propertyId, startDate, endDate);
        if (ownerLinkResponse && ownerLinkResponse.data && ownerLinkResponse.data.data) {
            const link = `https://crm.domus.la${ownerLinkResponse.data.data}`;
            console.log(`✅ getOwnerLink exitoso. Enlace generado: ${link}`);
        } else {
            console.error("❌ getOwnerLink falló o no devolvió un enlace válido.");
        }

    }
    console.log("\n--- PRUEBA DE CONEXIONES FINALIZADA ---");

    console.log("--- INICIANDO PRUEBA DEL JOB DE RECORDATORIOS DIARIOS ---");
    await sendDailyReminders();
    
    console.log("\n--- PRUEBA DEL JOB DE RECORDATORIOS DIARIOS FINALIZADA ---");


    console.log("--- INICIANDO PRUEBA DEL JOB DE ENCUESTAS ---");

    // Llama a la función principal de encuestas
    await sendSurveys();

    console.log("\n--- PRUEBA DEL JOB DE ENCUESTAS FINALIZADA ---");

    console.log("--- INICIANDO PRUEBA DEL JOB DE REPORTES SEMANALES ---");
    
    try {
        // Simula la respuesta de las APIs para el escenario de éxito
        domusApi.getCitasDeLaSemana = async () => MOCK_MEETINGS_DATA;
        domusApi.getOwnerDetails = async () => ({
            name: "Juan Perez",
            phone: null, //"3101234567",
            email: "juan@example.com"
        });

        domusApi.getOwnerLink = async (inmobiliaria, propertyIdpro, fechaInicio, fechaFin) => ({
            data: { data: '/file/link_de_prueba' }
        });
        
        wiseApi.createCaseAndSend = async (payload) => {
            console.log("✅ API Wise CX simulada: Mensaje de email generado.");
            console.log(payload.activities[0].content);
            return true;
        };

        // Llama a la función que queremos probar
        await sendWeeklyReports();

        console.log("✅ Prueba del job de reportes semanales exitosa.");
        
    } catch (error) {
        console.error("❌ La prueba del job de reportes semanales falló. Error:", error);
    }
    
    console.log("\n--- PRUEBA DEL JOB DE REPORTES SEMANALES FINALIZADA ---");

}

runTest();
