import { 
  updateAgentStory, 
  createBackgroundJobLog, 
  appendBackgroundJobLogEntry, 
  updateBackgroundJobLog 
} from '../../lib/supabase';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';

const VALID_THINKING_LEVELS = ['MINIMAL', 'LOW', 'MEDIUM', 'HIGH'] as const;
function storyTimeoutMs(): number {
  const configured = Number(process.env.LLM_STORY_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : 4 * 60 * 1000;
}

type Provider = 'gemini' | 'openai';

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function resolveProvider(): Provider {
  const raw = process.env.LLM_PROVIDER?.trim().toLowerCase();
  if (!raw || raw === 'gemini') return 'gemini';
  if (raw === 'openai') return 'openai';
  throw new Error(`LLM_PROVIDER must be "gemini" or "openai" (received "${process.env.LLM_PROVIDER}")`);
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} not configured`);
  return value;
}

function geminiSettings() {
  const requested = process.env.GEMINI_STORY_THINKING_LEVEL?.toUpperCase();
  const thinkingLevel = (
    VALID_THINKING_LEVELS.includes(requested as typeof VALID_THINKING_LEVELS[number])
      ? requested
      : 'HIGH'
  ) as ThinkingLevel;
  return {
    apiKey: requireEnv('GEMINI_API_KEY'),
    model: process.env.GEMINI_STORY_MODEL?.trim() || 'gemini-3-flash-preview',
    thinkingLevel,
  };
}

function openaiSettings() {
  return {
    baseUrl: requireEnv('LLM_BASE_URL').replace(/\/+$/, ''),
    apiKey: requireEnv('LLM_API_KEY'),
    model: requireEnv('LLM_MODEL'),
  };
}

function buildPrompt(emiten: string, keyStatsData: unknown, provider: Provider): string {
  const today = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  const systemPrompt = "Kamu adalah seorang analis saham profesional Indonesia yang ahli dalam menganalisa story dan katalis pergerakan harga saham.";
  const keyStatsContext = keyStatsData
    ? `\nDATA KEY STATISTICS UNTUK ${emiten}:\n${JSON.stringify(keyStatsData, null, 2)}\n`
    : '';
  const searchLine = provider === 'gemini'
    ? `Cari dan analisa berita-berita TERBARU (bulan ini/minggu ini) tentang emiten saham Indonesia dengan kode ${emiten} dari internet menggunakan Google Search. `
    : `Analisa emiten saham Indonesia dengan kode ${emiten} dari data key statistics yang diberikan dan pengetahuanmu. Jangan mengklaim sudah mencari internet. `;

  const userPrompt = `Hari ini adalah ${today}.
${searchLine}
${keyStatsContext}
FOKUS ANALISA:
1. Fokus sepenuhnya pada STORY BISNIS, AKSI KORPORASI, dan KATALIS fundamental/sentimen.
2. ABAIKAN data harga saham (price action) karena data harga dari internet seringkali tidak akurat atau delay. Jangan menyebutkan angka harga saham spesifik dalam analisis.
3. Hubungkan berita yang ditemukan dengan logika pasar: mengapa berita ini bagus atau buruk untuk masa depan perusahaan?
4. Sebutkan tanggal rilis berita yang kamu gunakan sebagai referensi di dalam deskripsi katalis.
5. Terjemahkan data Key Statistics (pahami data di atas jika tersedia) ke dalam bahasa yang mudah dipahami tapi detail untuk investasi. Berikan kesimpulan apakah data tersebut memberikan signal 'Positif/Sehat', 'Neutral', atau 'Negatif/Hati-hati' untuk investasi jangka pendek dan panjang.

Berikan analisis dalam format JSON dengan struktur berikut (PASTIKAN HANYA OUTPUT JSON, tanpa markdown code block agar mudah di-parse):
{
  "matriks_story": [
    {
      "kategori_story": "Transformasi Bisnis | Aksi Korporasi | Pemulihan Fundamental | Kondisi Makro",
      "deskripsi_katalis": "deskripsi singkat katalis",
      "logika_ekonomi_pasar": "penjelasan logika ekonomi/pasar",
      "potensi_dampak_harga": "dampak terhadap harga saham negatif/netral/positif dan alasan"
    }
  ],
  "swot_analysis": {
    "strengths": ["kekuatan perusahaan"],
    "weaknesses": ["kelemahan perusahaan"],
    "opportunities": ["peluang pasar"],
    "threats": ["ancaman/risiko"]
  },
  "checklist_katalis": [
    {
      "item": "katalis yang perlu dipantau",
      "dampak_instan": "dampak jika terjadi"
    }
  ],
  "strategi_trading": {
    "tipe_saham": "jenis saham (growth/value/turnaround/dll)",
    "target_entry": "area entry yang disarankan",
    "exit_strategy": {
      "take_profit": "target take profit",
      "stop_loss": "level stop loss"
    }
  },
  "keystat_signal": "analisis data key statistics dalam bahasa awam dengan indikasi signal investasi",
  "kesimpulan": "kesimpulan analisis dalam 2-3 kalimat"
}`;

  return `${systemPrompt}\n\n${userPrompt}`;
}

async function generateGeminiText(prompt: string): Promise<{ text: string; model: string; thinkingLevel: string | null }> {
  const settings = geminiSettings();
  const ai = new GoogleGenAI({ apiKey: settings.apiKey });
  const responseStream = await (ai.models as any).generateContentStream({
    model: settings.model,
    config: { thinkingConfig: { thinkingLevel: settings.thinkingLevel } },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    tools: [{ googleSearch: {} }],
  });

  let text = '';
  for await (const chunk of responseStream) {
    if (chunk.text) text += chunk.text;
  }
  return { text, model: settings.model, thinkingLevel: settings.thinkingLevel };
}

async function generateOpenAIText(prompt: string): Promise<{ text: string; model: string; thinkingLevel: null }> {
  const settings = openaiSettings();
  const response = await fetch(`${settings.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.model,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(storyTimeoutMs()),
  });

  if (!response.ok) {
    throw new Error(`OpenAI-compatible request failed: ${response.status}`);
  }

  const payload = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.trim() === '') {
    throw new Error('OpenAI-compatible response has empty choices content');
  }
  return { text: content, model: settings.model, thinkingLevel: null };
}

export default async (req: Request) => {
  const startTime = Date.now();
  let jobLogId: number | null = null;
  const url = new URL(req.url);
  const emiten = url.searchParams.get('emiten')?.toUpperCase();
  const storyId = url.searchParams.get('id');

  console.log('[Agent Story] Starting background analysis...');

  try {
    if (!emiten || !storyId) {
      return new Response(JSON.stringify({ error: 'Missing emiten or id' }), { status: 400 });
    }

    // Create job log entry
    try {
      const jobLog = await createBackgroundJobLog('analyze-story', 1);
      jobLogId = jobLog.id;
      if (jobLogId) {
        await appendBackgroundJobLogEntry(jobLogId, {
          level: 'info',
          message: `Starting AI Story Analysis`,
          emiten,
        });
      }
    } catch (logError) {
      console.error('[Agent Story] Failed to create job log:', logError);
    }

    let keyStatsData = null;
    try {
      const body = await req.json();
      keyStatsData = body.keyStats;
    } catch (e) {
      console.log('[Agent Story] No JSON body found or invalid JSON');
    }

    const provider = resolveProvider();
    const prompt = buildPrompt(emiten, keyStatsData, provider);
    const generated = await withTimeout(
      provider === 'openai' ? generateOpenAIText(prompt) : generateGeminiText(prompt),
      storyTimeoutMs(),
      'Story request timed out'
    );

    await updateAgentStory(parseInt(storyId), {
      status: 'processing',
      model: generated.model,
      thinking_level: generated.thinkingLevel,
    });

    if (jobLogId) {
      await appendBackgroundJobLogEntry(jobLogId, {
        level: 'info',
        message: `Analyzing using ${generated.model}${generated.thinkingLevel ? ` (Thinking ${generated.thinkingLevel})` : ''}...`,
        emiten,
      });
      await appendBackgroundJobLogEntry(jobLogId, {
        level: 'info',
        message: `Model response received, parsing results...`,
        emiten,
      });
    }

    let analysisResult;
    try {
      const jsonMatch = generated.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysisResult = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      const errMsg = 'Failed to parse AI response';
      console.error('[Agent Story] Parse error:', parseError);

      await updateAgentStory(parseInt(storyId), {
        status: 'error',
        error_message: errMsg
      });

      if (jobLogId) {
        await appendBackgroundJobLogEntry(jobLogId, {
          level: 'error',
          message: errMsg,
          emiten,
          details: { raw: generated.text.substring(0, 500) }
        });
        await updateBackgroundJobLog(jobLogId, {
          status: 'failed',
          error_message: errMsg,
        });
      }

      return new Response(JSON.stringify({ error: 'Parse error' }), { status: 500 });
    }

    // Save successful result
    await updateAgentStory(parseInt(storyId), {
      status: 'completed',
      matriks_story: analysisResult.matriks_story || [],
      swot_analysis: analysisResult.swot_analysis || {},
      checklist_katalis: analysisResult.checklist_katalis || [],
      keystat_signal: analysisResult.keystat_signal || '',
      strategi_trading: analysisResult.strategi_trading || {},
      kesimpulan: analysisResult.kesimpulan || ''
    });

    const duration = (Date.now() - startTime) / 1000;
    console.log(`[Agent Story] Analysis completed for ${emiten} in ${duration}s`);

    if (jobLogId) {
      await appendBackgroundJobLogEntry(jobLogId, {
        level: 'info',
        message: `Analysis completed successfully`,
        emiten,
        details: { duration_seconds: duration }
      });
      await updateBackgroundJobLog(jobLogId, {
        status: 'completed',
        success_count: 1,
        metadata: { duration_seconds: duration }
      });
    }

    return new Response(JSON.stringify({ success: true, emiten }), { status: 200 });

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('[Agent Story] Critical error:', error);
    
    if (jobLogId) {
      await appendBackgroundJobLogEntry(jobLogId, {
        level: 'error',
        message: `Analysis failed: ${errMsg}`,
        emiten,
      });
      await updateBackgroundJobLog(jobLogId, {
        status: 'failed',
        error_message: errMsg,
      });
    }

    if (storyId) {
      await updateAgentStory(parseInt(storyId), {
        status: 'error',
        error_message: errMsg
      });
    }

    return new Response(JSON.stringify({ error: errMsg }), { status: 500 });
  }
};
