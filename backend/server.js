require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

/* ✅ ROOT ROUTE (VERY IMPORTANT) */
app.get('/', (req, res) => {
  res.send('ChatFusion backend is running');
});

/* -------- SIMULATED RESPONSES -------- */
const simulateChatGPT = (q) => `[SIMULATED] ChatGPT: Explanation for "${q}"`;
const simulateGemini = (q) => `[SIMULATED] Gemini: Insights about "${q}"`;
const simulateClaude = (q) => `[SIMULATED] Claude: Analysis of "${q}"`;
const simulateGrok = (q) => `[SIMULATED] Grok: Processing "${q}"`;
const simulateDeepSeek = (q) => `[SIMULATED] DeepSeek: Data for "${q}"`;

/* -------- OPENROUTER API CALL -------- */
async function fetchFromOpenRouter(model, query, name) {
  if (!process.env.OPENROUTER_API_KEY) {
    if (name === 'ChatGPT') return simulateChatGPT(query);
    if (name === 'Gemini') return simulateGemini(query);
    if (name === 'Claude') return simulateClaude(query);
    if (name === 'Grok') return simulateGrok(query);
    if (name === 'DeepSeek') return simulateDeepSeek(query);
  }

  try {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: model,
        messages: [{ role: 'user', content: query }]
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`
        }
      }
    );

    return `${name}: ${response.data.choices[0].message.content}`;
  } catch (err) {
    return `${name}: Error`;
  }
}

/* -------- MODEL FUNCTIONS -------- */
const fetchChatGPT = (q) => fetchFromOpenRouter('openai/gpt-3.5-turbo', q, 'ChatGPT');
const fetchGemini = (q) => fetchFromOpenRouter('google/gemini-2.0-flash-exp:free', q, 'Gemini');
const fetchClaude = (q) => fetchFromOpenRouter('anthropic/claude-3-haiku:beta', q, 'Claude');
const fetchGrok = (q) => fetchFromOpenRouter('x-ai/grok-beta', q, 'Grok');
const fetchDeepSeek = (q) => fetchFromOpenRouter('deepseek/deepseek-chat', q, 'DeepSeek');

/* -------- MAIN API -------- */
app.post('/chat', async (req, res) => {
  const { question, activeModels } = req.body;

  if (!question) {
    return res.status(400).json({ error: "Question required" });
  }

  if (!activeModels || activeModels.length === 0) {
    return res.status(400).json({ error: "Select at least one model" });
  }

  const responses = {};
  const promises = [];

  if (activeModels.includes('chatgpt')) {
    promises.push(fetchChatGPT(question).then(r => responses.ChatGPT = r));
  }

  if (activeModels.includes('gemini')) {
    promises.push(fetchGemini(question).then(r => responses.Gemini = r));
  }

  if (activeModels.includes('claude')) {
    promises.push(fetchClaude(question).then(r => responses.Claude = r));
  }

  if (activeModels.includes('grok')) {
    promises.push(fetchGrok(question).then(r => responses.Grok = r));
  }

  if (activeModels.includes('deepseek')) {
    promises.push(fetchDeepSeek(question).then(r => responses.DeepSeek = r));
  }

  await Promise.all(promises);

  res.json({
    individualResponses: responses,
    final: Object.values(responses).join("\n\n"),
    modelsUsed: activeModels.length
  });
});

/* -------- START SERVER -------- */
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});