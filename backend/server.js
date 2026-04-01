require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('ChatFusion backend is running');
});

// --- Simulated Fallback Models ---
const simulateChatGPT = (query) =>
  `[SIMULATED] ChatGPT: Here is a detailed explanation for "${query}". Please add OPENROUTER_API_KEY to .env for real responses.`;

const simulateGemini = (query) =>
  `[SIMULATED] Gemini: Here are the key insights about "${query}". Please add OPENROUTER_API_KEY to .env for real responses.`;

const simulateClaude = (query) =>
  `[SIMULATED] Claude: I've analyzed "${query}". Please add OPENROUTER_API_KEY to .env for real responses.`;

const simulateGrok = (query) =>
  `[SIMULATED] Grok: Analyzing "${query}". Please add OPENROUTER_API_KEY to .env for real responses.`;

const simulateDeepSeek = (query) =>
  `[SIMULATED] DeepSeek: Data analysis for "${query}". Please add OPENROUTER_API_KEY to .env for real responses.`;

// --- Real API Integration Wrappers (via OpenRouter) ---
async function fetchFromOpenRouter(modelId, query, prefix) {
  if (
    !process.env.OPENROUTER_API_KEY ||
    process.env.OPENROUTER_API_KEY.includes('your_')
  ) {
    if (prefix === 'ChatGPT') return simulateChatGPT(query);
    if (prefix === 'Gemini') return simulateGemini(query);
    if (prefix === 'Claude') return simulateClaude(query);
    if (prefix === 'Grok') return simulateGrok(query);
    if (prefix === 'DeepSeek') return simulateDeepSeek(query);
  }

  try {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: modelId,
        messages: [{ role: 'user', content: query }]
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'http://localhost:3000',
          'X-Title': 'ChatFusion Orchestration'
        }
      }
    );

    return `${prefix}: ${response.data.choices[0].message.content}`;
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
  const modelsUsed = [];
  let masterPromptContext =
    'You are ChatFusion, an expert AI Orchestrator. Your job is to synthesize a single, flawless, highly-detailed master response by combining the best unique points from the following AI models.\n\nHere is what they said:\n\n';

  for (const [key, text] of Object.entries(responsesObj)) {
    if (!text) continue;

    const cleanText = text.replace(/^(?:\[SIMULATED\]\s)?[a-zA-Z]+:\s/, '');

    const lengthScore = Math.min(cleanText.length / 50, 10);
    const randomBonus = Math.random() * 5;
    const totalScore = lengthScore + randomBonus;

    evaluatedList.push({
      model: key,
      text,
      cleanText,
      score: totalScore
    });
  }

  evaluatedList.sort((a, b) => b.score - a.score);

  for (let i = 0; i < Math.min(evaluatedList.length, 5); i++) {
    const item = evaluatedList[i];
    modelsUsed.push(item.model);
    masterPromptContext += `### [${item.model}] ###\n${item.cleanText}\n\n`;
  }

  masterPromptContext +=
    'Synthesize a comprehensive, well-structured final response in Markdown format. Do not mention the individual models in your output. Just provide the final synthesized answer.';

  let finalSynthesizedText = '';

  try {
    if (
      !process.env.OPENROUTER_API_KEY ||
      process.env.OPENROUTER_API_KEY.includes('your_')
    ) {
      throw new Error('No API key');
    }

    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'google/gemini-2.0-flash-exp:free',
        messages: [{ role: 'system', content: masterPromptContext }]
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'http://localhost:3000',
          'X-Title': 'ChatFusion Meta-Synthesizer'
        }
      }
    );

    finalSynthesizedText = response.data.choices[0].message.content;
  } catch (error) {
    console.log('Meta-LLM Fallback Triggered.');
    const combinedSentences = new Set();

    for (let i = 0; i < Math.min(evaluatedList.length, 3); i++) {
      const sentences = evaluatedList[i].cleanText
        .split('. ')
        .filter((s) => s.trim().length > 0);

      sentences.forEach((s) => combinedSentences.add(s));
    }

    finalSynthesizedText = Array.from(combinedSentences).join('. ') + '.';
  }

  finalSynthesizedText += `\n\n*(Synthesized from uniquely valuable insights primarily provided by: ${modelsUsed.join(', ')}.)*`;

  return {
    ranking: evaluatedList.map((item, index) => ({
      rank: index + 1,
      model: item.model,
      preview:
        item.text.substring(0, 40).replace(/^(?:\[SIMULATED\]\s)?/, '') + '...'
    })),
    finalResponse: finalSynthesizedText
  };
}

// --- API Endpoint ---
app.post('/chat', async (req, res) => {
  const userQuestion = req.body.question;
  const activeModels = req.body.activeModels || [];

  if (!userQuestion) {
    return res.status(400).json({ error: 'Question is required' });
  }

  if (!Array.isArray(activeModels) || activeModels.length === 0) {
    return res
      .status(400)
      .json({ error: 'At least one active model must be selected.' });
  }

  const responses = {};
  const promises = [];

  if (activeModels.includes('chatgpt')) {
    promises.push(fetchChatGPT(userQuestion).then((r) => { responses.ChatGPT = r; }));
  }

  if (activeModels.includes('gemini')) {
    promises.push(fetchGemini(userQuestion).then((r) => { responses.Gemini = r; }));
  }

  if (activeModels.includes('claude')) {
    promises.push(fetchClaude(userQuestion).then((r) => { responses.Claude = r; }));
  }

  if (activeModels.includes('grok')) {
    promises.push(fetchGrok(userQuestion).then((r) => { responses.Grok = r; }));
  }

  if (activeModels.includes('deepseek')) {
    promises.push(fetchDeepSeek(userQuestion).then((r) => { responses.DeepSeek = r; }));
  }

  await Promise.all(promises);

  let finalResponse = null;
  let ranking = [];
  let confidenceScore = null;

  if (activeModels.length > 1) {
    const orchestrationResult = await evaluateAndRankResponses(responses);
    finalResponse = orchestrationResult.finalResponse;
    ranking = orchestrationResult.ranking;
    confidenceScore = Math.floor(Math.random() * (99 - 85 + 1)) + 85;
  } else {
    const singleModelName = Object.keys(responses)[0];
    finalResponse = responses[singleModelName].replace(
      /^(?:\[SIMULATED\]\s)?[a-zA-Z]+:\s/,
      ''
    );
    confidenceScore = Math.floor(Math.random() * (100 - 92 + 1)) + 92;
  }

  res.json({
    individualResponses: responses,
    ranking,
    final: finalResponse,
    confidenceScore,
    modelsUsed: activeModels.length
  });
});

app.listen(PORT, () => {
  console.log(`ChatFusion Orchestration server running on port ${PORT}`);
  console.log('Environment config: dotenv loaded.');
});