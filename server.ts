import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, Type, GenerateContentResponse } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '25mb' }));

function getGeminiClient(): GoogleGenAI {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// POST /api/analyze-image
// Analyzes an uploaded photo/screenshot using model gemini-4-argon
// Supports both App/Game Publishing Metadata extraction AND Visual Bug / Traceback Patch generation
app.post('/api/analyze-image', async (req, res) => {
  try {
    const { imageBase64, mimeType, prompt, mode } = req.body;

    if (!imageBase64 || !mimeType) {
      res.status(400).json({ error: 'Missing imageBase64 or mimeType in request body.' });
      return;
    }

    const ai = getGeminiClient();
    const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, '');

    const analysisPrompt =
      prompt && prompt.trim().length > 0
        ? prompt.trim()
        : mode === 'publish-autofill'
          ? 'Analyze this app or game screenshot/photo. Suggest a compelling title, a concise single-line tagline, a detailed description with gameplay or usage instructions, the best category (Game, Creative App, Developer Tool, Utility, or Simulation), a visual quality & accessibility summary, and a sample patch/improvement suggestion.'
          : 'Analyze this uploaded technical image, screenshot, UI capture, or traceback. Identify what is shown, extract key visible text or error details, diagnose any issues or architectural highlights, and provide a concrete unified git .patch diff or code enhancement.';

    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-4-argon',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType,
              data: cleanBase64,
            },
          },
          {
            text: analysisPrompt,
          },
        ],
      },
      config: {
        systemInstruction:
          'You are the core visual intelligence engine for App and Game Playground. Analyze uploaded photos, game artwork, UI screenshots, and code tracebacks with high precision. Always return structured JSON matching the requested schema.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            suggestedTitle: {
              type: Type.STRING,
              description: 'Suggested app/game title or concise diagnostic title (2-80 chars).',
            },
            suggestedTagline: {
              type: Type.STRING,
              description: 'Single-line tagline summarizing the app, game, or visual finding (10-140 chars).',
            },
            suggestedCategory: {
              type: Type.STRING,
              description: 'One of: Game, Creative App, Developer Tool, Utility, Simulation.',
            },
            visualSummary: {
              type: Type.STRING,
              description: 'Detailed analysis of the visual composition, UI layout, gameplay mechanics, or scene contents.',
            },
            extractedText: {
              type: Type.STRING,
              description: 'Any visible text, HUD labels, logs, stack traces, or schema details detected in the image.',
            },
            technicalDiagnosis: {
              type: Type.STRING,
              description: 'Engineering assessment, UX accessibility review, or root-cause bug explanation.',
            },
            generatedPatch: {
              type: Type.STRING,
              description: 'A valid unified diff (.patch) or code snippet implementing a fix or enhancement inspired by the image.',
            },
          },
          required: [
            'suggestedTitle',
            'suggestedTagline',
            'suggestedCategory',
            'visualSummary',
            'extractedText',
            'technicalDiagnosis',
            'generatedPatch',
          ],
        },
      },
    });

    const rawText = response.text || '{}';
    const parsed = JSON.parse(rawText);
    res.json({ result: parsed });
  } catch (error: unknown) {
    console.error('Gemini 4 Argon image analysis error:', error);
    const message = error instanceof Error ? error.message : 'Failed to analyze image with Gemini 4 Argon';
    res.status(500).json({ error: message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`App and Game Playground server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
