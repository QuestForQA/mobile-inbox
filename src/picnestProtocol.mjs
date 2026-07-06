export function compactObject(object) {
  return Object.fromEntries(
    Object.entries(object).filter(([, entryValue]) => {
      if (entryValue === null || entryValue === undefined) return false;
      if (typeof entryValue === "string") return entryValue.trim() !== "";
      if (Array.isArray(entryValue)) return entryValue.length > 0;
      if (typeof entryValue === "object") return Object.keys(entryValue).length > 0;
      return true;
    })
  );
}

export function nowIsoLocal() {
  const now = new Date();
  const offsetMinutes = -now.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absolute = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absolute / 60)).padStart(2, "0");
  const minutes = String(absolute % 60).padStart(2, "0");
  return `${now.toISOString().slice(0, 19)}${sign}${hours}:${minutes}`;
}

export function commandIdPrefix() {
  return nowIsoLocal().replace(/[:+]/g, "-").replace(/\.\d+/, "");
}

export function createCommandEnvelope(type, payload, { commandId, createdBy = "mobile" } = {}) {
  return {
    protocol_version: 1,
    command_id: commandId || `${commandIdPrefix()}-${type}`,
    type,
    created_at: nowIsoLocal(),
    created_by: createdBy || "mobile",
    payload,
  };
}

export function safeFilePart(valueText) {
  return String(valueText || "")
    .normalize("NFKD")
    .replace(/[^\wа-яА-ЯёЁ.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90) || "image";
}

export function sanitizeFilenameText(text) {
  const cleaned = String(text || "")
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/_+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, 120) || "Untitled";
}

export function sanitizeFilenamePart(text) {
  const cleaned = String(text || "")
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/_+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, 120);
}

export function stripTrailingPriceToken(text) {
  const tokens = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return "";
  const lastToken = tokens[tokens.length - 1].replace(/[.,;:!?)\]}]+$/g, "");
  if (!lastToken) return tokens.slice(0, -1).join(" ");
  if (/^\d+([.,]\d{1,2})?[eEеЕ]$/.test(lastToken) || /^[€$₽]$/.test(lastToken.slice(-1))) {
    return tokens.slice(0, -1).join(" ");
  }
  if (tokens.length >= 3 && /^\d+([.,]\d{1,2})?$/.test(lastToken)) {
    return tokens.slice(0, -1).join(" ");
  }
  return tokens.join(" ");
}

export function isPriceToken(token) {
  const valueText = String(token || "").trim().replace(/[.,;:!?)\]}]+$/g, "");
  if (!valueText) return false;
  return (
    /^[€$₽]\s?\d+([.,]\d{1,2})?$/i.test(valueText)
    || /^\d+([.,]\d{1,2})?[eEеЕ]$/i.test(valueText)
    || /^\d+([.,]\d{1,2})?\s?([€$₽]|eur|rub|usd|р|руб)$/i.test(valueText)
  );
}

export function isLoosePriceToken(token) {
  const valueText = String(token || "").trim().replace(/[.,;:!?)\]}]+$/g, "");
  return isPriceToken(valueText) || /^\d{2,6}([.,]\d{1,2})?$/.test(valueText);
}

export function isSizeToken(token) {
  const valueText = String(token || "").trim();
  if (!valueText) return false;
  return (
    /^(xxs|xs|s|m|l|xl|xxl|xxxl)$/i.test(valueText)
    || /^w?\d{2,3}(l\d{2,3})?$/i.test(valueText)
    || /^\d{2,3}\/\d{2,3}$/i.test(valueText)
    || /^[0-9]{1,2}(xs|xl)$/i.test(valueText)
  );
}

export function isUppercaseParamWord(token) {
  const valueText = String(token || "").trim();
  return valueText.length > 1 && /[A-ZА-ЯЁ]/.test(valueText) && valueText === valueText.toLocaleUpperCase();
}

export function stripDuplicatePrefix(text, prefixes) {
  let result = String(text || "").trim();
  for (const prefix of prefixes) {
    const normalizedPrefix = String(prefix || "").trim();
    if (!normalizedPrefix) continue;
    if (result.toLocaleLowerCase().startsWith(normalizedPrefix.toLocaleLowerCase())) {
      const candidate = result.slice(normalizedPrefix.length).trim();
      if (candidate) result = candidate;
    }
  }
  return result;
}

export function paramsWithoutPrice(userParams) {
  return stripTrailingPriceToken(userParams).trim();
}

export function titleWithParamsWithoutPrice(title, userParams) {
  const baseTitle = stripTrailingPriceToken(title).trim();
  const params = paramsWithoutPrice(userParams);
  if (!params) return baseTitle;
  if (baseTitle.toLocaleLowerCase().endsWith(params.toLocaleLowerCase())) return baseTitle;
  return [baseTitle, params].filter(Boolean).join(" ").trim();
}

export function normalizeTitleForFilename(title, source) {
  let base = String(title || "").split("|", 1)[0].trim();
  base = stripDuplicatePrefix(base, [source]);
  if (base.includes(" - ")) base = base.split(" - ").pop().trim();
  if (base.includes(",")) base = base.split(",", 1)[0].trim();
  return base;
}

export function sourceFilenameLabel(source) {
  const labels = {
    "fashion-market": "Fashion market",
    "michael-kors": "Michael Kors",
    "levi's": "Levi s",
    levis: "Levi s",
    intrend: "Intrend",
    uniqlo: "Uniqlo",
  };
  return labels[source] || (source ? source.slice(0, 1).toUpperCase() + source.slice(1) : "Unknown");
}

export function generatePicNestFilename(source, title, userParams, uniqueSuffix = "") {
  const sourcePart = sanitizeFilenameText(sourceFilenameLabel(source));
  const normalizedTitle = normalizeTitleForFilename(title, source);
  const titlePart = sanitizeFilenamePart(stripTrailingPriceToken(normalizedTitle));
  let cleanedParams = sanitizeFilenameText(stripDuplicatePrefix(
    stripTrailingPriceToken(userParams).split(/\s+/).filter((token) => !isLoosePriceToken(token)).join(" "),
    [source, normalizedTitle]
  ));
  if (cleanedParams === "Untitled") cleanedParams = "";
  if (cleanedParams && titlePart.toLocaleLowerCase().endsWith(cleanedParams.toLocaleLowerCase())) {
    cleanedParams = "";
  }
  if (cleanedParams && titlePart && cleanedParams.toLocaleLowerCase() === titlePart.toLocaleLowerCase()) {
    cleanedParams = "";
  }
  const parts = [sourcePart, titlePart];
  if (cleanedParams) parts.push(cleanedParams);
  let base = parts.filter(Boolean).join(" ").trim() || "Untitled";
  base = base.slice(0, 1).toUpperCase() + base.slice(1);
  if (uniqueSuffix) base += ` ${uniqueSuffix}`;
  return `${base}.jpg`;
}

export function extension(file) {
  const match = String(file?.name || "").match(/\.[^.]+$/);
  return match ? match[0].toLowerCase() : ".jpg";
}

export function imagePath(commandId, imageKey, file) {
  return `images/${safeFilePart(commandId)}-${safeFilePart(imageKey)}${extension(file)}`;
}

export function isImageFilename(filename) {
  return /\.(jpg|jpeg|png|webp|gif)$/i.test(String(filename || ""));
}

export function imagePathFromFilename(filename, file, uniqueSuffix = "") {
  const base = filename.replace(/\.[^.]+$/i, "");
  const nextBase = uniqueSuffix ? `${base} ${uniqueSuffix}` : base;
  return `images/${safeFilePart(nextBase)}${extension(file)}`;
}

export function remoteImageName(filename, uniqueSuffix = "") {
  const base = filename.replace(/\.[^.]+$/i, "");
  const nextBase = uniqueSuffix ? `${base} ${uniqueSuffix}` : base;
  return `${safeFilePart(nextBase)}.jpg`;
}

export function extractUrl(text) {
  const match = String(text || "").match(/https?:\/\/[^\s]+/i);
  if (!match) return "";
  return match[0].replace(/[),.;]+$/g, "");
}

export function inferSourceFromUrl(url) {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
  if (host.includes("intrend.it")) return "intrend";
  if (host.includes("fashion-market.it")) return "fashion-market";
  if (host.includes("uniqlo.")) return "uniqlo";
  if (host.includes("michaelkors.") || host.includes("michael-kors.")) return "michael-kors";
  if (host.includes("levi.")) return "levi's";
  const parts = host.split(".").filter(Boolean);
  if (parts.length >= 2) return parts[parts.length - 2].replace(/[^a-z0-9]+/g, "-");
  return parts[0] || "";
}

export function titleFromUrlSlug(url) {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").map((segment) => segment.trim()).filter(Boolean);
    const lastSegment = segments[segments.length - 1] || "";
    const withoutExtension = lastSegment.replace(/\.[a-z0-9]{2,5}$/i, "");
    const words = withoutExtension
      .replace(/^p-\d+-?/i, "")
      .replace(/^\d+-?/, "")
      .split(/[-_]+/)
      .filter((part) => part && !/^\d+$/.test(part));
    const title = words.join(" ").trim();
    return title ? title.slice(0, 1).toUpperCase() + title.slice(1) : "";
  } catch {
    return "";
  }
}

export function looksLikeParamToken(token) {
  const valueText = String(token || "").trim();
  if (!valueText) return false;
  if (isSizeToken(valueText)) return true;
  if (isPriceToken(valueText)) return true;
  if (/^\d{2,3}[,.]?\d{0,2}([€$₽]|eur|rub|usd)?$/i.test(valueText)) return true;
  if (/^[€$₽]$/.test(valueText)) return true;
  return false;
}

function findLastIndex(array, predicate) {
  for (let index = array.length - 1; index >= 0; index -= 1) {
    if (predicate(array[index], index)) return index;
  }
  return -1;
}

export function splitTitleAndParams(text) {
  const normalized = String(text || "").trim().replace(/\s+/g, " ");
  if (!normalized) return { title: "", userParams: "" };
  if (normalized.includes("|")) {
    const [titlePart, ...paramParts] = normalized.split("|").map((part) => part.trim());
    return { title: titlePart, userParams: paramParts.join(" ").trim() };
  }
  const tokens = normalized.split(" ");

  const priceIndex = findLastIndex(tokens, (token) => isLoosePriceToken(token));
  if (priceIndex > 0) {
    const beforePrice = tokens.slice(0, priceIndex);
    const sizeIndex = findLastIndex(beforePrice, (token) => isSizeToken(token));
    if (sizeIndex > 0) {
      let paramStart = sizeIndex;
      while (paramStart > 0 && isUppercaseParamWord(tokens[paramStart - 1])) {
        paramStart -= 1;
      }
      if (paramStart === sizeIndex) {
        paramStart = Math.max(0, sizeIndex - 1);
      }
      return {
        title: tokens.slice(0, paramStart).join(" ").trim(),
        userParams: tokens.slice(paramStart).join(" ").trim(),
      };
    }
  }

  if (tokens.length >= 4 && isLoosePriceToken(tokens[tokens.length - 1])) {
    const paramStart = Math.max(1, tokens.length - 3);
    return {
      title: stripTrailingPriceToken(tokens.slice(0, paramStart).join(" ")).trim(),
      userParams: tokens.slice(paramStart).join(" ").trim(),
    };
  }

  let paramStart = tokens.length;
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    if (looksLikeParamToken(tokens[index])) {
      paramStart = index;
      continue;
    }
    break;
  }
  if (paramStart < tokens.length) {
    if (paramStart > 0 && tokens.length - paramStart <= 3 && tokens.length > 3) {
      paramStart -= 1;
    }
    return {
      title: tokens.slice(0, paramStart).join(" ").trim(),
      userParams: tokens.slice(paramStart).join(" ").trim(),
    };
  }
  return { title: normalized, userParams: "" };
}

export function parseImportInputLine(line) {
  const cleanLine = stripImportListMarker(line);
  const sourceUrl = extractUrl(cleanLine);
  const rest = cleanLine
    .replace(sourceUrl, "")
    .replace(/[+|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const split = splitTitleAndParams(rest);
  const fallbackTitle = titleFromUrlSlug(sourceUrl);
  return {
    importInputLine: cleanLine,
    sourceUrl,
    source: inferSourceFromUrl(sourceUrl),
    title: titleWithParamsWithoutPrice(split.title || fallbackTitle, split.userParams),
    userParams: split.userParams,
  };
}

export function stripImportListMarker(line) {
  return String(line || "")
    .trim()
    .replace(/^\s*\d+[\).:-]\s+/, "")
    .trim();
}
