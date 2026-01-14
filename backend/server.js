require("dotenv").config();
const express = require("express");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const cors = require("cors");
const Groq = require("groq-sdk");

const app = express();
const port = 5000;

app.use(cors());
app.use(express.json());

// Memory upload
const upload = multer({ storage: multer.memoryStorage() });

// Global session storage
// stores array of { fileName, text }
let currentSession = {
    documents: [],
    history: []
};

// Initialize Groq
// Defaults to process.env.GROQ_API_KEY
const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

function cleanAIResponse(text) {
    return text.replace(/```json/g, "").replace(/```/g, "").trim();
}

// Helper to get combined context
function getCombinedContext() {
    if (currentSession.documents.length === 0) return "";
    const fullText = currentSession.documents.map(d => `--- DOCUMENT: ${d.fileName} ---\n${d.text}`).join("\n\n");
    // Limit context to ~20k chars as requested
    return fullText.slice(0, 20000);
}

// Helper: safe Groq call with Retry Logic (Backoff)
async function callGroqWithRetry(messages, model, jsonMode = false, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const options = {
                messages,
                model,
            };
            if (jsonMode) {
                options.response_format = { type: "json_object" };
            }

            const completion = await groq.chat.completions.create(options);
            return completion;

        } catch (error) {
            // Check for Rate Limit (429)
            if (error.status === 429) {
                console.warn(`[Groq] Rate limit hit. Retry ${i + 1}/${retries}...`);

                // Extract 'retry-after' header if available, default to exponential backoff
                const retryAfter = error.headers && error.headers['retry-after']
                    ? parseInt(error.headers['retry-after']) * 1000
                    : 2000 * Math.pow(2, i); // 2s, 4s, 8s

                await new Promise(resolve => setTimeout(resolve, retryAfter));
            } else {
                // If it's not a rate limit (e.g. 400 or 500), throw immediately
                throw error;
            }
        }
    }
    throw new Error(`Groq API failed after ${retries} retries.`);
}


// DIAGNOSTIC ENDPOINT
app.get("/test-ai", async (req, res) => {
    try {
        console.log("Testing AI Model Connection (Groq)...");
        const completion = await callGroqWithRetry(
            [{ role: "user", content: "Hello, are you working?" }],
            "llama-3.1-8b-instant"
        );
        const text = completion.choices[0]?.message?.content || "";
        console.log("AI Connection Success:", text);
        return res.json({ success: true, message: text, model: "llama-3.1-8b-instant" });
    } catch (err) {
        console.error("AI Connection Failed:", err);
        return res.status(500).json({ error: err.message, detailed: err });
    }
});

app.post("/upload", upload.single("pdf"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No PDF file uploaded" });
        }

        console.log(`Processing PDF: ${req.file.originalname}`);
        const pdf = await pdfParse(req.file.buffer);

        // Add to documents array
        currentSession.documents.push({
            fileName: req.file.originalname,
            text: pdf.text
        });

        console.log(`Added ${req.file.originalname}. Total docs: ${currentSession.documents.length}`);

        // Generate Suggestions: STATIC now, per requirements (Never call AI during PDF upload)
        const suggestions = [
            "Summarize this document",
            "What are the key findings?",
            "Explain the main topic"
        ];

        return res.json({
            success: true,
            fileName: req.file.originalname,
            // Return simple list of file names
            allFiles: currentSession.documents.map(d => d.fileName),
            suggestions,
            message: "PDF Processed."
        });

    } catch (err) {
        console.error("Endpoint Error:", err);
        const statusCode = err.status || 500;
        res.status(statusCode).json({
            error: statusCode === 429
                ? "Too Many Requests. Please wait 30-60 seconds and try again."
                : "Processing failed: " + err.message
        });
    }
});

app.post("/chat", async (req, res) => {
    try {
        const { message } = req.body;
        const context = getCombinedContext();

        if (!context) {
            return res.status(400).json({ error: "No documents loaded. Please upload a PDF first." });
        }

        const systemInstruction = `You are NoteBookCW, an intelligent PDF document analysis assistant.
Rules:
1. Answer strictly based on the provided PDF documents.
2. Do not use external knowledge or invent answers.
3. Be concise, structured, and professional.
4. If the user uploads large PDFs, process them in smaller chunks to avoid hitting token limits.
5. If you hit a rate-limit error, pause and retry automatically up to 3 times. Use the 'retry-after' header if provided.`;

        const userPrompt = `
      DOCUMENTS CONTENT:
      """
      ${context}
      """

      USER QUESTION: ${message}
      
      Answer based ONLY on the documents provided.  If the answer is not in the documents, clearly state "Information not available in provided documents."
    `;

        const completion = await callGroqWithRetry([
            { role: "system", content: systemInstruction },
            { role: "user", content: userPrompt }
        ],
            "llama-3.1-8b-instant"
        );

        const answer = completion.choices[0]?.message?.content || "";

        return res.json({ answer });

    } catch (err) {
        console.error("Groq Error:", err);
        const statusCode = err.status || 500;
        res.status(statusCode).json({
            error: "AI processing failed."
        });
    }
});

app.post("/briefing", async (req, res) => {
    try {
        const context = getCombinedContext();
        if (!context) return res.status(400).json({ error: "No PDF loaded" });

        console.log(`[BRIEFING] Generating for context length: ${context.length} chars...`);

        const systemInstruction = `You are NoteBookCW, an intelligent PDF document analysis assistant.
Rules:
1. Answer strictly based on the provided PDF documents.
2. Do not use external knowledge or invent answers.
3. Be concise, structured, and professional.`;

        const userPrompt = `
      Create a "NotebookCW Briefing Doc" for these documents.
      Include:
      1. A flexible summary of the main argument across all files.
      2. Key Themes (bullet points).
      3. A Glossary of key terms (if applicable).
      Format the output in clean Markdown.

      Documents:
      """${context}"""
    `;

        const completion = await callGroqWithRetry([
            { role: "system", content: systemInstruction },
            { role: "user", content: userPrompt }
        ],
            "llama-3.1-8b-instant"
        );

        const briefing = completion.choices[0]?.message?.content || "";
        return res.json({ briefing });

    } catch (err) {
        console.error("[BRIEFING ERROR]", err);
        res.status(500).json({
            error: "Briefing failed: " + err.message
        });
    }
});

app.post("/quiz", async (req, res) => {
    try {
        const { numQuestions = 10 } = req.body; // Default to 10
        const count = parseInt(numQuestions) || 10;

        const context = getCombinedContext();
        if (!context) return res.status(400).json({ error: "No PDF loaded" });

        console.log(`[QUIZ] Generating ${count} questions for context length: ${context.length} chars...`);

        const systemInstruction = `You are NoteBookCW. Generate a quiz in strict JSON format.`;

        const userPrompt = `
      Generate a Quiz (Multiple Choice / QCM) based on these documents.
      Create ${count} questions.
      Return the output strictly as a JSON array of objects.
      Format:
      [
        {
          "question": "Question text here?",
          "options": ["A", "B", "C", "D"],
          "answer": "The correct answer text (must match one option exactly)"
        }
      ]

      Documents:
      """${context}"""
    `;

        const completion = await callGroqWithRetry([
            { role: "system", content: systemInstruction },
            { role: "user", content: userPrompt }
        ],
            "llama-3.1-8b-instant",
            true // JSON mode
        );

        const text = completion.choices[0]?.message?.content || "";
        let quiz = [];
        try {
            const parsed = JSON.parse(cleanAIResponse(text));
            // Handle potential { "quiz": [...] } wrapper from AI
            if (Array.isArray(parsed)) {
                quiz = parsed;
            } else if (parsed.quiz && Array.isArray(parsed.quiz)) {
                quiz = parsed.quiz;
            } else if (parsed.questions && Array.isArray(parsed.questions)) {
                quiz = parsed.questions;
            } else {
                // fallback if it's just a single object or something else
                console.error("Unexpected JSON structure for quiz:", parsed);
            }
        } catch (e) {
            console.error("Failed to parse Quiz JSON", e);
            return res.status(500).json({ error: "Failed to generate valid quiz JSON: " + e.message });
        }

        return res.json({ quiz });

    } catch (err) {
        console.error("[QUIZ ERROR]", err);
        res.status(500).json({
            error: "Quiz failed: " + err.message
        });
    }
});

// Image Generation Endpoint
app.post("/generate-image", async (req, res) => {
    try {
        const { prompt } = req.body;
        if (!prompt) {
            return res.status(400).json({ error: "Prompt is required" });
        }

        console.log(`[IMAGE GEN] Generating for prompt: "${prompt}"...`);

        const response = await fetch("https://subnp.com/api/free/generate", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
                // Authorization header removed as it may conflict with the free endpoint
            },
            body: JSON.stringify({
                prompt,
                model: "magic"
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Subnp API error (${response.status}): ${errorText || response.statusText}`);
        }

        // Subnp API returns a stream (SSE)
        const decoder = new TextDecoder();
        let imageUrl = null;
        let errorMessage = null;
        let buffer = "";

        // Using for-await-of for cleaner stream processing in Node.js
        for await (const value of response.body) {
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");

            // Keep the last partial line in the buffer
            buffer = lines.pop();

            for (const line of lines) {
                const trimmedLine = line.trim();
                if (trimmedLine.startsWith("data: ")) {
                    try {
                        const data = JSON.parse(trimmedLine.slice(6));
                        console.log(`[IMAGE GEN CHUNK] status: ${data.status}`);

                        if (data.status === "complete" && data.imageUrl) {
                            imageUrl = data.imageUrl;
                        } else if (data.status === "error") {
                            errorMessage = data.message || data.error || "Subnp service error";
                        }
                    } catch (e) {
                        console.warn("[IMAGE GEN] JSON parse error on chunk", e.message);
                    }
                }
            }
            if (imageUrl || errorMessage) break;
        }

        if (imageUrl) {
            console.log(`[IMAGE GEN] Success: ${imageUrl}`);
            return res.json({ imageUrl });
        } else {
            throw new Error(errorMessage || "Failed to generate image URL from stream.");
        }

    } catch (err) {
        console.error("[IMAGE GEN ERROR]", err);
        res.status(500).json({
            error: "Image generation failed: " + err.message
        });
    }
});

app.listen(port, () => {
    console.log(`🧠 NotebookCW Server running at http://localhost:${port}`);
});
