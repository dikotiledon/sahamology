export const geminiCalls = [];
export const ThinkingLevel = { MINIMAL: 'MINIMAL', LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH' };

export class GoogleGenAI {
  constructor(opts = {}) {
    geminiCalls.push({ apiKey: opts.apiKey });
  }

  models = {
    generateContentStream: async (args) => {
      geminiCalls.push(args);
      const story = JSON.stringify({
        matriks_story: [{ kategori_story: 'Aksi Korporasi' }],
        swot_analysis: { strengths: ['s'] },
        checklist_katalis: [{ item: 'i' }],
        strategi_trading: { tipe_saham: 'value' },
        keystat_signal: 'Positif/Sehat',
        kesimpulan: 'Kesimpulan uji.',
      });
      return (async function* () {
        yield { text: story };
      })();
    },
  };
}
