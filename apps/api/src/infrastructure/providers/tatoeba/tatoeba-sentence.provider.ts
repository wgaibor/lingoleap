import type { LearningLanguage } from '@lingoleap/core';
import type { ExampleSentence, SentenceProvider } from '../../../application/ports/sentence-provider.port';
import { fetchJson } from '../../http/fetch-json';

// Forma de respuesta verificada contra https://api.tatoeba.org/unstable/sentences el 2026-07-10
// (ver tatoeba-fixture.json, capturado con:
//  curl "https://api.tatoeba.org/unstable/sentences?lang=eng&q=water&trans%3Alang=spa&limit=2&sort=words").
// Diferencias frente a lo asumido originalmente en el brief:
//  - `sort` es un parámetro OBLIGATORIO (la API responde 400 "Required parameter sort missing" si falta).
//  - `translations` es un array PLANO de objetos (`TatoebaTranslation[]`), no un array anidado
//    (`TatoebaTranslation[][]`) como se asumía; ya viene pre-filtrado por `trans:lang`.
//  - El campo `audios` NO aparece en la respuesta actual del endpoint /unstable/sentences (se probó
//    con `has_audio=yes`, por id de oración y con un parámetro `fields` inexistente): la API "unstable"
//    no expone audio hoy. Se deja el tipo como opcional por compatibilidad futura, pero en la práctica
//    `audioUrl` siempre resuelve a `null`.
interface TatoebaAudio {
  download_url?: string | null;
}
interface TatoebaTranslation {
  lang: string;
  text: string;
}
interface TatoebaSentence {
  text: string;
  audios?: TatoebaAudio[];
  translations?: TatoebaTranslation[];
}
interface TatoebaResponse {
  data?: TatoebaSentence[];
}

const TATOEBA_LANG: Record<LearningLanguage, string> = {
  en: 'eng',
  'pt-BR': 'por',
  it: 'ita'
};

export class TatoebaSentenceProvider implements SentenceProvider {
  constructor(private readonly baseUrl = 'https://api.tatoeba.org') {}

  async findExampleSentence(
    word: string,
    language: LearningLanguage
  ): Promise<ExampleSentence | null> {
    const params = new URLSearchParams({
      lang: TATOEBA_LANG[language],
      q: word,
      'trans:lang': 'spa',
      limit: '10',
      sort: 'words'
    });
    const body = (await fetchJson(
      `${this.baseUrl}/unstable/sentences?${params.toString()}`
    )) as TatoebaResponse | null;

    for (const sentence of body?.data ?? []) {
      const spanish = (sentence.translations ?? []).find(
        (translation) => translation.lang === 'spa'
      );
      if (!spanish) {
        continue;
      }
      return {
        text: sentence.text,
        translationEs: spanish.text,
        audioUrl: sentence.audios?.[0]?.download_url ?? null
      };
    }
    return null;
  }
}
