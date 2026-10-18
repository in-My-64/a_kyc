// src/lib/friendly-errors.ts
/**
 * Translate backend pipeline failures into copy a non-technical
 * customer can act on.
 *
 * The step keys are used as lookup keys only — they are never shown
 * to the customer. Every title and message here must describe the
 * customer's experience ("we couldn't read your document"), never
 * our internal mechanism.
 *
 * Order of evaluation: transport failures first, step-specific copy
 * second, generic fallback last. A timeout at the VLM step is a
 * network problem, not a document problem — the customer shouldn't
 * be told to retake a photo that was already fine.
 */

export interface FriendlyFailure {
  title: string;
  message: string;
  action: string;
  retryable: boolean;
}

const BY_STEP: Record<string, FriendlyFailure> = {
  preprocess_document: {
    title: "Couldn't process your document",
    message:
      "We couldn't prepare your upload for review. The image may be unclear, or in a format we can't read.",
    action: "Try uploading a sharper photo with even lighting.",
    retryable: true,
  },
  run_ocr_task: {
    title: "Couldn't read your document",
    message:
      "We couldn't make out the details on your document. It may be too faint or unclear.",
    action:
      "Try a clearer photo — the whole document needs to be visible and in focus.",
    retryable: true,
  },
  create_parsed_document: {
    title: "Couldn't process your document",
    message:
      "We couldn't prepare your upload for review. Try again or use a different photo.",
    action: "Try uploading a clearer photo with even lighting.",
    retryable: true,
  },
  run_vlm_extraction: {
    title: "Couldn't read your document",
    message:
      "We couldn't make out the details on your document. It may be too faint or unclear.",
    action:
      "Try a clearer photo — the whole document needs to be visible and in focus.",
    retryable: true,
  },
  compare_extractions: {
    title: "Couldn't finish reviewing your document",
    message:
      "We couldn't complete the reading of your document. This is usually due to the image quality.",
    action: "Try uploading a clearer version of the same document.",
    retryable: true,
  },
  run_face_match: {
    title: "Couldn't verify your selfie",
    message:
      "We couldn't compare your selfie with the photo on your document.",
    action:
      "Make sure your face is clearly visible, well lit, and not covered. Then try again.",
    retryable: true,
  },

  compute_evidence_score: {
    title: "Something went wrong",
    message:
      "We hit a temporary problem while reviewing your document.",
    action: "Please try again in a moment.",
    retryable: true,
  },
  run_sanctions_screening: {
    title: "Something went wrong",
    message:
      "We couldn't complete our review of your document. This is a temporary problem on our side.",
    action: "Please try again in a moment.",
    retryable: true,
  },
  classify_risk: {
    title: "Something went wrong",
    message:
      "We couldn't finish reviewing your application. This is on our end.",
    action: "Please try again in a moment.",
    retryable: true,
  },
  log_audit_summary: {
    title: "Almost done",
    message:
      "Your document was reviewed, but the final step didn't complete. Our team will look into it.",
    action: "Try again, or contact support with the reference below.",
    retryable: true,
  },
  dispatch_failed: {
    title: "Couldn't start your application",
    message:
      "We couldn't start the review process. This is on our end.",
    action: "Please try again in a moment.",
    retryable: true,
  },
};

/**
 * Markers that indicate a transport-level failure — the request never
 * reached the service, or the service never answered. Any of these,
 * at any step, produces the same customer-facing message.
 *
 * Matched case-insensitively as substrings of the raw error text.
 */
const NETWORK_MARKERS = [
  // Python requests exceptions
  "connectionerror",
  "connection error",
  "connection refused",
  "connection reset",
  "connection aborted",
  "max retries exceeded",
  "readtimeout",
  "connecttimeout",
  "timed out",
  "timeout",
  "sslerror",
  "remote disconnected",
  "remote end closed",
  // OS-level
  "name or service not known",
  "temporary failure in name resolution",
  "no route to host",
  "network is unreachable",
  // Our own VLM client exception class and its message prefix
  "vlmunreachableerror",
  "vision service unreachable",
  // Generic catch
  "unreachable",
];

function classifyByText(raw: string): FriendlyFailure | null {
  const lower = raw.toLowerCase();

  if (
    lower.includes("face") ||
    lower.includes("liveness") ||
    lower.includes("spoof") ||
    lower.includes("selfie")
  ) {
    return {
      title: "Couldn't verify your selfie",
      message:
        "The selfie didn't pass our checks. It may be unclear, poorly lit, or not a live photo.",
      action:
        "Retake the selfie in good light, looking directly at the camera, with nothing covering your face.",
      retryable: true,
    };
  }

  if (NETWORK_MARKERS.some((m) => lower.includes(m))) {
    return {
      title: "Network error",
      message:
        "We hit a temporary connection problem while reviewing your application. This is on our end, not yours.",
      action: "Please try again in a moment.",
      retryable: true,
    };
  }

  if (
    lower.includes("blur") ||
    lower.includes("glare") ||
    lower.includes("brightness") ||
    lower.includes("quality") ||
    lower.includes("decode") ||
    lower.includes("image")
  ) {
    return {
      title: "Couldn't read your document",
      message:
        "The image didn't meet our quality bar. It may be blurry, too dark, or partially obscured.",
      action: "Try a clearer photo with even lighting.",
      retryable: true,
    };
  }

  return null;
}

export function friendlyFailure(
  currentStep: string | null | undefined,
  rawError: string | null | undefined,
): FriendlyFailure {
  const stepKey = (currentStep ?? "").replace(/^failed_/, "");

  // Transport failures come first, regardless of the step that raised
  // them. A timeout at the VLM step is a network problem, not a
  // document-quality problem — telling the customer to retake a photo
  // when the vision service was unreachable sends them chasing a
  // problem they can't fix.
  if (rawError) {
    const byText = classifyByText(rawError);
    if (byText) return byText;
  }

  // Step-specific copy for non-network failures.
  const byStep = BY_STEP[stepKey];
  if (byStep) return byStep;

  return {
    title: "Something went wrong",
    message:
      "We couldn't complete your application this time. This is on our end.",
    action: "Please try again in a moment.",
    retryable: true,
  };
}