import { GoogleGenerativeAI } from "@google/generative-ai";

export type UploadedImageInput = {
  name: string;
  mimeType: string;
  data: string;
};

export type GenerateImageInput = {
  prompt: string;
  modelAlias: string;
  aspectLabel: string;
  frameSizeLabel: string;
  resolutionLabel: string;
  imagePromptFile?: UploadedImageInput | null;
  styleTransferFile?: UploadedImageInput | null;
  imagePromptAssetUrl?: string | null;
  styleTransferAssetUrl?: string | null;
  referenceFiles?: UploadedImageInput[];
  referenceAssetUrls?: string[];
};

export type GeneratedImageOutput = {
  mimeType: string;
  data: string;
};

export type GeminiGenerationResult = {
  text: string;
  images: GeneratedImageOutput[];
};

const DEFAULT_GEMINI_IMAGE_MODEL =
  process.env.GEMINI_IMAGE_MODEL ?? "gemini-2.0-flash-exp-image-generation";
const DEFAULT_GEMINI_TEXT_MODEL = process.env.GEMINI_TEXT_MODEL ?? "gemini-2.0-flash";
const POLLINATIONS_ENDPOINT =
  process.env.POLLINATIONS_ENDPOINT ?? "https://image.pollinations.ai/prompt";
const POLLINATIONS_VARIATIONS = Number(process.env.POLLINATIONS_VARIATIONS ?? "4");

function resolveGeminiModel(modelAlias: string) {
  if (modelAlias.startsWith("gemini-")) {
    return modelAlias;
  }
  return DEFAULT_GEMINI_IMAGE_MODEL;
}

function resolveGeminiTextModel(modelAlias?: string | null) {
  if (typeof modelAlias === "string" && modelAlias.startsWith("gemini-")) {
    return modelAlias;
  }

  return DEFAULT_GEMINI_TEXT_MODEL;
}

function buildGeminiPrompt(input: GenerateImageInput) {
  const referenceCount =
    (input.referenceFiles?.length ?? 0) + (input.referenceAssetUrls?.length ?? 0);
  const lines = [
    "Generate exactly 4 high-quality image variations for this request.",
    `Prompt: ${input.prompt}`,
    `Selected style model label: ${input.modelAlias}`,
    `Resolution target: ${input.resolutionLabel}`,
    `Frame size: ${input.frameSizeLabel}`,
    `Aspect ratio: ${input.aspectLabel}`,
    referenceCount > 0 ? `Additional reference count: ${referenceCount}` : null,
    "If reference image parts are included, follow them strongly.",
    "Do not return text explanation.",
    "Return image outputs only.",
  ].filter(Boolean);

  return lines.join("\n");
}

function parseFrameSize(frameSizeLabel: string) {
  const [widthText, heightText] = frameSizeLabel.split(":");
  const width = Number.parseInt(widthText, 10);
  const height = Number.parseInt(heightText, 10);

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { width: 1024, height: 1024 };
  }

  return { width, height };
}

function isQuotaError(message: string) {
  return /429\s+Too Many Requests/i.test(message) || /Quota exceeded/i.test(message);
}

function buildPollinationsUrls(input: GenerateImageInput) {
  const { width, height } = parseFrameSize(input.frameSizeLabel);
  const styledPrompt = `${input.prompt}, style ${input.modelAlias}`;
  const count = Math.max(1, Math.min(8, POLLINATIONS_VARIATIONS));
  const maxSeed = 2_000_000_000;
  const seedBase = Math.floor(Math.random() * (maxSeed - count - 1));

  return Array.from({ length: count }, (_, index) => {
    const seed = Math.min(maxSeed, seedBase + index);
    return `${POLLINATIONS_ENDPOINT}/${encodeURIComponent(
      styledPrompt
    )}?nologo=true&seed=${seed}&width=${width}&height=${height}`;
  });
}

function extractImageUrlsFromText(text: string) {
  const matches = text.match(/https?:\/\/[^\s"'`\\\]]+/gi) ?? [];
  const unique = new Set<string>();

  for (const raw of matches) {
    const cleaned = raw.replace(/[),.;]+$/, "");
    if (
      cleaned.includes("image.pollinations.ai/prompt/") ||
      /\.(png|jpe?g|webp|gif)(\?|$)/i.test(cleaned)
    ) {
      unique.add(cleaned);
    }
  }

  return Array.from(unique);
}

function toExternalUrlImages(urls: string[]): GeneratedImageOutput[] {
  return urls.map((url) => ({
    mimeType: "external/url",
    data: url,
  }));
}

async function generatePollinationsFallback(input: GenerateImageInput, reason: string) {
  const urls = buildPollinationsUrls(input);
  const images = toExternalUrlImages(urls);

  return {
    text: `Fallback image generation used (${images.length} variation${
      images.length === 1 ? "" : "s"
    }).` + (reason ? ` Reason: ${reason}` : ""),
    images,
  };
}

async function toInlineImageFromUrl(url: string) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }
    const mimeType = response.headers.get("content-type")?.split(";")[0] ?? "image/jpeg";
    const arrayBuffer = await response.arrayBuffer();
    const data = Buffer.from(arrayBuffer).toString("base64");

    return {
      mimeType,
      data,
    };
  } catch {
    return null;
  }
}

function normalizeInlineData(mimeType: string, data: string): GeneratedImageOutput | null {
  if (!data || !mimeType) {
    return null;
  }
  return {
    mimeType,
    data,
  };
}

export async function generateImagesWithGemini(
  input: GenerateImageInput
): Promise<GeminiGenerationResult> {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;

  if (!apiKey || apiKey === "your_gemini_api_key_here") {
    return generatePollinationsFallback(input, "Missing GEMINI API key.");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const resolvedModel = resolveGeminiModel(input.modelAlias);
  const model = genAI.getGenerativeModel({
    model: resolvedModel,
  });

  const requestParts: Array<
    | string
    | {
        inlineData: {
          mimeType: string;
          data: string;
        };
      }
  > = [buildGeminiPrompt(input)];

  if (input.imagePromptFile) {
    requestParts.push("Image prompt reference:");
    requestParts.push({
      inlineData: {
        mimeType: input.imagePromptFile.mimeType,
        data: input.imagePromptFile.data,
      },
    });
  }

  if (input.styleTransferFile) {
    requestParts.push("Style transfer reference:");
    requestParts.push({
      inlineData: {
        mimeType: input.styleTransferFile.mimeType,
        data: input.styleTransferFile.data,
      },
    });
  }

  if (!input.imagePromptFile && input.imagePromptAssetUrl) {
    const inline = await toInlineImageFromUrl(input.imagePromptAssetUrl);
    if (inline) {
      requestParts.push("Image prompt asset reference:");
      requestParts.push({ inlineData: inline });
    }
  }

  if (!input.styleTransferFile && input.styleTransferAssetUrl) {
    const inline = await toInlineImageFromUrl(input.styleTransferAssetUrl);
    if (inline) {
      requestParts.push("Style transfer asset reference:");
      requestParts.push({ inlineData: inline });
    }
  }

  if (input.referenceFiles?.length) {
    input.referenceFiles.forEach((referenceFile, index) => {
      requestParts.push(`Additional reference ${index + 1}:`);
      requestParts.push({
        inlineData: {
          mimeType: referenceFile.mimeType,
          data: referenceFile.data,
        },
      });
    });
  }

  if (input.referenceAssetUrls?.length) {
    for (const [index, assetUrl] of input.referenceAssetUrls.entries()) {
      const inline = await toInlineImageFromUrl(assetUrl);
      if (inline) {
        requestParts.push(`Additional reference asset ${index + 1}:`);
        requestParts.push({ inlineData: inline });
      }
    }
  }

  let responseText = "";
  let candidates: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        inlineData?: { mimeType?: string; data?: string };
      }>;
    };
  }> = [];

  try {
    const result = await model.generateContent(requestParts as never);
    const response = await result.response;
    responseText = response.text?.() ?? "";
    candidates = response.candidates ?? [];
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Gemini request failed without details.";
    return generatePollinationsFallback(input, message);
  }

  const images: GeneratedImageOutput[] = [];
  let textOutput = "";

  for (const candidate of candidates) {
    const parts = candidate.content?.parts ?? [];

    for (const part of parts) {
      const partAny = part as {
        text?: string;
        inlineData?: { mimeType?: string; data?: string };
      };

      if (typeof partAny.text === "string" && partAny.text.trim()) {
        textOutput = `${textOutput}${textOutput ? "\n" : ""}${partAny.text.trim()}`;
      }

      if (partAny.inlineData?.data && partAny.inlineData?.mimeType) {
        const normalized = normalizeInlineData(partAny.inlineData.mimeType, partAny.inlineData.data);
        if (normalized) {
          images.push(normalized);
        }
      }
    }
  }

  if (images.length === 0) {
    const detail = responseText || textOutput || "Gemini did not return inline image data.";
    const urlCandidates = extractImageUrlsFromText(`${textOutput}\n${responseText}`);

    if (urlCandidates.length > 0) {
      return {
        text: textOutput,
        images: toExternalUrlImages(urlCandidates.slice(0, 8)),
      };
    }
    if (isQuotaError(detail) || /flash-lite/i.test(resolvedModel)) {
      return generatePollinationsFallback(input, detail);
    }
    return generatePollinationsFallback(input, detail);
  }

  return {
    text: textOutput,
    images,
  };
}

export async function generateTextWithGemini(
  prompt: string,
  modelAlias?: string | null,
  fallbackText?: string
) {
  const resolvedFallbackText = fallbackText?.trim() || prompt.trim();
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;

  if (!apiKey || apiKey === "your_gemini_api_key_here") {
    return resolvedFallbackText;
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: resolveGeminiTextModel(modelAlias),
    });

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text?.().trim();

    return text || resolvedFallbackText;
  } catch {
    return resolvedFallbackText;
  }
}
