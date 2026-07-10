import type { ImageProvider } from '../../../application/ports/image-provider.port';
import { fetchJson } from '../../http/fetch-json';

interface PexelsResponse {
  photos?: { src?: { medium?: string } }[];
}

export class PexelsImageProvider implements ImageProvider {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = 'https://api.pexels.com'
  ) {}

  async findImageUrl(term: string): Promise<string | null> {
    const params = new URLSearchParams({ query: term, per_page: '3', orientation: 'square' });
    const body = (await fetchJson(`${this.baseUrl}/v1/search?${params.toString()}`, {
      headers: { Authorization: this.apiKey }
    })) as PexelsResponse | null;

    return body?.photos?.[0]?.src?.medium ?? null;
  }
}
