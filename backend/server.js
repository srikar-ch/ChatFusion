require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// --- Simulated Fallback Models ---
const simulateChatGPT = (query) => `[SIMULATED] ChatGPT: Here is a detailed explanation for "${query}". Please add OPENAI_API_KEY to .env for real responses.`;
const simulateGemini = (query) => `[SIMULATED] Gemini: Here are the key insights about "${query}". Please add GEMINI_API_KEY to .env for real responses.`;
const simulateClaude = (query) => `[SIMULATED] Claude: I've analyzed "${query}". Please add CLAUDE_API_KEY to .env for real responses.`;
const simulateGrok = (query) => `[SIMULATED] Grok: Analyzing "${query}". Please add GROK_API_KEY to .env for real responses.`;
const simulateDeepSeek = (query) => `[SIMULATED] DeepSeek: Data analysis for "${query}". Please add DEEPSEEK_API_KEY to .env for real responses.`;

// --- Real API Integration Wrappers (via OpenRouter) ---

async function fetchFromOpenRouter(modelId, query, prefix) {
    if (!process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY.includes('your_')) {
        // Fallback to simulation if key is missing
        if (prefix === 'ChatGPT') return simulateChatGPT(query);
        if (prefix === 'Gemini') return simulateGemini(query);
        if (prefix === 'Claude') return simulateClaude(query);
        if (prefix === 'Grok') return simulateGrok(query);
        if (prefix === 'DeepSeek') return simulateDeepSeek(query);
    }

    try {
        const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
            model: modelId,
            messages: [{ role: 'user', content: query }]
        }, {
            headers: { 
                'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                'HTTP-Referer': 'http://localhost:3000', // Optional, for OpenRouter rankings
                'X-Title': 'ChatFusion Orchestration'    // Optional, for OpenRouter rankings
            }
        });
        return `${prefix}: ` + response.data.choices[0].message.content;
    } catch (error) {
        console.error(`${prefix} Error:`, error.response?.data || error.message);
        return `${prefix}: Request failed - ${error.message}`;
    }
}

async function fetchChatGPT(query) {
    return fetchFromOpenRouter('openai/gpt-3.5-turbo', query, 'ChatGPT');
}

async function fetchGemini(query) {
    return fetchFromOpenRouter('google/gemini-2.0-flash-exp:free', query, 'Gemini');
}

async function fetchClaude(query) {
    return fetchFromOpenRouter('anthropic/claude-3-haiku:beta', query, 'Claude');
}

async function fetchGrok(query) {
    return fetchFromOpenRouter('x-ai/grok-beta', query, 'Grok');
}

async function fetchDeepSeek(query) {
    return fetchFromOpenRouter('deepseek/deepseek-chat', query, 'DeepSeek');
}


// --- Orchestration Meta-LLM Logic ---
async function evaluateAndRankResponses(responsesObj) {
    const evaluatedList = [];
    let modelsUsed = [];
    let masterPromptContext = "You are ChatFusion, an expert AI Orchestrator. Your job is to synthesize a single, flawless, highly-detailed master response by combining the best unique points from the following AI models.\n\nHere is what they said:\n\n";

    for (const [key, text] of Object.entries(responsesObj)) {
        if (!text) continue;
        
        const cleanText = text.replace(/^(?:\[SIMULATED\]\s)?[a-zA-Z]+:\s/, ''); // strip prefixes
        
        // Keep a basic structural simulated score for the ranking table UI 
        const lengthScore = Math.min(cleanText.length / 50, 10);
        const randomBonus = Math.random() * 5; 
        const totalScore = lengthScore + randomBonus;
        
        evaluatedList.push({
            model: key,
            text: text,
            cleanText: cleanText,
            score: totalScore
        });
    }

    // Rank from highest structural score to lowest
    evaluatedList.sort((a, b) => b.score - a.score);
    
    // Build the master context for the LLM using the top ranking responses
    for (let i = 0; i < Math.min(evaluatedList.length, 5); i++) {
        const item = evaluatedList[i];
        modelsUsed.push(item.model);
        masterPromptContext += `### [${item.model}] ###\n${item.cleanText}\n\n`;
    }

    masterPromptContext += "Synthesize a comprehensive, well-structured final response in Markdown format. Do not mention the individual models in your output. Just provide the final synthesized answer.";

    let finalSynthesizedText = "";
    
    // Call the Meta-LLM Synthesizer (using Google Gemini 2.0 Flash via OpenRouter for fast synthesis)
    try {
        if (!process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY.includes('your_')) {
             throw new Error("No API key"); // fallback if simulated
        }
        
        const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
            model: 'google/gemini-2.0-flash-exp:free',
            messages: [{ role: 'system', content: masterPromptContext }]
        }, {
            headers: { 
                'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                'HTTP-Referer': 'http://localhost:3000',
                'X-Title': 'ChatFusion Meta-Synthesizer'
            }
        });
        
        finalSynthesizedText = response.data.choices[0].message.content;
    } catch (error) {
        console.log("Meta-LLM Fallback Triggered.");
        // Fallback to basic string parsing if true LLM fails or keys are missing
        const combinedSentences = new Set();
        for (let i = 0; i < Math.min(evaluatedList.length, 3); i++) {
            const sentences = evaluatedList[i].cleanText.split('. ').filter(s => s.trim().length > 0);
            sentences.forEach(s => combinedSentences.add(s));
        }
        finalSynthesizedText = Array.from(combinedSentences).join('. ') + ".";
    }

    // Append citation footer
    finalSynthesizedText += `\n\n*(Synthesized from uniquely valuable insights primarily provided by: ${modelsUsed.join(', ')}.)*`;

    return {
        ranking: evaluatedList.map((item, index) => ({
            rank: index + 1,
            model: item.model,
            preview: item.text.substring(0, 40).replace(/^(?:\[SIMULATED\]\s)?/, '') + "..."
        })),
        finalResponse: finalSynthesizedText
    };
}

// --- API Endpoint ---
app.post('/chat', async (req, res) => {
    const userQuestion = req.body.question;
    const activeModels = req.body.activeModels || [];
    
    if (!userQuestion) return res.status(400).json({ error: "Question is required" });
    if (!Array.isArray(activeModels) || activeModels.length === 0) {
        return res.status(400).json({ error: "At least one active model must be selected." });
    }

    const responses = {};
    const promises = [];

    // Launch all active model requests in parallel
    if (activeModels.includes('chatgpt')) promises.push(fetchChatGPT(userQuestion).then(r => responses['ChatGPT'] = r));
    if (activeModels.includes('gemini')) promises.push(fetchGemini(userQuestion).then(r => responses['Gemini'] = r));
    if (activeModels.includes('claude')) promises.push(fetchClaude(userQuestion).then(r => responses['Claude'] = r));
    if (activeModels.includes('grok')) promises.push(fetchGrok(userQuestion).then(r => responses['Grok'] = r));
    if (activeModels.includes('deepseek')) promises.push(fetchDeepSeek(userQuestion).then(r => responses['DeepSeek'] = r));

    // Wait for all responses to finish
    await Promise.all(promises);

    // Orchestration
    let finalResponse = null;
    let ranking = [];
    let confidenceScore = null;

    if (activeModels.length > 1) {
        const orchestrationResult = await evaluateAndRankResponses(responses);
        finalResponse = orchestrationResult.finalResponse;
        ranking = orchestrationResult.ranking;
        confidenceScore = Math.floor(Math.random() * (99 - 85 + 1)) + 85; // Simulated confidence math logic
    } else {
        const singleModelName = Object.keys(responses)[0];
        finalResponse = responses[singleModelName].replace(/^(?:\[SIMULATED\]\s)?[a-zA-Z]+:\s/, '');
        confidenceScore = Math.floor(Math.random() * (100 - 92 + 1)) + 92;
    }

    res.json({
        individualResponses: responses,
        ranking: ranking,
        final: finalResponse,
        confidenceScore: confidenceScore,
        modelsUsed: activeModels.length
    });
});

app.listen(PORT, () => {
    console.log(`ChatFusion Orchestration server running on http://localhost:${PORT}`);
    console.log(`Environment config: dotenv loaded.`);
});
