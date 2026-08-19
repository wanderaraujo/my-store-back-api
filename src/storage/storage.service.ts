import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as admin from 'firebase-admin';
import sharp from 'sharp';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  private get bucket() {
    return admin.storage().bucket();
  }

  async uploadProductImage(
    businessId: string,
    productId: string,
    file: Express.Multer.File,
  ): Promise<string> {
    this.validateImage(file);

    const optimized = await sharp(file.buffer)
      .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 75 })
      .toBuffer();

    return this.savePublic(`business/${businessId}/products/${productId}.webp`, optimized);
  }

  async uploadUserAvatar(
    businessId: string,
    userId: string,
    file: Express.Multer.File,
  ): Promise<string> {
    this.validateImage(file);

    const optimized = await sharp(file.buffer)
      .resize(256, 256, { fit: 'cover' })
      .webp({ quality: 85 })
      .toBuffer();

    return this.savePublic(`business/${businessId}/users/${userId}.webp`, optimized);
  }

  async deleteFile(path: string): Promise<void> {
    await this.bucket.file(path).delete({ ignoreNotFound: true });
  }

  private async savePublic(path: string, data: Buffer): Promise<string> {
    const fileRef = this.bucket.file(path);

    await fileRef.save(data, {
      metadata: {
        contentType: 'image/webp',
        cacheControl: 'public, max-age=31536000',
      },
    });

    await fileRef.makePublic();

    const url = `https://storage.googleapis.com/${this.bucket.name}/${path}`;
    this.logger.log(`Arquivo enviado: ${url}`);
    return url;
  }

  private validateImage(file: Express.Multer.File): void {
    if (!file) throw new BadRequestException('Arquivo não enviado');
    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('Apenas imagens são permitidas');
    }
  }
}
