const state = {
  mode: "create_product",
  installPrompt: null,
};

const DROPBOX_TOKEN_STORAGE_KEY = "picnest-mobile-dropbox-token";
const DROPBOX_INBOX_PATH_STORAGE_KEY = "picnest-mobile-dropbox-inbox-path";
const DROPBOX_APP_KEY_STORAGE_KEY = "picnest-mobile-dropbox-app-key";
const DROPBOX_ACCESS_TOKEN_STORAGE_KEY = "picnest-mobile-dropbox-oauth-access-token";
const DROPBOX_REFRESH_TOKEN_STORAGE_KEY = "picnest-mobile-dropbox-oauth-refresh-token";
const DROPBOX_EXPIRES_AT_STORAGE_KEY = "picnest-mobile-dropbox-oauth-expires-at";
const DROPBOX_PKCE_VERIFIER_STORAGE_KEY = "picnest-mobile-dropbox-pkce-verifier";
const DROPBOX_OAUTH_STATE_STORAGE_KEY = "picnest-mobile-dropbox-oauth-state";
const DROPBOX_SCOPES = "files.content.write files.content.read files.metadata.read";

const FIELD_INPUTS = [
  ["title", "field-title"],
  ["source_url", "field-source-url"],
  ["source", "field-source"],
  ["product_params", "field-product-params"],
  ["brand", "field-brand"],
  ["brand_line", "field-brand-line"],
  ["retailer", "field-retailer"],
  ["store_locale", "field-store-locale"],
  ["interface_language", "field-interface-language"],
  ["store_color_text", "field-store-color-text"],
  ["composition_care_text", "field-composition-care-text"],
];

function byId(id) {
  return document.getElementById(id);
}

function value(id) {
  return String(byId(id)?.value || "").trim();
}

function files(id) {
  return Array.from(byId(id)?.files || []);
}

function lines(id) {
  return value(id).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function currentRedirectUri() {
  return `${window.location.origin}${window.location.pathname}`;
}

function randomUrlSafeString(length = 64) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function base64UrlEncode(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256Base64Url(text) {
  const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return base64UrlEncode(buffer);
}

function compactObject(object) {
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

function nowIsoLocal() {
  const now = new Date();
  const offsetMinutes = -now.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absolute = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absolute / 60)).padStart(2, "0");
  const minutes = String(absolute % 60).padStart(2, "0");
  return `${now.toISOString().slice(0, 19)}${sign}${hours}:${minutes}`;
}

function commandIdPrefix() {
  return nowIsoLocal().replace(/[:+]/g, "-").replace(/\.\d+/, "");
}

function resetCommandId() {
  byId("command-id").value = `${commandIdPrefix()}-${state.mode}`;
}

function normalizeDropboxPath(path) {
  const normalized = String(path || "").trim().replace(/\/+/g, "/");
  if (!normalized) return "/ЗП_test/PicNestInbox";
  return normalized.startsWith("/") ? normalized.replace(/\/$/g, "") : `/${normalized.replace(/\/$/g, "")}`;
}

function joinDropboxPath(root, relativePath) {
  const cleanRoot = normalizeDropboxPath(root);
  const cleanRelative = String(relativePath || "").replace(/^\/+/g, "");
  return `${cleanRoot}/${cleanRelative}`;
}

function safeFilePart(valueText) {
  return String(valueText || "")
    .normalize("NFKD")
    .replace(/[^\wа-яА-ЯёЁ.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90) || "image";
}

function sanitizeFilenameText(text) {
  const cleaned = String(text || "")
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/_+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, 120) || "Untitled";
}

function stripTrailingPriceToken(text) {
  const tokens = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return "";
  const lastToken = tokens[tokens.length - 1].replace(/[.,;:!?)\]}]+$/g, "");
  if (!lastToken) return tokens.slice(0, -1).join(" ");
  if (/[eEеЕ]$/.test(lastToken) || /^[€$₽]$/.test(lastToken.slice(-1))) {
    return tokens.slice(0, -1).join(" ");
  }
  return tokens.join(" ");
}

function stripDuplicatePrefix(text, prefixes) {
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

function normalizeTitleForFilename(title, source) {
  let base = String(title || "").split("|", 1)[0].trim();
  base = stripDuplicatePrefix(base, [source]);
  if (base.includes(" - ")) base = base.split(" - ").pop().trim();
  if (base.includes(",")) base = base.split(",", 1)[0].trim();
  return base;
}

function sourceFilenameLabel(source) {
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

function generatePicNestFilename(source, title, userParams, uniqueSuffix = "") {
  const sourcePart = sanitizeFilenameText(sourceFilenameLabel(source));
  const normalizedTitle = normalizeTitleForFilename(title, source);
  const titlePart = sanitizeFilenameText(normalizedTitle);
  let cleanedParams = sanitizeFilenameText(
    stripDuplicatePrefix(stripTrailingPriceToken(userParams), [source, normalizedTitle])
  );
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

function extension(file) {
  const match = String(file?.name || "").match(/\.[^.]+$/);
  return match ? match[0].toLowerCase() : ".jpg";
}

function imagePath(commandId, imageKey, file) {
  return `images/${safeFilePart(commandId)}-${safeFilePart(imageKey)}${extension(file)}`;
}

function imagePathFromFilename(filename, file, uniqueSuffix = "") {
  const base = filename.replace(/\.[^.]+$/i, "");
  const nextBase = uniqueSuffix ? `${base} ${uniqueSuffix}` : base;
  return `images/${safeFilePart(nextBase)}${extension(file)}`;
}

function remoteImageName(filename, uniqueSuffix = "") {
  const base = filename.replace(/\.[^.]+$/i, "");
  const nextBase = uniqueSuffix ? `${base} ${uniqueSuffix}` : base;
  return `${safeFilePart(nextBase)}.jpg`;
}

function productLookupPayload(productIdInputId, filenameInputId) {
  const productId = Number(value(productIdInputId)) || undefined;
  if (productId) return { product_id: productId };
  const filename = value(filenameInputId);
  if (!filename) return {};
  return {
    main_image_filename: /\.[a-z0-9]{2,5}$/i.test(filename) ? filename : `${filename}.jpg`,
  };
}

function extractUrl(text) {
  return String(text || "").match(/https?:\/\/\S+/i)?.[0] || "";
}

function inferSourceFromUrl(url) {
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

function looksLikeParamToken(token) {
  const valueText = String(token || "").trim();
  if (!valueText) return false;
  if (/^(xxs|xs|s|m|l|xl|xxl|xxxl)$/i.test(valueText)) return true;
  if (/^w?\d{2,3}(l\d{2,3})?$/i.test(valueText)) return true;
  if (/^\d{2,3}[,.]?\d{0,2}([€$₽]|eur|rub|usd)?$/i.test(valueText)) return true;
  if (/^[€$₽]$/.test(valueText)) return true;
  return false;
}

function splitTitleAndParams(text) {
  const normalized = String(text || "").trim().replace(/\s+/g, " ");
  if (!normalized) return { title: "", userParams: "" };
  if (normalized.includes("|")) {
    const [titlePart, ...paramParts] = normalized.split("|").map((part) => part.trim());
    return { title: titlePart, userParams: paramParts.join(" ").trim() };
  }
  const tokens = normalized.split(" ");
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

function parseImportInputLine(line) {
  const sourceUrl = extractUrl(line);
  const rest = String(line || "").replace(sourceUrl, "").trim();
  const split = splitTitleAndParams(rest);
  return {
    importInputLine: String(line || "").trim(),
    sourceUrl,
    source: inferSourceFromUrl(sourceUrl),
    title: split.title,
    userParams: split.userParams,
  };
}

function commandEnvelope(type, payload) {
  return {
    protocol_version: 1,
    command_id: value("command-id"),
    type,
    created_at: nowIsoLocal(),
    created_by: value("created-by") || "mobile",
    payload,
  };
}

function buildCreateProduct() {
  const parsed = parseImportInputLine(value("create-import-input-line"));
  const title = value("create-title") || parsed.title;
  const userParams = value("create-user-params") || parsed.userParams;
  const filename = generatePicNestFilename(parsed.source, title, userParams);
  const mainImage = files("create-main-image")[0] || null;
  const mainImageUrl = value("create-main-image-url");
  const duplicateImages = files("create-duplicate-images");
  const duplicateImageUrls = lines("create-duplicate-image-urls");
  const images = [];

  if (mainImage) {
    images.push({
      image_key: "main",
      path: imagePathFromFilename(filename, mainImage),
      is_primary: true,
      is_look: false,
      look_role: "none",
    });
  } else if (mainImageUrl) {
    images.push({
      image_key: "main",
      url: mainImageUrl,
      remote_filename: remoteImageName(filename),
      is_primary: true,
      is_look: false,
      look_role: "none",
    });
  }

  duplicateImages.forEach((file, index) => {
    const imageKey = `duplicate-${index + 1}`;
    images.push({
      image_key: imageKey,
      path: imagePathFromFilename(filename, file, String(index + 2)),
      is_primary: false,
      is_look: false,
      look_role: "none",
    });
  });

  duplicateImageUrls.forEach((url, index) => {
    const imageKey = `duplicate-url-${index + 1}`;
    images.push({
      image_key: imageKey,
      url,
      remote_filename: remoteImageName(filename, String(duplicateImages.length + index + 2)),
      is_primary: false,
      is_look: false,
      look_role: "none",
    });
  });

  const payload = compactObject({
    source_url: parsed.sourceUrl,
    import_input_line: parsed.importInputLine,
    source: parsed.source,
    title,
    user_params: userParams,
    target_status: value("create-target-status") || "buy",
    images,
  });

  return commandEnvelope("create_product", compactObject(payload));
}

function buildCreateProductUploads(command) {
  const filename = generatePicNestFilename(command.payload.source, command.payload.title, command.payload.user_params);
  const mainImage = files("create-main-image")[0] || null;
  const duplicateImages = files("create-duplicate-images");
  const uploads = [];
  if (mainImage && command.payload.images?.[0]?.path) {
    uploads.push({ relativePath: command.payload.images[0].path, blob: mainImage });
  }
  duplicateImages.forEach((file, index) => {
    const relativePath = imagePathFromFilename(filename, file, String(index + 2));
    uploads.push({ relativePath, blob: file });
  });
  return uploads;
}

function buildAddImages() {
  const commandId = value("command-id");
  const selectedFiles = files("add-images");
  const selectedUrls = lines("add-image-urls");
  const images = selectedFiles.map((file, index) => {
    const imageKey = `duplicate-${index + 1}`;
    return {
      image_key: imageKey,
      path: imagePath(commandId, imageKey, file),
      is_primary: false,
      is_look: false,
      look_role: "none",
    };
  });
  selectedUrls.forEach((url, index) => {
    images.push({
      image_key: `duplicate-url-${index + 1}`,
      url,
      remote_filename: `${safeFilePart(commandId)}-duplicate-url-${index + 1}.jpg`,
      is_primary: false,
      is_look: false,
      look_role: "none",
    });
  });
  return commandEnvelope("add_images", compactObject({
    ...productLookupPayload("add-product-id", "add-main-image-filename"),
    images,
  }));
}

function buildAddImagesUploads(command) {
  const selectedFiles = files("add-images");
  const pathByKey = new Map((command.payload.images || []).map((image) => [image.image_key, image.path]));
  return selectedFiles.map((file, index) => {
    const imageKey = `duplicate-${index + 1}`;
    return {
      relativePath: pathByKey.get(imageKey) || imagePath(value("command-id"), imageKey, file),
      blob: file,
    };
  });
}

function buildMoveStatus() {
  return commandEnvelope("move_status", compactObject({
    ...productLookupPayload("move-product-id", "move-main-image-filename"),
    to_status: value("move-to-status"),
  }));
}

function buildUpdateFields() {
  const fields = {};
  for (const [field, inputId] of FIELD_INPUTS) {
    const nextValue = value(inputId);
    if (nextValue) fields[field] = nextValue;
  }
  return commandEnvelope("update_fields", compactObject({
    ...productLookupPayload("update-product-id", "update-main-image-filename"),
    fields,
  }));
}

function buildCommand() {
  if (state.mode === "add_images") return buildAddImages();
  if (state.mode === "move_status") return buildMoveStatus();
  if (state.mode === "update_fields") return buildUpdateFields();
  return buildCreateProduct();
}

function buildUploads(command) {
  if (command.type === "create_product") return buildCreateProductUploads(command);
  if (command.type === "add_images") return buildAddImagesUploads(command);
  return [];
}

function commandFileName(command) {
  return `${safeFilePart(command.command_id || "picnest-command")}.json`;
}

function selectedImagePlan(command) {
  return (command.payload.images || []).map((image) => ({
    key: image.image_key,
    path: image.path || (image.remote_filename ? `images/${image.remote_filename}` : image.url),
    url: image.url || "",
  }));
}

function renderFilePlan(command) {
  const filePlan = byId("file-plan");
  const imagePlan = selectedImagePlan(command);
  const rows = [
    `<div class="file-plan-item"><strong>commands/${commandFileName(command)}</strong><span>JSON команда</span></div>`,
    ...imagePlan.map((image) => (
      `<div class="file-plan-item"><strong>${image.url ? `URL: ${image.url}` : image.path}</strong><span>${image.key}${image.url ? ` -> ${image.path}` : ""}</span></div>`
    )),
  ];
  filePlan.innerHTML = rows.join("");
}

function render() {
  const command = buildCommand();
  byId("json-output").textContent = JSON.stringify(command, null, 2);
  renderFilePlan(command);
  renderParsedCreateFields(command);
}

function renderParsedCreateFields(command) {
  if (state.mode !== "create_product") return;
  byId("parsed-source-url").textContent = command.payload.source_url || "—";
  byId("parsed-source").textContent = command.payload.source || "—";
  byId("parsed-filename").textContent = generatePicNestFilename(
    command.payload.source,
    command.payload.title,
    command.payload.user_params
  );
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function setStatus(message, isError = false) {
  const element = byId("dropbox-status");
  element.hidden = false;
  element.textContent = message;
  element.classList.toggle("error", isError);
}

function setAuthStatus(message, isError = false) {
  const element = byId("dropbox-auth-status");
  element.textContent = message;
  element.classList.toggle("error", isError);
}

function updateAuthStatus() {
  const refreshToken = localStorage.getItem(DROPBOX_REFRESH_TOKEN_STORAGE_KEY);
  const accessToken = localStorage.getItem(DROPBOX_ACCESS_TOKEN_STORAGE_KEY);
  if (refreshToken) {
    setAuthStatus("Dropbox подключен через OAuth.");
    return;
  }
  if (accessToken || value("dropbox-token")) {
    setAuthStatus("Dropbox подключен через access token fallback.");
    return;
  }
  setAuthStatus("Dropbox не подключен.");
}

function loadDropboxSettings() {
  byId("dropbox-app-key").value = localStorage.getItem(DROPBOX_APP_KEY_STORAGE_KEY) || "";
  byId("dropbox-token").value = localStorage.getItem(DROPBOX_TOKEN_STORAGE_KEY) || "";
  byId("dropbox-inbox-path").value = localStorage.getItem(DROPBOX_INBOX_PATH_STORAGE_KEY) || "/ЗП_test/PicNestInbox";
  byId("dropbox-redirect-uri").value = currentRedirectUri();
  updateAuthStatus();
}

function saveDropboxSettings() {
  localStorage.setItem(DROPBOX_APP_KEY_STORAGE_KEY, value("dropbox-app-key"));
  localStorage.setItem(DROPBOX_TOKEN_STORAGE_KEY, value("dropbox-token"));
  localStorage.setItem(DROPBOX_INBOX_PATH_STORAGE_KEY, normalizeDropboxPath(value("dropbox-inbox-path")));
  byId("dropbox-inbox-path").value = normalizeDropboxPath(value("dropbox-inbox-path"));
  updateAuthStatus();
  setStatus("Настройки Dropbox сохранены.");
}

async function uploadToDropbox({ token, dropboxPath, blob, contentType }) {
  const response = await fetch("https://content.dropboxapi.com/2/files/upload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/octet-stream",
      "Dropbox-API-Arg": httpHeaderSafeJson({
        path: dropboxPath,
        mode: "overwrite",
        autorename: false,
        mute: false,
        strict_conflict: false,
      }),
    },
    body: blob,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Dropbox upload failed ${response.status}: ${text}`);
  }
  return response.json();
}

async function dropboxJsonRequest({ token, url, body }) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`Dropbox request failed ${response.status}: ${text}`);
  }
  return data;
}

async function dropboxTokenRequest(body) {
  const response = await fetch("https://api.dropboxapi.com/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`Dropbox OAuth failed ${response.status}: ${text}`);
  }
  return data;
}

function storeDropboxTokenResponse(data) {
  if (data.access_token) {
    localStorage.setItem(DROPBOX_ACCESS_TOKEN_STORAGE_KEY, data.access_token);
  }
  if (data.refresh_token) {
    localStorage.setItem(DROPBOX_REFRESH_TOKEN_STORAGE_KEY, data.refresh_token);
  }
  if (data.expires_in) {
    localStorage.setItem(
      DROPBOX_EXPIRES_AT_STORAGE_KEY,
      String(Date.now() + Math.max(30, Number(data.expires_in) - 60) * 1000)
    );
  }
  updateAuthStatus();
}

async function startDropboxAuth() {
  const appKey = value("dropbox-app-key");
  if (!appKey) {
    setStatus("Нужен Dropbox App key.", true);
    return;
  }
  saveDropboxSettings();
  const codeVerifier = randomUrlSafeString(96);
  const codeChallenge = await sha256Base64Url(codeVerifier);
  const oauthState = randomUrlSafeString(48);
  localStorage.setItem(DROPBOX_PKCE_VERIFIER_STORAGE_KEY, codeVerifier);
  localStorage.setItem(DROPBOX_OAUTH_STATE_STORAGE_KEY, oauthState);

  const params = new URLSearchParams({
    client_id: appKey,
    response_type: "code",
    redirect_uri: currentRedirectUri(),
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    token_access_type: "offline",
    scope: DROPBOX_SCOPES,
    state: oauthState,
  });
  window.location.assign(`https://www.dropbox.com/oauth2/authorize?${params.toString()}`);
}

async function handleDropboxRedirect() {
  const url = new URL(window.location.href);
  const error = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  if (error) {
    setStatus(`Dropbox OAuth error: ${error}`, true);
    window.history.replaceState({}, "", currentRedirectUri());
    return;
  }
  if (!code) return;

  const returnedState = url.searchParams.get("state") || "";
  const expectedState = localStorage.getItem(DROPBOX_OAUTH_STATE_STORAGE_KEY) || "";
  if (!returnedState || returnedState !== expectedState) {
    setStatus("Dropbox OAuth state не совпал. Попробуй войти еще раз.", true);
    window.history.replaceState({}, "", currentRedirectUri());
    return;
  }

  const appKey = localStorage.getItem(DROPBOX_APP_KEY_STORAGE_KEY) || value("dropbox-app-key");
  const codeVerifier = localStorage.getItem(DROPBOX_PKCE_VERIFIER_STORAGE_KEY) || "";
  try {
    const tokenData = await dropboxTokenRequest({
      grant_type: "authorization_code",
      code,
      client_id: appKey,
      redirect_uri: currentRedirectUri(),
      code_verifier: codeVerifier,
    });
    storeDropboxTokenResponse(tokenData);
    localStorage.removeItem(DROPBOX_PKCE_VERIFIER_STORAGE_KEY);
    localStorage.removeItem(DROPBOX_OAUTH_STATE_STORAGE_KEY);
    setStatus("Dropbox подключен.");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  } finally {
    window.history.replaceState({}, "", currentRedirectUri());
  }
}

async function refreshDropboxAccessToken() {
  const appKey = localStorage.getItem(DROPBOX_APP_KEY_STORAGE_KEY) || value("dropbox-app-key");
  const refreshToken = localStorage.getItem(DROPBOX_REFRESH_TOKEN_STORAGE_KEY) || "";
  if (!appKey || !refreshToken) return "";
  const tokenData = await dropboxTokenRequest({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: appKey,
  });
  storeDropboxTokenResponse(tokenData);
  return tokenData.access_token || "";
}

async function getDropboxAccessToken() {
  const oauthAccessToken = localStorage.getItem(DROPBOX_ACCESS_TOKEN_STORAGE_KEY) || "";
  const expiresAt = Number(localStorage.getItem(DROPBOX_EXPIRES_AT_STORAGE_KEY) || "0");
  if (oauthAccessToken && expiresAt > Date.now() + 30000) {
    return oauthAccessToken;
  }
  const refreshedToken = await refreshDropboxAccessToken();
  if (refreshedToken) return refreshedToken;

  const fallbackToken = value("dropbox-token");
  if (fallbackToken) return fallbackToken;
  throw new Error("Нужно войти в Dropbox или указать access token fallback.");
}

function disconnectDropbox() {
  localStorage.removeItem(DROPBOX_ACCESS_TOKEN_STORAGE_KEY);
  localStorage.removeItem(DROPBOX_REFRESH_TOKEN_STORAGE_KEY);
  localStorage.removeItem(DROPBOX_EXPIRES_AT_STORAGE_KEY);
  localStorage.removeItem(DROPBOX_PKCE_VERIFIER_STORAGE_KEY);
  localStorage.removeItem(DROPBOX_OAUTH_STATE_STORAGE_KEY);
  byId("dropbox-token").value = "";
  localStorage.removeItem(DROPBOX_TOKEN_STORAGE_KEY);
  updateAuthStatus();
  setStatus("Dropbox отключен.");
}

async function waitForDropboxSaveUrl({ token, asyncJobId }) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, attempt < 5 ? 1000 : 2500));
    const status = await dropboxJsonRequest({
      token,
      url: "https://api.dropboxapi.com/2/files/save_url/check_job_status",
      body: { async_job_id: asyncJobId },
    });
    if (status[".tag"] === "complete") return status;
    if (status[".tag"] === "failed") {
      throw new Error(`Dropbox save_url failed: ${JSON.stringify(status)}`);
    }
  }
  throw new Error("Dropbox save_url still running after timeout.");
}

async function saveUrlToDropbox({ token, dropboxPath, imageUrl }) {
  const result = await dropboxJsonRequest({
    token,
    url: "https://api.dropboxapi.com/2/files/save_url",
    body: {
      path: dropboxPath,
      url: imageUrl,
    },
  });
  if (result[".tag"] === "complete") return result;
  if (result[".tag"] === "async_job_id") {
    return waitForDropboxSaveUrl({ token, asyncJobId: result.async_job_id });
  }
  return result;
}

function httpHeaderSafeJson(valueObject) {
  return JSON.stringify(valueObject).replace(/[\u007f-\uffff]/g, (character) => (
    `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`
  ));
}

function prepareCommandForDropbox(command) {
  if (!command.payload?.images?.length) {
    return { command, remoteSaves: [] };
  }
  const remoteSaves = [];
  const nextImages = command.payload.images.map((image) => {
    if (!image.url) return image;
    const relativePath = `images/${image.remote_filename || `${safeFilePart(image.image_key)}.jpg`}`;
    remoteSaves.push({
      relativePath,
      imageUrl: image.url,
      imageKey: image.image_key,
    });
    const { url, remote_filename: _remoteFilename, ...nextImage } = image;
    return {
      ...nextImage,
      path: relativePath,
    };
  });
  return {
    command: {
      ...command,
      payload: {
        ...command.payload,
        images: nextImages,
      },
    },
    remoteSaves,
  };
}

async function sendCurrentCommandToDropbox() {
  let token = "";
  try {
    token = await getDropboxAccessToken();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
    return;
  }
  const inboxPath = normalizeDropboxPath(value("dropbox-inbox-path"));
  const rawCommand = buildCommand();
  const { command, remoteSaves } = prepareCommandForDropbox(rawCommand);
  const commandJson = JSON.stringify(command, null, 2);
  const commandPath = joinDropboxPath(inboxPath, `commands/${commandFileName(command)}`);
  const uploads = buildUploads(rawCommand);
  const total = uploads.length + remoteSaves.length + 1;
  const completed = [];

  byId("send-dropbox-button").disabled = true;
  try {
    setStatus(`Отправляем в Dropbox: 0/${total}`);
    for (const upload of uploads) {
      const dropboxPath = joinDropboxPath(inboxPath, upload.relativePath);
      await uploadToDropbox({
        token,
        dropboxPath,
        blob: upload.blob,
        contentType: upload.blob.type || "application/octet-stream",
      });
      completed.push(dropboxPath);
      setStatus(`Отправляем в Dropbox: ${completed.length}/${total}\n${completed.join("\n")}`);
    }
    for (const remoteSave of remoteSaves) {
      const dropboxPath = joinDropboxPath(inboxPath, remoteSave.relativePath);
      await saveUrlToDropbox({
        token,
        dropboxPath,
        imageUrl: remoteSave.imageUrl,
      });
      completed.push(`${dropboxPath} <- ${remoteSave.imageUrl}`);
      setStatus(`Отправляем в Dropbox: ${completed.length}/${total}\n${completed.join("\n")}`);
    }
    await uploadToDropbox({
      token,
      dropboxPath: commandPath,
      blob: new Blob([commandJson], { type: "application/json;charset=utf-8" }),
      contentType: "application/octet-stream",
    });
    completed.push(commandPath);
    setStatus(`Готово: ${completed.length}/${total}\n${completed.join("\n")}`);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  } finally {
    byId("send-dropbox-button").disabled = false;
  }
}

function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll(".mode-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.mode === mode);
  });
  document.querySelectorAll("[data-mode-panel]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.modePanel === mode);
  });
  resetCommandId();
  render();
}

function bindEvents() {
  document.querySelectorAll("input, select, textarea").forEach((element) => {
    element.addEventListener("input", render);
    element.addEventListener("change", render);
  });

  document.querySelectorAll(".mode-tab").forEach((tab) => {
    tab.addEventListener("click", () => setMode(tab.dataset.mode));
  });

  byId("create-import-input-line").addEventListener("input", () => {
    const parsed = parseImportInputLine(value("create-import-input-line"));
    byId("create-title").value = parsed.title;
    byId("create-user-params").value = parsed.userParams;
    render();
  });

  byId("copy-json-button").addEventListener("click", async () => {
    await navigator.clipboard.writeText(byId("json-output").textContent || "{}");
  });

  byId("download-json-button").addEventListener("click", () => {
    const command = buildCommand();
    downloadText(commandFileName(command), JSON.stringify(command, null, 2));
  });

  byId("save-dropbox-settings-button").addEventListener("click", saveDropboxSettings);
  byId("connect-dropbox-button").addEventListener("click", () => void startDropboxAuth());
  byId("disconnect-dropbox-button").addEventListener("click", disconnectDropbox);
  byId("send-dropbox-button").addEventListener("click", () => void sendCurrentCommandToDropbox());

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.installPrompt = event;
    byId("install-button").hidden = false;
  });

  byId("install-button").addEventListener("click", async () => {
    if (!state.installPrompt) return;
    await state.installPrompt.prompt();
    state.installPrompt = null;
    byId("install-button").hidden = true;
  });
}

loadDropboxSettings();
bindEvents();
void handleDropboxRedirect();
resetCommandId();
render();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
