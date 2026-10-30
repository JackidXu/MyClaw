import {
  COWORK_IMAGE_ATTACHMENT_PREVIEW_FALLBACK_MAX_BYTES,
  type CoworkImageAttachmentPayload,
  validateCoworkImageAttachmentSize,
} from '../../shared/cowork/imageAttachments';
import type { CoworkSelectedTextSnippet } from '../../shared/cowork/selectedText';
import {
  computeMediaLabels,
  getEffectiveMediaReferences,
} from '../components/cowork/mediaMentionUtils';
import type { MediaAttachmentRef } from '../types/mediaGeneration';
import { imageEditUserPrompt } from './imageEditingPrompt';

export interface CoworkPromptAttachment {
  imageEdit?: import('../../shared/imageEditing/types').ImageEditRequest;
  path: string;
  name: string;
  isImage?: boolean;
  isDirectory?: boolean;
  dataUrl?: string;
}

export interface PreparedCoworkPromptPayload {
  finalPrompt: string;
  imageAttachments?: CoworkImageAttachmentPayload[];
  mediaReferences?: MediaAttachmentRef[];
  selectedTextSnippets?: CoworkSelectedTextSnippet[];
}

export const CoworkPromptPayloadFailureCode = {
  ImageTooLarge: 'image_too_large',
  ImagePreviewFailed: 'image_preview_failed',
} as const;
export type CoworkPromptPayloadFailureCode =
  typeof CoworkPromptPayloadFailureCode[keyof typeof CoworkPromptPayloadFailureCode];

export interface CoworkPromptPayloadFailure {
  code: CoworkPromptPayloadFailureCode;
  attachmentName: string;
  sizeBytes?: number;
  maxBytes?: number;
}

export type PrepareCoworkPromptPayloadResult =
  | { success: true; payload: PreparedCoworkPromptPayload }
  | { success: false; failure: CoworkPromptPayloadFailure };

interface PrepareCoworkPromptPayloadOptions {
  basePrompt: string;
  attachments: CoworkPromptAttachment[];
  selectedTextSnippets: CoworkSelectedTextSnippet[];
  modelSupportsImage: boolean;
  readFileAsDataUrl?: (path: string) => Promise<{ success: boolean; dataUrl?: string }>;
  createImagePreviewDataUrl?: (dataUrl: string) => Promise<string>;
  fileLabel: string;
  folderLabel: string;
}

const IMAGE_ATTACHMENT_PREVIEW_MAX_DIMENSION = 512;
const IMAGE_ATTACHMENT_PREVIEW_QUALITY = 0.78;

export const IMAGE_ATTACHMENT_COMPRESSION_MAX_DIMENSION = 1920;
export const IMAGE_ATTACHMENT_COMPRESSION_QUALITY = 0.85;
/** 当图片尺寸或体积超过该阈值时自动缩放压缩（单图约 1.2MB），彻底避免网关解析大 Base64 栈溢出 */
export const IMAGE_ATTACHMENT_AUTO_COMPRESS_BYTES_THRESHOLD = 1200 * 1024;

const extractBase64FromDataUrl = (
  dataUrl: string,
): { mimeType: string; base64Data: string } | null => {
  const match = /^data:(.+);base64,(.*)$/.exec(dataUrl);
  if (!match) return null;
  return { mimeType: match[1], base64Data: match[2] };
};

export const compressImageAttachmentDataUrl = async (
  dataUrl: string,
  maxDimension = IMAGE_ATTACHMENT_COMPRESSION_MAX_DIMENSION,
  quality = IMAGE_ATTACHMENT_COMPRESSION_QUALITY,
): Promise<string> => {
  try {
    const extracted = extractBase64FromDataUrl(dataUrl);
    if (!extracted) return dataUrl;

    const estimatedBytes = Math.round((extracted.base64Data.length * 3) / 4);

    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Failed to load image for compression'));
      image.src = dataUrl;
    });

    const naturalWidth = img.naturalWidth || img.width || 1;
    const naturalHeight = img.naturalHeight || img.height || 1;
    const largestDimension = Math.max(naturalWidth, naturalHeight);

    // 如果图片尺寸在上限内且体积未超标，保留原图
    if (largestDimension <= maxDimension && estimatedBytes <= IMAGE_ATTACHMENT_AUTO_COMPRESS_BYTES_THRESHOLD) {
      return dataUrl;
    }

    const scale = Math.min(1, maxDimension / largestDimension);
    const width = Math.max(1, Math.round(naturalWidth * scale));
    const height = Math.max(1, Math.round(naturalHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl;

    ctx.drawImage(img, 0, 0, width, height);

    // 默认转换为体积可控的 image/jpeg
    const targetMimeType = extracted.mimeType === 'image/png' && !extracted.mimeType.includes('jpeg')
      ? 'image/jpeg'
      : extracted.mimeType;

    return canvas.toDataURL(targetMimeType, quality);
  } catch {
    return dataUrl;
  }
};

const createDefaultImagePreviewDataUrl = async (dataUrl: string): Promise<string> => {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load image preview'));
    image.src = dataUrl;
  });

  const scale = Math.min(
    1,
    IMAGE_ATTACHMENT_PREVIEW_MAX_DIMENSION
      / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height, 1),
  );
  const width = Math.max(1, Math.round((img.naturalWidth || img.width || 1) * scale));
  const height = Math.max(1, Math.round((img.naturalHeight || img.height || 1) * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to create image preview canvas');
  }
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', IMAGE_ATTACHMENT_PREVIEW_QUALITY);
};

export async function prepareCoworkPromptPayload(
  options: PrepareCoworkPromptPayloadOptions,
): Promise<PrepareCoworkPromptPayloadResult> {
  const imageAttachments: CoworkImageAttachmentPayload[] = [];
  const imageAttachmentPathsWithPayload = new Set<string>();
  const createPreview = options.createImagePreviewDataUrl ?? createDefaultImagePreviewDataUrl;

  for (const attachment of options.attachments) {
    let imageDataUrl = attachment.dataUrl;
    if (
      attachment.isImage
      && !imageDataUrl
      && options.modelSupportsImage
      && !attachment.path.startsWith('inline:')
      && options.readFileAsDataUrl
    ) {
      try {
        const result = await options.readFileAsDataUrl(attachment.path);
        if (result.success && result.dataUrl) {
          imageDataUrl = result.dataUrl;
        }
      } catch {
        // Keep the attachment as a path when the file cannot be rehydrated.
      }
    }

    if (!attachment.isImage || !imageDataUrl) continue;
    // 上传前自动检测并进行智能等比缩放与压缩，杜绝超大 Base64 导致 V8 调用栈溢出 RangeError
    imageDataUrl = await compressImageAttachmentDataUrl(imageDataUrl);

    const extracted = extractBase64FromDataUrl(imageDataUrl);
    if (!extracted) continue;

    const sizeValidation = validateCoworkImageAttachmentSize({
      base64Data: extracted.base64Data,
    });
    if (!sizeValidation.ok) {
      return {
        success: false,
        failure: {
          code: CoworkPromptPayloadFailureCode.ImageTooLarge,
          attachmentName: attachment.name,
          sizeBytes: sizeValidation.sizeBytes,
          maxBytes: sizeValidation.maxBytes,
        },
      };
    }

    let previewMimeType: string | undefined;
    let previewBase64Data: string | undefined;
    if (sizeValidation.sizeBytes > COWORK_IMAGE_ATTACHMENT_PREVIEW_FALLBACK_MAX_BYTES) {
      try {
        const preview = extractBase64FromDataUrl(await createPreview(imageDataUrl));
        if (preview) {
          previewMimeType = preview.mimeType;
          previewBase64Data = preview.base64Data;
        }
      } catch {
        // Report a structured failure below.
      }
      if (!previewBase64Data) {
        return {
          success: false,
          failure: {
            code: CoworkPromptPayloadFailureCode.ImagePreviewFailed,
            attachmentName: attachment.name,
          },
        };
      }
    }

    imageAttachments.push({
      name: attachment.name,
      mimeType: extracted.mimeType,
      base64Data: extracted.base64Data,
      sizeBytes: sizeValidation.sizeBytes,
      ...(!attachment.path.startsWith('inline:') ? { localPath: attachment.path } : {}),
      ...(previewMimeType && previewBase64Data ? { previewMimeType, previewBase64Data } : {}),
    });
    imageAttachmentPathsWithPayload.add(attachment.path);
  }

  const attachmentLines = options.attachments
    .filter(attachment => (
      !attachment.path.startsWith('inline:')
      && !attachment.imageEdit
      && !(attachment.isImage && imageAttachmentPathsWithPayload.has(attachment.path))
    ))
    .map(attachment => `${attachment.isDirectory ? options.folderLabel : options.fileLabel}: ${attachment.path}`)
    .join('\n');
  let finalPrompt = options.basePrompt
    ? (attachmentLines ? `${options.basePrompt}\n\n${attachmentLines}` : options.basePrompt)
    : attachmentLines;
  const mediaLabels = computeMediaLabels(options.attachments);
  const editLines = mediaLabels.filter(item => item.attachment.imageEdit).map(item =>
    `@${item.label} ${imageEditUserPrompt(item.attachment.imageEdit!)}`);
  if (editLines.length) finalPrompt = [finalPrompt, ...editLines].filter(Boolean).join('\n\n');
  const mediaReferences = getEffectiveMediaReferences(finalPrompt, mediaLabels);

  return {
    success: true,
    payload: {
      finalPrompt,
      imageAttachments: imageAttachments.length > 0 ? imageAttachments : undefined,
      mediaReferences: mediaReferences.length > 0 ? mediaReferences : undefined,
      selectedTextSnippets: options.selectedTextSnippets.length > 0
        ? options.selectedTextSnippets
        : undefined,
    },
  };
}
