import {
  commandIdPrefix,
  compactObject,
  createCommandEnvelope,
  generatePicNestFilename,
  imagePath,
  imagePathFromFilename,
  isImageFilename,
  parseImportInputLine,
  remoteImageName,
  safeFilePart,
  stripImportListMarker,
  stripTrailingPriceToken,
} from "./picnestProtocol.mjs";

const state = {
  mode: "products",
  installPrompt: null,
  browserTargetInputId: "",
  browserCurrentPath: "",
  productsCurrentPath: "",
  selectedCreateProductIndex: 0,
  createBatchImageProductCount: 0,
  createBatchImages: {
    mainDropbox: [],
    mainUrl: [],
    duplicateDropbox: [],
    duplicateUrls: [],
  },
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

const CREATE_BATCH_IMAGE_INPUTS = {
  "create-main-image-dropbox": "mainDropbox",
  "create-main-image-url": "mainUrl",
  "create-duplicate-image-dropbox": "duplicateDropbox",
  "create-duplicate-image-urls": "duplicateUrls",
};

function byId(id) {
  return document.getElementById(id);
}

function value(id) {
  return String(byId(id)?.value || "").trim();
}

function checkedValue(name, fallback = "") {
  const element = document.querySelector(`input[name="${name}"]:checked`);
  return String(element?.value || fallback).trim();
}

function files(id) {
  return Array.from(byId(id)?.files || []);
}

function lines(id) {
  return value(id).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function rawLines(id) {
  return String(byId(id)?.value || "").split(/\r?\n/).map((line) => line.trim());
}

function splitImageListLine(line) {
  return String(line || "")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);
}

function currentRedirectUri() {
  const path = window.location.pathname.replace(/\/index\.html$/i, "/");
  return `${window.location.origin}${path}`;
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

function inboxImagePathFromFilename(filename) {
  const cleanFilename = String(filename || "").trim().replace(/^\/+/g, "").replace(/^images\//i, "");
  if (!cleanFilename) return "";
  return `images/${/\.[a-z0-9]{2,5}$/i.test(cleanFilename) ? cleanFilename : `${cleanFilename}.jpg`}`;
}

function dropboxImagePayload(selectedPath, targetFilename, file, suffix = "") {
  const rawPath = String(selectedPath || "").trim();
  const path = imagePathFromFilename(targetFilename, file || { name: rawPath }, suffix);
  if (!rawPath) return { path };
  if (rawPath.startsWith("/")) {
    return {
      path,
      source_dropbox_path: rawPath,
    };
  }
  return {
    path,
    source_dropbox_path: joinDropboxPath(inboxImagesRootPath(), rawPath.replace(/^images\//i, "")),
  };
}

function productsRootPath() {
  const inboxPath = normalizeDropboxPath(value("dropbox-inbox-path"));
  return inboxPath.toLocaleLowerCase().includes("зп_test")
    ? "/ЗП_test"
    : "/ЗП";
}

function statusBrowserRootPath() {
  return joinDropboxPath(productsRootPath(), "PicNest_NotProtected");
}

function inboxImagesRootPath() {
  return joinDropboxPath(normalizeDropboxPath(value("dropbox-inbox-path")), "images");
}

function browserRootPathForTarget(targetInputId) {
  if (targetInputId === "move-main-image-filename") return statusBrowserRootPath();
  if (targetInputId === "create-main-image-dropbox" || targetInputId === "create-duplicate-image-dropbox") {
    return productsRootPath();
  }
  return statusBrowserRootPath();
}

function clampDropboxPathToRoot(path, rootPath) {
  const normalizedPath = normalizeDropboxPath(path);
  const normalizedRoot = normalizeDropboxPath(rootPath);
  const lowerPath = normalizedPath.toLocaleLowerCase();
  const lowerRoot = normalizedRoot.toLocaleLowerCase();
  if (lowerPath === lowerRoot || lowerPath.startsWith(`${lowerRoot}/`)) return normalizedPath;
  return normalizedRoot;
}

function parentDropboxPath(path) {
  const normalized = normalizeDropboxPath(path);
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length <= 1) return normalized;
  return `/${parts.slice(0, -1).join("/")}`;
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

function commandEnvelope(type, payload) {
  return createCommandEnvelope(type, payload, {
    commandId: value("command-id"),
    createdBy: value("created-by") || "mobile",
  });
}

function createProductInputLines() {
  return lines("create-import-input-line").map(stripImportListMarker).filter(Boolean);
}

function resetCreateBatchImageState() {
  state.createBatchImageProductCount = 0;
  state.createBatchImages = {
    mainDropbox: [],
    mainUrl: [],
    duplicateDropbox: [],
    duplicateUrls: [],
  };
}

function ensureCreateBatchImageState(total) {
  if (total <= 1) return;
  if (state.createBatchImageProductCount !== total) {
    Object.entries(CREATE_BATCH_IMAGE_INPUTS).forEach(([inputId, key]) => {
      const previous = state.createBatchImages[key] || [];
      const fromField = rawLines(inputId);
      const source = previous.some(Boolean) ? previous : fromField;
      state.createBatchImages[key] = Array.from({ length: total }, (_, index) => source[index] || "");
    });
    state.createBatchImageProductCount = total;
  }
}

function setCreateBatchImageValue(inputId, index, nextValue) {
  const key = CREATE_BATCH_IMAGE_INPUTS[inputId];
  if (!key) return;
  const total = createProductInputLines().length;
  ensureCreateBatchImageState(total);
  state.createBatchImages[key][index] = nextValue;
}

function syncCreateBatchImageFields(total) {
  if (state.mode !== "create_product") return;
  if (total <= 1) return;
  ensureCreateBatchImageState(total);
  Object.entries(CREATE_BATCH_IMAGE_INPUTS).forEach(([inputId, key]) => {
    const input = byId(inputId);
    if (!input) return;
    input.value = state.createBatchImages[key][state.selectedCreateProductIndex] || "";
  });
}

function createProductMainImageUrls() {
  return rawLines("create-main-image-url");
}

function createProductMainImageDropboxFiles() {
  return rawLines("create-main-image-dropbox");
}

function setTextareaLineValue(inputId, index, nextValue) {
  const target = byId(inputId);
  const values = String(target.value || "").split(/\r?\n/);
  while (values.length <= index) values.push("");
  values[index] = nextValue;
  target.value = values.join("\n").replace(/\n+$/g, "");
  target.dispatchEvent(new Event("input", { bubbles: true }));
  target.dispatchEvent(new Event("change", { bubbles: true }));
}

function createProductDuplicateDropboxGroups() {
  return rawLines("create-duplicate-image-dropbox").map(splitImageListLine);
}

function createProductDuplicateUrlGroups() {
  return rawLines("create-duplicate-image-urls").map(splitImageListLine);
}

function commandIdForBatchItem(type, index, total) {
  const base = value("command-id") || `${commandIdPrefix()}-${type}`;
  if (total <= 1) return base;
  return `${base}-${String(index + 1).padStart(2, "0")}`;
}

function buildCreateProductFromLine(
  line,
  {
    index = 0,
    total = 1,
    mainImageUrl = "",
    mainImageDropbox = "",
    duplicateDropboxFiles = [],
    duplicateImageUrls = [],
  } = {}
) {
  const parsed = parseImportInputLine(line);
  const title = stripTrailingPriceToken(total === 1 ? (value("create-title") || parsed.title) : parsed.title);
  const userParams = total === 1 ? (value("create-user-params") || parsed.userParams) : parsed.userParams;
  const filename = generatePicNestFilename(parsed.source, title, userParams);
  const mainSource = checkedValue("create-main-image-source", "phone");
  const duplicateSource = checkedValue("create-duplicate-image-source", "phone");
  const mainImage = total === 1 && mainSource === "phone" ? (files("create-main-image")[0] || null) : null;
  const duplicateImages = total === 1 && duplicateSource === "phone" ? files("create-duplicate-images") : [];
  const images = [];

  if (mainImage) {
    images.push({
      image_key: "main",
      path: imagePathFromFilename(filename, mainImage),
      is_primary: true,
      is_look: false,
      look_role: "none",
    });
  } else if (mainSource === "dropbox" && mainImageDropbox) {
    images.push({
      image_key: "main",
      ...dropboxImagePayload(mainImageDropbox, filename),
      is_primary: true,
      is_look: false,
      look_role: "none",
    });
  } else if (mainSource === "url" && mainImageUrl) {
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

  (duplicateSource === "dropbox" ? duplicateDropboxFiles : []).forEach((filenameValue, index) => {
    const imageKey = `duplicate-dropbox-${index + 1}`;
    images.push({
      image_key: imageKey,
      ...dropboxImagePayload(filenameValue, filename, null, String(index + 2)),
      is_primary: false,
      is_look: false,
      look_role: "none",
    });
  });

  (duplicateSource === "url" ? duplicateImageUrls : []).forEach((url, index) => {
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

  return createCommandEnvelope("create_product", compactObject(payload), {
    commandId: commandIdForBatchItem("create_product", index, total),
    createdBy: value("created-by") || "mobile",
  });
}

function buildCreateProductCommands() {
  const inputLines = createProductInputLines();
  const productLines = inputLines.length ? inputLines : [value("create-import-input-line")].filter(Boolean);
  const imageUrls = createProductMainImageUrls();
  const imageDropboxFiles = createProductMainImageDropboxFiles();
  const duplicateDropboxGroups = createProductDuplicateDropboxGroups();
  const duplicateUrlGroups = createProductDuplicateUrlGroups();
  const total = productLines.length;
  ensureCreateBatchImageState(total);
  return productLines.map((line, index) => buildCreateProductFromLine(line, {
    index,
    total,
    mainImageUrl: total === 1 ? (lines("create-main-image-url")[0] || value("create-main-image-url")) : (state.createBatchImages.mainUrl[index] || imageUrls[index] || ""),
    mainImageDropbox: total === 1 ? (lines("create-main-image-dropbox")[0] || value("create-main-image-dropbox")) : (state.createBatchImages.mainDropbox[index] || imageDropboxFiles[index] || ""),
    duplicateDropboxFiles: total === 1 ? splitImageListLine(value("create-duplicate-image-dropbox")) : splitImageListLine(state.createBatchImages.duplicateDropbox[index] || duplicateDropboxGroups[index]?.join("; ") || ""),
    duplicateImageUrls: total === 1 ? lines("create-duplicate-image-urls") : splitImageListLine(state.createBatchImages.duplicateUrls[index] || duplicateUrlGroups[index]?.join("; ") || ""),
  }));
}

function buildCreateProductUploads(command) {
  if (buildCreateProductCommands().length > 1) return [];
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
  return buildCreateProductCommands()[0] || commandEnvelope("create_product", {});
}

function buildCommands() {
  if (state.mode === "create_product") return buildCreateProductCommands();
  return [buildCommand()];
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
  const roleByKey = {
    main: "main",
  };
  return (command.payload.images || []).map((image) => ({
    key: image.image_key,
    role: roleByKey[image.image_key] || (image.is_primary ? "main" : "дубль"),
    path: image.path || (image.remote_filename ? `images/${image.remote_filename}` : image.url),
    url: image.url || "",
  }));
}

function commandHasImages(command) {
  return Array.isArray(command.payload?.images) && command.payload.images.length > 0;
}

function renderFilePlan(commands) {
  const filePlan = byId("file-plan");
  const rows = commands.flatMap((command) => {
    const imagePlan = selectedImagePlan(command);
    return [
      `<div class="file-plan-item"><strong>команда</strong><span>commands/${commandFileName(command)}</span></div>`,
      ...(command.type === "create_product" && !commandHasImages(command)
        ? [`<div class="file-plan-item file-plan-warning"><strong>нужна картинка</strong><span>${command.payload?.title || command.command_id}: добавьте Main image URL строкой в том же порядке</span></div>`]
        : []),
      ...imagePlan.map((image) => (
        `<div class="file-plan-item"><strong>${image.role}</strong><span>${image.url ? `URL: ${image.url} -> ${image.path}` : image.path}</span></div>`
      )),
    ];
  });
  filePlan.innerHTML = rows.join("");
}

function render() {
  if (state.mode === "products") return;
  const commands = buildCommands();
  const isCreateBatch = state.mode === "create_product" && commands.length > 1;
  document.querySelectorAll("[data-create-single-field]").forEach((element) => {
    element.hidden = isCreateBatch;
  });
  byId("json-output").textContent = JSON.stringify(commands.length === 1 ? commands[0] : commands, null, 2);
  renderFilePlan(commands);
  renderCreateBatchProductsPanel(commands);
  syncCreateBatchImageFields(commands.length);
  renderParsedCreateFields(commands[0]);
}

function renderParsedCreateFields(command) {
  if (state.mode !== "create_product") return;
  if (!command?.payload) {
    byId("parsed-source-url").textContent = "—";
    byId("parsed-source").textContent = "—";
    byId("parsed-filename").textContent = "—";
    return;
  }
  byId("parsed-source-url").textContent = command.payload.source_url || "—";
  byId("parsed-source").textContent = command.payload.source || "—";
  byId("parsed-filename").textContent = generatePicNestFilename(
    command.payload.source,
    command.payload.title,
    command.payload.user_params
  );
}

function renderCreateBatchProductsPanel(commands = buildCreateProductCommands()) {
  const panel = byId("create-batch-products-panel");
  const tabs = byId("create-batch-product-tabs");
  const details = byId("create-batch-product-details");
  if (!panel || !tabs || !details || commands.length <= 1) {
    if (panel) panel.hidden = true;
    return;
  }

  panel.hidden = false;
  state.selectedCreateProductIndex = Math.min(state.selectedCreateProductIndex, commands.length - 1);
  tabs.innerHTML = "";
  commands.forEach((command, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `batch-product-tab ${index === state.selectedCreateProductIndex ? "active" : ""}`;
    button.textContent = `Товар ${index + 1}`;
    button.addEventListener("click", () => {
      state.selectedCreateProductIndex = index;
      render();
    });
    tabs.append(button);
  });

  const command = commands[state.selectedCreateProductIndex];
  const mainImage = (command.payload.images || []).find((image) => image.is_primary);
  const duplicateImages = (command.payload.images || []).filter((image) => !image.is_primary);
  details.innerHTML = `
    <div><strong>title</strong><span>${command.payload.title || "—"}</span></div>
    <div><strong>user_params</strong><span>${command.payload.user_params || "—"}</span></div>
    <div><strong>source_url</strong><span>${command.payload.source_url || "—"}</span></div>
    <div><strong>source</strong><span>${command.payload.source || "—"}</span></div>
    <div><strong>filename</strong><span>${generatePicNestFilename(command.payload.source, command.payload.title, command.payload.user_params)}</span></div>
    <div><strong>main image</strong><span>${mainImage?.path || mainImage?.url || "—"}</span></div>
    <div><strong>duplicates</strong><span>${duplicateImages.map((image) => image.path || image.url).join("; ") || "—"}</span></div>
  `;
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
  const appKey = localStorage.getItem(DROPBOX_APP_KEY_STORAGE_KEY) || "";
  const fallbackToken = localStorage.getItem(DROPBOX_TOKEN_STORAGE_KEY) || "";
  const refreshToken = localStorage.getItem(DROPBOX_REFRESH_TOKEN_STORAGE_KEY) || "";
  byId("dropbox-app-key").value = appKey;
  byId("dropbox-token").value = localStorage.getItem(DROPBOX_TOKEN_STORAGE_KEY) || "";
  byId("dropbox-inbox-path").value = localStorage.getItem(DROPBOX_INBOX_PATH_STORAGE_KEY) || "/ЗП_test/PicNestInbox";
  byId("dropbox-redirect-uri").value = currentRedirectUri();
  byId("dropbox-card").open = !(appKey || fallbackToken || refreshToken);
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

function clearInput(inputId) {
  const element = byId(inputId);
  if (!element) return;
  element.value = "";
  if (CREATE_BATCH_IMAGE_INPUTS[inputId] && createProductInputLines().length > 1) {
    setCreateBatchImageValue(inputId, state.selectedCreateProductIndex, "");
  }
  render();
}

function updateCreateImageSourcePanels() {
  const mainSource = checkedValue("create-main-image-source", "phone");
  const duplicateSource = checkedValue("create-duplicate-image-source", "phone");
  document.querySelectorAll("[data-main-image-source-panel]").forEach((element) => {
    element.hidden = element.dataset.mainImageSourcePanel !== mainSource;
  });
  document.querySelectorAll("[data-duplicate-image-source-panel]").forEach((element) => {
    element.hidden = element.dataset.duplicateImageSourcePanel !== duplicateSource;
  });
}

function bindExclusiveCheckboxGroup(name, fallback = "phone") {
  const inputs = Array.from(document.querySelectorAll(`input[name="${name}"]`));
  inputs.forEach((input) => {
    input.addEventListener("change", () => {
      if (input.checked) {
        inputs.forEach((candidate) => {
          if (candidate !== input) candidate.checked = false;
        });
      }
      if (!inputs.some((candidate) => candidate.checked)) {
        const fallbackInput = inputs.find((candidate) => candidate.value === fallback) || inputs[0];
        if (fallbackInput) fallbackInput.checked = true;
      }
      updateCreateImageSourcePanels();
      render();
    });
  });
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

async function dropboxApiRequest({ token, endpoint, body }) {
  return dropboxJsonRequest({
    token,
    url: `https://api.dropboxapi.com/2/${endpoint}`,
    body,
  });
}

async function getDropboxThumbnailUrl({ token, path }) {
  const response = await fetch("https://content.dropboxapi.com/2/files/get_thumbnail", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Dropbox-API-Arg": httpHeaderSafeJson({
        path,
        format: "jpeg",
        size: "w256h256",
        mode: "strict",
      }),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Dropbox thumbnail failed ${response.status}: ${text}`);
  }
  return URL.createObjectURL(await response.blob());
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

async function checkDropboxConnection() {
  let token = "";
  try {
    token = await getDropboxAccessToken();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
    return;
  }

  const inboxPath = normalizeDropboxPath(value("dropbox-inbox-path"));
  try {
    const account = await dropboxApiRequest({
      token,
      endpoint: "users/get_current_account",
      body: null,
    });
    const metadata = await dropboxApiRequest({
      token,
      endpoint: "files/get_metadata",
      body: { path: inboxPath },
    });
    setStatus([
      "Dropbox доступен.",
      `Аккаунт: ${account.email || account.name?.display_name || "—"}`,
      `Inbox path: ${metadata.path_display || inboxPath}`,
    ].join("\n"));
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  }
}

async function listDropboxFolder(path) {
  const token = await getDropboxAccessToken();
  const entries = [];
  let result = await dropboxApiRequest({
    token,
    endpoint: "files/list_folder",
    body: {
      path: normalizeDropboxPath(path),
      recursive: false,
      include_media_info: false,
      include_deleted: false,
      include_has_explicit_shared_members: false,
    },
  });
  entries.push(...(result.entries || []));
  while (result.has_more) {
    result = await dropboxApiRequest({
      token,
      endpoint: "files/list_folder/continue",
      body: { cursor: result.cursor },
    });
    entries.push(...(result.entries || []));
  }
  return entries;
}

function setBrowserStatus(message, isError = false) {
  const element = byId("browser-status");
  element.textContent = message;
  element.classList.toggle("error", isError);
}

function renderBrowserEntries(entries) {
  const list = byId("browser-list");
  list.innerHTML = "";
  if (!entries.length) {
    list.innerHTML = `<div class="browser-empty">Пусто</div>`;
    return;
  }

  const folders = entries
    .filter((entry) => entry[".tag"] === "folder")
    .sort((a, b) => a.name.localeCompare(b.name));
  const images = entries
    .filter((entry) => entry[".tag"] === "file" && isImageFilename(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name));

  [...folders, ...images].forEach((entry) => {
    const isFolder = entry[".tag"] === "folder";
    const button = document.createElement("button");
    button.className = `browser-entry ${isFolder ? "folder" : "file"}`;
    button.type = "button";
    button.dataset.path = entry.path_display || entry.path_lower || "";
    button.dataset.name = entry.name || "";
    button.dataset.kind = entry[".tag"] || "";

    if (isFolder) {
      const icon = document.createElement("span");
      icon.className = "folder-icon";
      icon.setAttribute("aria-hidden", "true");
      button.append(icon);
    }
    const name = document.createElement("span");
    name.textContent = entry.name || "";
    button.append(name);

    button.addEventListener("click", () => {
      const path = button.dataset.path || "";
      if (button.dataset.kind === "folder") {
        void loadDropboxBrowserPath(path);
        return;
      }
      const filename = button.dataset.name || "";
      if (state.browserTargetInputId && filename) {
        const target = byId(state.browserTargetInputId);
        const selectedValue = state.browserTargetInputId === "move-main-image-filename" ? filename : path;
        if (target.tagName === "TEXTAREA") {
          const productCount = createProductInputLines().length;
          if (state.browserTargetInputId === "create-main-image-dropbox") {
            if (productCount > 1) {
              setCreateBatchImageValue("create-main-image-dropbox", state.selectedCreateProductIndex, selectedValue);
              target.value = selectedValue;
            } else {
              target.value = selectedValue;
            }
          } else if (state.browserTargetInputId === "create-duplicate-image-dropbox" && productCount > 1) {
            const current = state.createBatchImages.duplicateDropbox[state.selectedCreateProductIndex] || "";
            const separator = current && !current.endsWith(";") ? "; " : "";
            const nextValue = current ? `${current}${separator}${selectedValue}` : selectedValue;
            setCreateBatchImageValue("create-duplicate-image-dropbox", state.selectedCreateProductIndex, nextValue);
            target.value = nextValue;
          } else {
            const current = String(target.value || "").trim();
            const separator = state.browserTargetInputId === "create-duplicate-image-dropbox" && current && !current.endsWith(";") ? "; " : "\n";
            target.value = current ? `${current}${separator}${selectedValue}` : selectedValue;
          }
        } else {
          target.value = selectedValue;
        }
        if (!(target.tagName === "TEXTAREA" && CREATE_BATCH_IMAGE_INPUTS[state.browserTargetInputId] && createProductInputLines().length > 1)) {
          target.dispatchEvent(new Event("input", { bubbles: true }));
          target.dispatchEvent(new Event("change", { bubbles: true }));
        }
        setStatus(`Выбран файл Dropbox: ${filename}`);
        render();
      }
      if (state.browserTargetInputId !== "create-duplicate-image-dropbox") {
        closeDropboxBrowser();
      }
    });
    list.append(button);
  });
}

async function loadDropboxBrowserPath(path) {
  let token = "";
  try {
    token = await getDropboxAccessToken();
  } catch (error) {
    setBrowserStatus(error instanceof Error ? error.message : String(error), true);
    return;
  }

  state.browserCurrentPath = clampDropboxPathToRoot(path, browserRootPathForTarget(state.browserTargetInputId));
  byId("browser-current-path").textContent = state.browserCurrentPath;
  byId("browser-list").innerHTML = "";
  setBrowserStatus("Загружаю список файлов...");

  try {
    const entries = await listDropboxFolder(state.browserCurrentPath);
    renderBrowserEntries(entries);
    setBrowserStatus(`Найдено: ${entries.length}`);
  } catch (error) {
    setBrowserStatus(error instanceof Error ? error.message : String(error), true);
  }
}

function openDropboxBrowser(targetInputId) {
  if (!["move-main-image-filename", "create-main-image-dropbox", "create-duplicate-image-dropbox"].includes(targetInputId)) return;
  state.browserTargetInputId = targetInputId;
  const browser = byId("dropbox-browser");
  const target = byId(targetInputId);
  const button = document.querySelector(`.choose-main-image-button[data-target-input="${targetInputId}"]`);
  const anchor = button?.closest(".actions") || target?.closest("label");
  if (anchor) anchor.after(browser);
  browser.hidden = false;
  browser.scrollIntoView({ block: "nearest" });
  void loadDropboxBrowserPath(browserRootPathForTarget(targetInputId));
}

function closeDropboxBrowser() {
  state.browserTargetInputId = "";
  byId("browser-list").innerHTML = "";
  setBrowserStatus("—");
  byId("dropbox-browser").hidden = true;
}

function setProductsStatus(message, isError = false) {
  const element = byId("products-status");
  element.textContent = message;
  element.classList.toggle("error", isError);
}

function renderProductsEntries(entries, token) {
  const list = byId("products-list");
  list.innerHTML = "";
  const folders = entries
    .filter((entry) => entry[".tag"] === "folder")
    .sort((a, b) => a.name.localeCompare(b.name));
  const images = entries
    .filter((entry) => entry[".tag"] === "file" && isImageFilename(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  const visibleEntries = [...folders, ...images];

  if (!visibleEntries.length) {
    list.innerHTML = `<div class="browser-empty">Пусто</div>`;
    return;
  }

  if (folders.length) {
    const folderList = document.createElement("div");
    folderList.className = "products-folder-list";
    folders.forEach((entry) => {
      const button = document.createElement("button");
      button.className = "browser-entry folder";
      button.type = "button";
      button.dataset.path = entry.path_display || entry.path_lower || "";
      button.dataset.name = entry.name || "";

      const icon = document.createElement("span");
      icon.className = "folder-icon";
      icon.setAttribute("aria-hidden", "true");
      const name = document.createElement("span");
      name.textContent = entry.name || "";
      button.append(icon, name);

      button.addEventListener("click", () => {
        void loadProductsPath(button.dataset.path || "");
      });
      folderList.append(button);
    });
    list.append(folderList);
  }

  if (!images.length) return;

  const imageGrid = document.createElement("div");
  imageGrid.className = "products-image-grid";
  images.forEach((entry) => {
    const path = entry.path_display || entry.path_lower || "";
    const button = document.createElement("button");
    button.className = "product-image-card";
    button.type = "button";
    button.dataset.path = path;
    button.dataset.name = entry.name || "";

    const preview = document.createElement("div");
    preview.className = "product-image-preview";
    preview.textContent = "Фото";

    const name = document.createElement("span");
    name.className = "product-image-name";
    name.textContent = entry.name || "";
    button.append(preview, name);

    button.addEventListener("click", () => {
      setProductsStatus(`Выбран товар: ${button.dataset.name || "—"}`);
    });

    if (path) {
      getDropboxThumbnailUrl({ token, path })
        .then((url) => {
          preview.innerHTML = "";
          const image = document.createElement("img");
          image.src = url;
          image.alt = entry.name || "";
          image.loading = "lazy";
          preview.append(image);
        })
        .catch(() => {
          preview.textContent = "Нет превью";
        });
    }
    imageGrid.append(button);
  });
  list.append(imageGrid);
}

async function loadProductsPath(path = "") {
  const nextPath = path ? normalizeDropboxPath(path) : productsRootPath();
  state.productsCurrentPath = nextPath;
  byId("products-current-path").textContent = nextPath;
  byId("products-list").innerHTML = "";
  setProductsStatus("Загружаю список товаров...");

  try {
    const token = await getDropboxAccessToken();
    const entries = await listDropboxFolder(nextPath);
    renderProductsEntries(entries, token);
    const visibleCount = entries.filter((entry) => (
      entry[".tag"] === "folder" || (entry[".tag"] === "file" && isImageFilename(entry.name))
    )).length;
    setProductsStatus(`Найдено: ${visibleCount}`);
  } catch (error) {
    setProductsStatus(error instanceof Error ? error.message : String(error), true);
  }
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
  const result = await dropboxApiRequest({
    token,
    endpoint: "files/save_url",
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

async function deleteDropboxPathIfExists({ token, dropboxPath }) {
  try {
    await dropboxApiRequest({
      token,
      endpoint: "files/delete_v2",
      body: { path: dropboxPath },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("not_found")) throw error;
  }
}

async function copyDropboxFile({ token, fromPath, toPath }) {
  if (normalizeDropboxPath(fromPath) === normalizeDropboxPath(toPath)) return null;
  await deleteDropboxPathIfExists({ token, dropboxPath: toPath });
  return dropboxApiRequest({
    token,
    endpoint: "files/copy_v2",
    body: {
      from_path: normalizeDropboxPath(fromPath),
      to_path: normalizeDropboxPath(toPath),
      allow_shared_folder: false,
      autorename: false,
      allow_ownership_transfer: false,
    },
  });
}

function httpHeaderSafeJson(valueObject) {
  return JSON.stringify(valueObject).replace(/[\u007f-\uffff]/g, (character) => (
    `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`
  ));
}

function prepareCommandForDropbox(command) {
  if (!command.payload?.images?.length) {
    return { command, remoteSaves: [], dropboxCopies: [] };
  }
  const remoteSaves = [];
  const dropboxCopies = [];
  const nextImages = command.payload.images.map((image) => {
    if (image.source_dropbox_path) {
      dropboxCopies.push({
        fromPath: image.source_dropbox_path,
        relativePath: image.path,
        imageKey: image.image_key,
      });
      const { source_dropbox_path: _sourceDropboxPath, ...nextImage } = image;
      return nextImage;
    }
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
    dropboxCopies,
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
  const rawCommands = buildCommands();
  if (!rawCommands.length) {
    setStatus("Нет команд для отправки.", true);
    return;
  }
  const commandsWithoutImages = rawCommands.filter((command) => command.type === "create_product" && !commandHasImages(command));
  if (commandsWithoutImages.length) {
    setStatus(
      `Нельзя отправить create_product без main image. Добавьте Main image URL для строк: ${commandsWithoutImages.map((command) => command.command_id).join(", ")}`,
      true
    );
    return;
  }
  const preparedItems = rawCommands.map((rawCommand) => ({
    rawCommand,
    ...prepareCommandForDropbox(rawCommand),
  }));
  const uploads = preparedItems.flatMap((item) => buildUploads(item.rawCommand));
  const remoteSaves = preparedItems.flatMap((item) => item.remoteSaves);
  const dropboxCopies = preparedItems.flatMap((item) => item.dropboxCopies);
  const total = uploads.length + remoteSaves.length + dropboxCopies.length + preparedItems.length;
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
    for (const dropboxCopy of dropboxCopies) {
      const dropboxPath = joinDropboxPath(inboxPath, dropboxCopy.relativePath);
      await copyDropboxFile({
        token,
        fromPath: dropboxCopy.fromPath,
        toPath: dropboxPath,
      });
      completed.push(`${dropboxPath} <- ${dropboxCopy.fromPath}`);
      setStatus(`Отправляем в Dropbox: ${completed.length}/${total}\n${completed.join("\n")}`);
    }
    for (const item of preparedItems) {
      const commandJson = JSON.stringify(item.command, null, 2);
      const commandPath = joinDropboxPath(inboxPath, `commands/${commandFileName(item.command)}`);
      await uploadToDropbox({
        token,
        dropboxPath: commandPath,
        blob: new Blob([commandJson], { type: "application/json;charset=utf-8" }),
        contentType: "application/octet-stream",
      });
      completed.push(commandPath);
      setStatus(`Отправляем в Dropbox: ${completed.length}/${total}\n${completed.join("\n")}`);
    }
    setStatus(`Готово: ${completed.length}/${total}\nПроверь в Dropbox:\n${joinDropboxPath(inboxPath, "commands")}\n\nИзображения с телефона загружены файлами. Изображения из URL сохранены в Dropbox, изображения из Dropbox скопированы в PicNestInbox/images.\n\nЧто подготовлено:\n${completed.map((path) => `- ${path}`).join("\n")}`);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  } finally {
    byId("send-dropbox-button").disabled = false;
  }
}

function setMode(mode) {
  state.mode = mode;
  closeDropboxBrowser();
  document.querySelectorAll(".mode-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.mode === mode);
  });
  document.querySelectorAll("[data-mode-panel]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.modePanel === mode);
  });
  document.querySelectorAll(".command-only").forEach((element) => {
    element.hidden = mode === "products";
  });
  if (mode === "products") {
    void loadProductsPath(productsRootPath());
    return;
  }
  resetCommandId();
  render();
}

function bindEvents() {
  document.querySelectorAll("input, select, textarea").forEach((element) => {
    element.addEventListener("input", () => {
      if (CREATE_BATCH_IMAGE_INPUTS[element.id] && createProductInputLines().length > 1) return;
      render();
    });
    element.addEventListener("change", () => {
      if (CREATE_BATCH_IMAGE_INPUTS[element.id] && createProductInputLines().length > 1) return;
      render();
    });
  });

  Object.keys(CREATE_BATCH_IMAGE_INPUTS).forEach((inputId) => {
    byId(inputId).addEventListener("input", () => {
      if (createProductInputLines().length <= 1) {
        render();
        return;
      }
      setCreateBatchImageValue(inputId, state.selectedCreateProductIndex, byId(inputId).value);
      render();
    });
  });

  document.querySelectorAll(".mode-tab").forEach((tab) => {
    tab.addEventListener("click", () => setMode(tab.dataset.mode));
  });

  byId("create-import-input-line").addEventListener("input", () => {
    resetCreateBatchImageState();
    const productLines = createProductInputLines();
    if (productLines.length <= 1) {
      const parsed = parseImportInputLine(productLines[0] || value("create-import-input-line"));
      byId("create-title").value = parsed.title;
      byId("create-user-params").value = parsed.userParams;
    } else {
      byId("create-title").value = "";
      byId("create-user-params").value = "";
    }
    render();
  });

  bindExclusiveCheckboxGroup("create-main-image-source", "phone");
  bindExclusiveCheckboxGroup("create-duplicate-image-source", "phone");

  byId("copy-json-button").addEventListener("click", async () => {
    await navigator.clipboard.writeText(byId("json-output").textContent || "{}");
  });

  byId("download-json-button").addEventListener("click", () => {
    const commands = buildCommands();
    if (commands.length === 1) {
      downloadText(commandFileName(commands[0]), JSON.stringify(commands[0], null, 2));
      return;
    }
    downloadText(`${safeFilePart(value("command-id") || "picnest-commands")}.json`, JSON.stringify(commands, null, 2));
  });

  byId("save-dropbox-settings-button").addEventListener("click", saveDropboxSettings);
  byId("connect-dropbox-button").addEventListener("click", () => void startDropboxAuth());
  byId("check-dropbox-button").addEventListener("click", () => void checkDropboxConnection());
  byId("disconnect-dropbox-button").addEventListener("click", disconnectDropbox);
  byId("send-dropbox-button").addEventListener("click", () => void sendCurrentCommandToDropbox());
  byId("close-dropbox-browser").onclick = closeDropboxBrowser;
  byId("browser-up-button").addEventListener("click", () => {
    const rootPath = browserRootPathForTarget(state.browserTargetInputId);
    if (state.browserCurrentPath === rootPath) return;
    void loadDropboxBrowserPath(clampDropboxPathToRoot(parentDropboxPath(state.browserCurrentPath), rootPath));
  });
  byId("products-up-button").addEventListener("click", () => {
    const rootPath = productsRootPath();
    if (!state.productsCurrentPath || state.productsCurrentPath === rootPath) return;
    void loadProductsPath(parentDropboxPath(state.productsCurrentPath));
  });
  byId("products-refresh-button").addEventListener("click", () => {
    void loadProductsPath(state.productsCurrentPath || productsRootPath());
  });

  document.querySelectorAll(".choose-main-image-button").forEach((button) => {
    button.addEventListener("click", () => openDropboxBrowser(button.dataset.targetInput || ""));
  });

  [
    ["clear-create-main-image", "create-main-image"],
    ["clear-create-main-image-dropbox", "create-main-image-dropbox"],
    ["clear-create-main-image-url", "create-main-image-url"],
    ["clear-create-duplicate-images", "create-duplicate-images"],
    ["clear-create-duplicate-image-dropbox", "create-duplicate-image-dropbox"],
    ["clear-create-duplicate-image-urls", "create-duplicate-image-urls"],
    ["clear-add-images", "add-images"],
    ["clear-add-image-urls", "add-image-urls"],
    ["clear-move-main-image-filename", "move-main-image-filename"],
  ].forEach(([buttonId, inputId]) => {
    byId(buttonId).addEventListener("click", () => clearInput(inputId));
  });

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

async function bootstrap() {
  loadDropboxSettings();
  bindEvents();
  updateCreateImageSourcePanels();
  await handleDropboxRedirect();
  setMode(state.mode);

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

void bootstrap();
