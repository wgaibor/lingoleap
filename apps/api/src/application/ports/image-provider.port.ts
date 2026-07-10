export interface ImageProvider {
  findImageUrl(term: string): Promise<string | null>;
}

export const IMAGE_PROVIDER = Symbol('ImageProvider');
