import { Module } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ENV, loadEnv, type Env } from '../config/env';
import { COURSE_REPOSITORY, type CourseRepository } from '../application/ports/course.repository';
import { IMAGE_PROVIDER, type ImageProvider } from '../application/ports/image-provider.port';
import {
  SENTENCE_PROVIDER,
  type SentenceProvider
} from '../application/ports/sentence-provider.port';
import {
  TRANSLATION_PROVIDER,
  type TranslationProvider
} from '../application/ports/translation-provider.port';
import {
  VOCABULARY_PROVIDER,
  type VocabularyProvider
} from '../application/ports/vocabulary-provider.port';
import { IngestContentUseCase } from '../application/use-cases/ingest-content.use-case';
import {
  createSupabaseClient,
  SUPABASE_CLIENT
} from './persistence/supabase/supabase-client.factory';
import { SupabaseCourseRepository } from './persistence/supabase/supabase-course.repository';
import { FrequencyWordsVocabularyProvider } from './providers/frequency-words/frequency-words.provider';
import { MyMemoryTranslationProvider } from './providers/mymemory/mymemory-translation.provider';
import { PexelsImageProvider } from './providers/pexels/pexels-image.provider';
import { TatoebaSentenceProvider } from './providers/tatoeba/tatoeba-sentence.provider';

@Module({
  providers: [
    { provide: ENV, useFactory: () => loadEnv() },
    { provide: SUPABASE_CLIENT, useFactory: (env: Env) => createSupabaseClient(env), inject: [ENV] },
    { provide: VOCABULARY_PROVIDER, useFactory: () => new FrequencyWordsVocabularyProvider() },
    { provide: TRANSLATION_PROVIDER, useFactory: () => new MyMemoryTranslationProvider() },
    { provide: SENTENCE_PROVIDER, useFactory: () => new TatoebaSentenceProvider() },
    {
      provide: IMAGE_PROVIDER,
      useFactory: (env: Env) => new PexelsImageProvider(env.PEXELS_API_KEY),
      inject: [ENV]
    },
    {
      provide: COURSE_REPOSITORY,
      useFactory: (client: SupabaseClient) => new SupabaseCourseRepository(client),
      inject: [SUPABASE_CLIENT]
    },
    {
      provide: IngestContentUseCase,
      useFactory: (
        vocabulary: VocabularyProvider,
        translations: TranslationProvider,
        sentences: SentenceProvider,
        images: ImageProvider,
        courses: CourseRepository
      ) => new IngestContentUseCase({ vocabulary, translations, sentences, images, courses }),
      inject: [
        VOCABULARY_PROVIDER,
        TRANSLATION_PROVIDER,
        SENTENCE_PROVIDER,
        IMAGE_PROVIDER,
        COURSE_REPOSITORY
      ]
    }
  ],
  exports: [IngestContentUseCase, COURSE_REPOSITORY, SUPABASE_CLIENT]
})
export class IngestModule {}
