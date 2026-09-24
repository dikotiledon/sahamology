import Module from 'node:module';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const stubs = new Map([
  ['@google/genai', path.join(root, 'netlify/functions/stubs/google-genai.mjs')],
  ['../../lib/supabase', path.join(root, 'netlify/functions/stubs/supabase.mjs')],
]);
const original = Module._resolveFilename;

Module._resolveFilename = function (request, parent, isMain, options) {
  const parentFile = parent?.filename ?? '';
  const stub = parentFile.endsWith(`${path.sep}analyze-story-background.ts`) ? stubs.get(request) : undefined;
  if (stub) return stub;
  return original.call(this, request, parent, isMain, options);
};
