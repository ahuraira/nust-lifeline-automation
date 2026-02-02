
const API_URL = 'https://script.google.com/macros/s/AKfycbwnJ0kfZ5vDsGLLwwo24B5V3sR4yvSCifwihmIMAB05ORHXxW5iKx9pxhtc7JQxIoCkaQ/exec';

async function verifyApi() {
    console.log('🔍 Connecting to API...');
    console.log(`URL: ${API_URL}`);

    try {
        const response = await fetch(`${API_URL}?action=composition&key=LIFELINE_DASHBOARD_2026`, {
            redirect: 'follow'
        });

        if (!response.ok) {
            throw new Error(`HTTP Error: ${response.status}`);
        }

        const data = await response.text();
        console.log('\n📄 RAW RESPONSE:');
        console.log(data);

        try {
            const json = JSON.parse(data);
            console.log('\n✅ JSON Parsed Successfully');

            console.log('\n📊 AFFILIATION DATA CHECK:');
            if (json.affiliation) {
                console.log(`Type: ${Array.isArray(json.affiliation) ? 'Array' : typeof json.affiliation}`);
                console.log(`Length: ${json.affiliation.length}`);
                console.log('Sample Item:', json.affiliation[0]);
            } else {
                console.error('❌ "affiliation" field is MISSING!');
            }

            if (json.duration) {
                console.warn('⚠️ "duration" field is STILL PRESENT (Old Cache?)');
            }

        } catch (e) {
            console.error('❌ JSON Parse Failed:', e.message);
        }

    } catch (error) {
        console.error('❌ Network Error:', error.message);
    }
}

verifyApi();
