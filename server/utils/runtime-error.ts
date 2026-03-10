import { Prisma } from "@prisma/client";

type RuntimeErrorDetails = {
  status: number;
  error: string;
  details?: string;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown server error.";
}

function isMissingTableMessage(message: string) {
  return (
    /The table .* does not exist/i.test(message) ||
    /relation .* does not exist/i.test(message) ||
    /table .* does not exist/i.test(message)
  );
}

export function describeRuntimeError(error: unknown): RuntimeErrorDetails {
  const message = getErrorMessage(error);

  if (
    message === "Session not found." ||
    /Session not found/i.test(message)
  ) {
    return {
      status: 404,
      error: "Session not found.",
    };
  }

  if (
    /429\s+Too Many Requests/i.test(message) ||
    /Quota exceeded/i.test(message) ||
    /rate[-\s]?limits?/i.test(message)
  ) {
    const retryMatch =
      message.match(/Please retry in\s+([\d.]+)s/i) ??
      message.match(/"retryDelay":"(\d+)s"/i);
    const retryHint = retryMatch?.[1] ? ` Try again in ~${retryMatch[1]}s.` : "";

    return {
      status: 429,
      error:
        "Gemini quota exceeded for this API key/project. Enable billing or use a key/project with active quota." +
        retryHint,
    };
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    if (/DATABASE_URL/i.test(message)) {
      return {
        status: 500,
        error: "Database is not configured on the deployed environment.",
        details:
          "Set DATABASE_URL in Vercel Project Settings and redeploy. The API is failing before Gemini generation starts.",
      };
    }

    return {
      status: 500,
      error: "Database connection failed in production.",
      details:
        "Check the deployed DATABASE_URL, SSL settings, and whether the remote Postgres or Neon instance is reachable from Vercel.",
    };
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2021" || isMissingTableMessage(message)) {
      return {
        status: 500,
        error: "Database schema is missing on the deployed database.",
        details:
          "This repo has no Prisma migrations folder. Run `npx prisma db push` against the Vercel DATABASE_URL, or create/apply Prisma migrations before using the deployed app.",
      };
    }

    if (error.code === "P2024") {
      return {
        status: 500,
        error: "Database request timed out.",
        details:
          "The deployed database is responding too slowly. Check Neon/Postgres latency, pool limits, and connection settings.",
      };
    }
  }

  if (/Environment variable not found: DATABASE_URL/i.test(message)) {
    return {
      status: 500,
      error: "DATABASE_URL is missing in the deployed environment.",
      details: "Add DATABASE_URL to Vercel Project Settings and redeploy.",
    };
  }

  if (
    /clerk/i.test(message) &&
    /(secret|publishable|domain|instance|auth\(\))/i.test(message)
  ) {
    return {
      status: 500,
      error: "Clerk authentication is misconfigured in production.",
      details:
        "Verify CLERK_SECRET_KEY and NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY in Vercel and confirm the deployed domain is allowed in Clerk.",
    };
  }

  if (
    /(gemini|google)/i.test(message) &&
    /(api key|permission|forbidden|unsupported|model)/i.test(message)
  ) {
    return {
      status: 500,
      error: "Gemini is misconfigured in production.",
      details:
        "Verify GEMINI_API_KEY and the selected GEMINI_IMAGE_MODEL on Vercel. For image generation, use an image-capable Gemini model.",
    };
  }

  return {
    status: 500,
    error: message || "Generation failed due to an unknown error.",
  };
}
