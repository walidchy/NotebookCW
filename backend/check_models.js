require("dotenv").config();

async function listModels() {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
        console.error("No API KEY found in .env");
        return;
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;

    console.log("Fetching models from:", url.replace(key, "HIDDEN_KEY"));

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
            console.error("API Error:", data.error);
        } else if (data.models) {
            console.log("Available Models:");
            data.models.forEach(m => {
                if (m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent")) {
                    console.log(`- ${m.name}`);
                }
            });
        } else {
            console.log("No models found or unexpected response:", data);
        }
    } catch (err) {
        console.error("Network Error:", err);
    }
}

listModels();
