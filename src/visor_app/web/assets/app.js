const conversation = document.querySelector("#conversation");
const form = document.querySelector("#chat-form");
const input = document.querySelector("#message-input");
const status = document.querySelector("#runtime-status");
const scopeNotice = document.querySelector("#scope-notice");
const promptButtons = document.querySelectorAll("[data-prompt]");
const languageToggle = document.querySelector("#language-toggle");
const landing = document.querySelector("#landing");
const guideBox = document.querySelector("#guide-box");
const guideTitle = document.querySelector("#guide-title");
const guideDescription = document.querySelector("#guide-description");
const guideAction = document.querySelector("#guide-action");
const sendButton = document.querySelector(".send-button");

const LANGUAGE_KEY = "visorUiLanguage";
// Local-lab fallback only. Remote deployments should provide
// VISOR_CEREVI_EXPLORER_BASE_URL or VISOR_CATALOG_URL through /v1/config.
const DEFAULT_CEREVI_EXPLORER_BASE_URL = "https://192.168.1.130:8080";
let cereviExplorerBaseUrl = DEFAULT_CEREVI_EXPLORER_BASE_URL;
const COPY = {
  en: {
    "document.lang": "en",
    languageLabel: "En",
    switchLanguage: "Switch language",
    "landing.label": "VISoR assistant landing",
    "conversation.label": "Chat messages",
    "form.label": "VISoR chat composer",
    placeholder: "Chat with VISoR",
    send: "Send",
    "guide.label": "Current demo scope",
    "guide.title": "Ask Skills",
    "guide.description": "can only list available skills for now",
    "guide.action": "Ask skills",
    quickPrompt: "show me your skills",
    "status.ready": "Ready",
    "status.connecting": "Connecting",
    "status.thinking": "Thinking",
    "status.deepseek": "DeepSeek",
    "status.error": "Error",
    "thought.one": "Thought for {seconds} second",
    "thought.many": "Thought for {seconds} seconds",
    agentEvent: "Agent event",
    requestFailed: "Request failed",
    noAgentResponse: "The agent runtime did not return a response.",
    streamEnded: "The agent stream ended before a final response.",
    noResponse: "No response returned.",
    streamingUnsupported: "Streaming is not supported by this browser.",
    "skills.inputs": "inputs",
    "skills.noRequiredInputs": "no required inputs",
    "skills.requires": "requires",
    "skills.metaRequires": "requires {inputs}",
    "scope.remainingOne": "1 general-question check left",
    "scope.remainingMany": "{remaining} general-question checks left",
    "scope.notice": "Skill mode: {remainingText}. Use generic app (DeepSeek etc.) for broader chat.",
    "visualize.candidatesIntro": "Select a brain to preview:",
    "visualize.noCandidates": "No matching brains in the catalog.",
    "visualize.view": "Preview",
    "visualize.loading": "Loading viewer…",
    "visualize.species": "Species",
    "visualize.variants": "Variants",
    "visualize.suggestionsIntro": "Try another preview:",
    "visualize.cereviPrefix": "For advanced inspection, use",
    "visualize.cereviLabel": "Cerevi ->",
  },
  zh: {
    "document.lang": "zh-CN",
    languageLabel: "中",
    switchLanguage: "切换语言",
    "landing.label": "VISoR 助手首页",
    "conversation.label": "聊天消息",
    "form.label": "VISoR 聊天输入框",
    placeholder: "和 VISoR 聊天",
    send: "发送",
    "guide.label": "当前演示范围",
    "guide.title": "询问技能",
    "guide.description": "目前只能列出可用技能",
    "guide.action": "问技能",
    quickPrompt: "展示你的技能",
    "status.ready": "就绪",
    "status.connecting": "连接中",
    "status.thinking": "思考中",
    "status.deepseek": "DeepSeek",
    "status.error": "错误",
    "thought.one": "思考了 {seconds} 秒",
    "thought.many": "思考了 {seconds} 秒",
    agentEvent: "代理事件",
    requestFailed: "请求失败",
    noAgentResponse: "代理运行时没有返回响应。",
    streamEnded: "代理流在返回最终响应前结束了。",
    noResponse: "没有返回响应。",
    streamingUnsupported: "当前浏览器不支持流式响应。",
    "skills.inputs": "输入",
    "skills.noRequiredInputs": "无必填输入",
    "skills.requires": "需要",
    "skills.metaRequires": "需要 {inputs}",
    "scope.remainingOne": "还剩 1 次通用问题检查",
    "scope.remainingMany": "还剩 {remaining} 次通用问题检查",
    "scope.notice": "技能模式：{remainingText}。更广泛的聊天请使用通用应用（DeepSeek 等）。",
    "visualize.candidatesIntro": "请选择要预览的脑数据：",
    "visualize.noCandidates": "数据集目录中没有匹配项。",
    "visualize.view": "预览",
    "visualize.loading": "正在加载可视化…",
    "visualize.species": "物种",
    "visualize.variants": "变体",
    "visualize.suggestionsIntro": "尝试另一个预览：",
    "visualize.cereviPrefix": "高级检查请使用",
    "visualize.cereviLabel": "Cerevi ->",
  },
};

let uiLanguage = initialLanguage();
let statusKey = "ready";
let statusState = "ready";
let latestScopePayload = null;

function normalizeLanguage(language) {
  const value = String(language || "").toLowerCase();
  return value.startsWith("zh") || value === "cn" ? "zh" : "en";
}

function detectInputLanguage(text) {
  return /[\u3400-\u9fff\uf900-\ufaff]/u.test(text) ? "zh" : null;
}

function browserLanguage() {
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
  return normalizeLanguage(languages.find(Boolean));
}

function initialLanguage() {
  try {
    const stored = window.localStorage.getItem(LANGUAGE_KEY);
    return stored ? normalizeLanguage(stored) : browserLanguage();
  } catch {
    return browserLanguage();
  }
}

function t(key, values = {}) {
  const template = COPY[uiLanguage]?.[key] || COPY.en[key] || key;
  return template.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ""));
}

function setUiLanguage(language, persist = true) {
  uiLanguage = normalizeLanguage(language);
  if (persist) {
    try {
      window.localStorage.setItem(LANGUAGE_KEY, uiLanguage);
    } catch {
      // Local storage is optional; the toggle still works for this page.
    }
  }
  applyLanguage();
}

function refreshStatus() {
  status.textContent = t(`status.${statusKey}`);
  status.classList.toggle("is-loading", statusState === "loading");
  status.classList.toggle("is-error", statusState === "error");
}

function remainingText(remaining) {
  const key = remaining === 1 ? "scope.remainingOne" : "scope.remainingMany";
  return t(key, { remaining });
}

function renderScopeNotice() {
  if (!latestScopePayload) {
    scopeNotice.textContent = "";
    scopeNotice.classList.remove("is-visible");
    return;
  }
  const remaining = latestScopePayload.off_topic_remaining;
  const notice = Number.isInteger(remaining)
    ? t("scope.notice", { remainingText: remainingText(remaining) })
    : latestScopePayload.scope_notice;
  if (!notice) {
    scopeNotice.textContent = "";
    scopeNotice.classList.remove("is-visible");
    return;
  }
  scopeNotice.textContent = notice;
  scopeNotice.classList.add("is-visible");
}

function thoughtTextForSeconds(seconds) {
  return t(seconds === 1 ? "thought.one" : "thought.many", { seconds });
}

function updateAllThoughtLabels() {
  for (const label of document.querySelectorAll(".thought-label")) {
    const startedAt = Number(label.dataset.startedAt || performance.now());
    const seconds = Math.max(1, Math.round((performance.now() - startedAt) / 1000));
    label.textContent = thoughtTextForSeconds(seconds);
  }
}

function applyLanguage() {
  document.documentElement.lang = t("document.lang");
  document.body.dataset.language = uiLanguage;
  landing?.setAttribute("aria-label", t("landing.label"));
  conversation?.setAttribute("aria-label", t("conversation.label"));
  form?.setAttribute("aria-label", t("form.label"));
  input.placeholder = t("placeholder");
  sendButton?.setAttribute("aria-label", t("send"));
  if (languageToggle) {
    languageToggle.textContent = t("languageLabel");
    languageToggle.setAttribute("aria-label", t("switchLanguage"));
    languageToggle.dataset.lang = uiLanguage;
  }
  guideBox?.setAttribute("aria-label", t("guide.label"));
  if (guideTitle) guideTitle.textContent = t("guide.title");
  if (guideDescription) guideDescription.textContent = t("guide.description");
  if (guideAction) {
    guideAction.textContent = t("guide.action");
    guideAction.dataset.prompt = t("quickPrompt");
  }
  refreshStatus();
  renderScopeNotice();
  updateAllThoughtLabels();
}

function getSessionId() {
  const key = "visorChatSessionId";
  try {
    let sessionId = window.localStorage.getItem(key);
    if (!sessionId) {
      sessionId = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
      window.localStorage.setItem(key, sessionId);
    }
    return sessionId;
  } catch {
    return "browser-session";
  }
}

function focusComposer() {
  window.requestAnimationFrame(() => {
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return;
    input.focus({ preventScroll: true });
  });
}

function setStatus(text, state = "ready") {
  statusKey = text;
  statusState = state;
  refreshStatus();
}

function setScopeNotice(payload) {
  const hasNotice = Boolean(payload?.scope_notice) || Number.isInteger(payload?.off_topic_remaining);
  latestScopePayload = hasNotice ? payload : null;
  renderScopeNotice();
}

function enterChatMode() {
  document.body.classList.add("chat-mode");
  focusComposer();
}

function scrollConversation() {
  if (document.body.classList.contains("chat-mode")) {
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "auto" });
    });
    return;
  }
  conversation.scrollTop = conversation.scrollHeight;
}

async function loadBrowserConfig() {
  try {
    const response = await fetch("/v1/config", { headers: { Accept: "application/json" } });
    if (!response.ok) return;
    const config = await response.json();
    const explorerUrl = String(config?.cerevi_explorer_base_url || "").trim();
    if (explorerUrl) cereviExplorerBaseUrl = explorerUrl.replace(/\/+$/, "");
  } catch {
    // The static UI remains usable if config fetch fails; only the external
    // Cerevi inspection link falls back to the local-lab default above.
  }
}

function cereviViewerUrl(specimenId) {
  const id = String(specimenId || "").trim();
  if (!id) return cereviExplorerBaseUrl;
  return `${cereviExplorerBaseUrl}/viewer/${encodeURIComponent(id)}`;
}

function createMessage(role, text) {
  enterChatMode();
  const wrapper = document.createElement("article");
  wrapper.className = `message ${role}`;
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  if (role === "assistant") {
    renderAssistantText(bubble, text);
  } else {
    bubble.textContent = text;
  }
  wrapper.append(bubble);
  conversation.append(wrapper);
  scrollConversation();
  return { wrapper, bubble };
}

function renderAssistantText(container, text) {

  function appendBreakableToken(container, token) {
    const parts = token.split(/([._-])/);
    for (const part of parts) {
      container.append(document.createTextNode(part));
      if ([".", "_", "-"].includes(part)) container.append(document.createElement("wbr"));
    }
  }

  function formatSkillInputs(detail) {
    const cleaned = detail.trim().replace(/[.。]$/, "");
    const inputs = cleaned.replace(/^requires\s+/i, "").replace(/^需要\s*/u, "");
    const normalized = inputs === "no required inputs" || inputs === "无必填输入" ? t("skills.noRequiredInputs") : inputs;
    return `${t("skills.inputs")}: ${normalized}`;
  }

  const lines = text.split("\n");
  let quote = null;
  let paragraph = [];
  let list = null;

  function flushParagraph() {
    if (paragraph.length === 0) return;
    const p = document.createElement("p");
    p.textContent = paragraph.join("\n");
    container.append(p);
    paragraph = [];
  }

  function flushQuote() {
    if (!quote) return;
    container.append(quote);
    quote = null;
  }

  function flushList() {
    if (!list) return;
    container.append(list);
    list = null;
  }

  for (const line of lines) {
    if (line.startsWith("> ")) {
      flushParagraph();
      flushList();
      quote ||= document.createElement("blockquote");
      const p = document.createElement("p");
      p.textContent = line.slice(2);
      quote.append(p);
      continue;
    }
    flushQuote();
    if (line.startsWith("- ")) {
      flushParagraph();
      if (!list) {
        list = document.createElement("ul");
        list.className = "agent-result-list";
      }
      const li = document.createElement("li");
      const item = line.slice(2);
      const skillMatch = item.match(/^([a-z0-9_.-]+)\s+(.+)$/i);
      if (skillMatch) {
        const name = document.createElement("strong");
        appendBreakableToken(name, skillMatch[1]);
        const detailMatch = skillMatch[2].match(/^\(([^)]+)\):\s*(.+)$/);
        if (detailMatch) {
          const kind = document.createElement("span");
          kind.className = "skill-kind";
          kind.textContent = detailMatch[1];
          const inputs = document.createElement("span");
          inputs.className = "skill-inputs";
          inputs.textContent = formatSkillInputs(detailMatch[2]);
          li.append(name, kind, inputs);
        } else {
          const detail = document.createElement("span");
          detail.textContent = skillMatch[2];
          li.append(name, detail);
        }
      } else {
        li.textContent = item;
      }
      list.append(li);
      continue;
    }
    flushList();
    if (line.trim() === "") {
      flushParagraph();
      continue;
    }
    paragraph.push(line);
  }

  flushQuote();
  flushList();
  flushParagraph();
}

function createStreamingMessage() {
  enterChatMode();
  const wrapper = document.createElement("article");
  wrapper.className = "message assistant";
  const bubble = document.createElement("div");
  bubble.className = "bubble is-streaming";
  wrapper.append(bubble);
  conversation.append(wrapper);
  scrollConversation();
  return { wrapper, bubble, startedAt: performance.now(), thoughtPanel: null, thoughtBody: null, thoughtLabel: null };
}

function thoughtElapsedText(message) {
  const seconds = Math.max(1, Math.round((performance.now() - message.startedAt) / 1000));
  return thoughtTextForSeconds(seconds);
}

function updateThoughtLabel(message) {
  if (!message.thoughtLabel) return;
  message.thoughtLabel.dataset.startedAt = String(message.startedAt);
  message.thoughtLabel.textContent = thoughtElapsedText(message);
}

function ensureThoughtPanel(message) {
  if (message.thoughtBody) return message.thoughtBody;

  const panel = document.createElement("details");
  panel.className = "thought-panel";
  panel.open = true;

  const summary = document.createElement("summary");
  summary.className = "thought-summary";

  const mark = document.createElement("span");
  mark.className = "thought-mark";
  mark.textContent = "AI";
  mark.setAttribute("aria-hidden", "true");

  const label = document.createElement("span");
  label.className = "thought-label";
  label.dataset.startedAt = String(message.startedAt);
  summary.append(mark, label);

  const body = document.createElement("div");
  body.className = "thought-body";

  panel.append(summary, body);
  message.bubble.append(panel);
  message.thoughtPanel = panel;
  message.thoughtBody = body;
  message.thoughtLabel = label;
  updateThoughtLabel(message);
  return body;
}

function statusIcon(kind) {
  if (kind === "found") return "F";
  if (kind === "read") return "R";
  if (kind === "error") return "!";
  return "AI";
}

function inferStatusKind(title) {
  const normalized = title.toLowerCase();
  if (normalized.startsWith("found") || normalized.startsWith("找到")) return "found";
  if (normalized.startsWith("read") || normalized.startsWith("读取") || normalized.includes("fetch")) return "read";
  if (normalized.includes("error") || normalized.includes("failed") || normalized.includes("错误") || normalized.includes("失败")) return "error";
  return "thought";
}

function normalizeStatusEvent(payload) {
  const title = String(payload?.title || payload?.message || t("agentEvent"));
  const kind = String(payload?.kind || inferStatusKind(title));
  return {
    kind,
    title,
    content: payload?.content ?? "",
  };
}

function appendEventContent(container, content) {
  if (Array.isArray(content)) {
    if (content.length === 0) return;
    const list = document.createElement("ul");
    for (const item of content) {
      const li = document.createElement("li");
      li.textContent = String(item);
      list.append(li);
    }
    container.append(list);
    return;
  }

  const text = String(content || "").trim();
  if (!text) return;
  for (const line of text.split("\n")) {
    const p = document.createElement("p");
    p.textContent = line;
    container.append(p);
  }
}

function appendStatusEvent(message, payload) {
  const event = normalizeStatusEvent(payload);
  const thoughtBody = ensureThoughtPanel(message);
  const section = document.createElement("section");
  section.className = `agent-event is-${event.kind}`;

  const heading = document.createElement("div");
  heading.className = "agent-event-heading";

  const icon = document.createElement("span");
  icon.className = "agent-event-icon";
  icon.textContent = statusIcon(event.kind);
  icon.setAttribute("aria-hidden", "true");

  const title = document.createElement("strong");
  title.textContent = event.title;
  heading.append(icon, title);
  section.append(heading);

  const body = document.createElement("div");
  body.className = "agent-event-body";
  appendEventContent(body, event.content);
  if (body.childElementCount > 0) section.append(body);

  thoughtBody.append(section);
  thoughtBody.scrollTop = thoughtBody.scrollHeight;
  updateThoughtLabel(message);
  scrollConversation();
  focusComposer();
}

function appendFinalText(message, text) {
  message.bubble.classList.remove("is-streaming");
  updateThoughtLabel(message);
  if (message.thoughtPanel) message.thoughtPanel.open = false;
  const final = document.createElement("div");
  final.className = "agent-final";
  renderAssistantText(final, text || t("noResponse"));
  message.bubble.append(final);
  scrollConversation();
  window.requestAnimationFrame(scrollConversation);
  focusComposer();
}

function appendErrorText(message, text) {
  message.bubble.classList.remove("is-streaming");
  updateThoughtLabel(message);
  appendStatusEvent(message, {
    kind: "error",
    title: t("requestFailed"),
    content: text || t("noAgentResponse"),
  });
  scrollConversation();
  focusComposer();
}

function requiredInputs(skill) {
  const required = skill?.interface?.input_schema?.required;
  return Array.isArray(required) && required.length ? required.join(", ") : t("skills.noRequiredInputs");
}

function renderSkills(container, skills) {
  if (!Array.isArray(skills) || skills.length === 0) return;
  const list = document.createElement("div");
  list.className = "skill-list";
  for (const skill of skills) {
    const row = document.createElement("section");
    row.className = "skill-row";
    const title = document.createElement("strong");
    title.textContent = skill.id;
    const meta = document.createElement("span");
    meta.textContent = `${skill.type} v${skill.version} / ${t("skills.metaRequires", { inputs: requiredInputs(skill) })}`;
    row.append(title, meta);
    list.append(row);
  }
  container.append(list);
  scrollConversation();
  focusComposer();
}

function renderCandidates(container, candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    const empty = document.createElement("p");
    empty.className = "candidate-empty";
    empty.textContent = t("visualize.noCandidates");
    container.append(empty);
    return;
  }
  const wrap = document.createElement("div");
  wrap.className = "candidate-list";
  for (const cand of candidates) {
    const card = document.createElement("section");
    card.className = "candidate-card";

    const title = document.createElement("strong");
    title.className = "candidate-name";
    title.textContent = cand.name || cand.id;
    card.append(title);

    if (cand.species) {
      const species = document.createElement("span");
      species.className = "candidate-meta";
      species.textContent = `${t("visualize.species")}: ${cand.species}`;
      card.append(species);
    }

    if (cand.description) {
      const desc = document.createElement("p");
      desc.className = "candidate-desc";
      desc.textContent = cand.description;
      card.append(desc);
    }

    if (Array.isArray(cand.image_variants) && cand.image_variants.length) {
      const variants = document.createElement("span");
      variants.className = "candidate-meta";
      variants.textContent = `${t("visualize.variants")}: ${cand.image_variants.join(", ")}`;
      card.append(variants);
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "candidate-view";
    button.textContent = t("visualize.view");
    button.addEventListener("click", () => {
      const variant = Array.isArray(cand.image_variants) && cand.image_variants[0]
        ? cand.image_variants[0]
        : undefined;
      sendMessage(`Preview ${cand.name || cand.id}`, {
        selected_specimen_id: cand.id,
        ...(variant ? { variant } : {}),
      });
    });
    card.append(button);

    wrap.append(card);
  }
  container.append(wrap);
  scrollConversation();
}

function renderVisualization(container, viz) {
  if (!viz || typeof viz !== "object") return;
  const host = document.createElement("div");
  host.className = "visualization-host";
  const loading = document.createElement("div");
  loading.className = "galavi-fallback";
  loading.textContent = t("visualize.loading");
  host.append(loading);
  container.append(host);
  scrollConversation();

  // Manual cache-bust until the static UI grows a build step with hashed assets.
  import("/assets/galavi-embed.js?v=56")
    .then((mod) => mod.mountGalaviEmbed(host, viz))
    .catch((err) => {
      host.innerHTML = "";
      const note = document.createElement("div");
      note.className = "galavi-fallback";
      note.textContent = `Failed to load viewer: ${err?.message || err}`;
      host.append(note);
    });
}

function renderViewSuggestions(container, suggestions, viz) {
  if (!Array.isArray(suggestions) || !suggestions.length || !viz?.specimen_id) return;

  const wrap = document.createElement("div");
  wrap.className = "view-suggestions";

  const intro = document.createElement("p");
  intro.className = "view-suggestions-intro";
  intro.textContent = t("visualize.suggestionsIntro");
  wrap.append(intro);

  const list = document.createElement("div");
  list.className = "view-suggestion-list";

  for (const suggestion of suggestions) {
    if (!suggestion || typeof suggestion !== "object" || !suggestion.view_type) continue;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "view-suggestion";

    const label = document.createElement("strong");
    label.textContent = suggestion.label || suggestion.view_type;
    button.append(label);

    if (suggestion.description) {
      const desc = document.createElement("span");
      desc.textContent = suggestion.description;
      button.append(desc);
    }

    button.addEventListener("click", () => {
      sendMessage(suggestion.prompt || `Preview ${suggestion.label || suggestion.view_type}`, {
        selected_specimen_id: viz.specimen_id,
        ...(viz.variant ? { variant: viz.variant } : {}),
        view_type: suggestion.view_type,
      });
    });
    list.append(button);
  }

  if (!list.childElementCount) return;
  wrap.append(list);
  container.append(wrap);
  scrollConversation();
}

function renderCereviLink(container, viz) {
  if (!viz?.specimen_id) return;
  const row = document.createElement("p");
  row.className = "cerevi-link-row";
  row.append(document.createTextNode(`${t("visualize.cereviPrefix")} `));
  const link = document.createElement("a");
  link.href = cereviViewerUrl(viz.specimen_id);
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = t("visualize.cereviLabel");
  row.append(link);
  container.append(row);
}

function renderFinalExtras(message, payload) {
  if (!payload) return;
  if (Array.isArray(payload.skills) && payload.skills.length) {
    renderSkills(message.bubble, payload.skills);
  }
  if (Array.isArray(payload.candidates)) {
    const wrap = document.createElement("div");
    wrap.className = "candidates-wrap";
    if (payload.candidates.length) {
      const intro = document.createElement("p");
      intro.className = "candidate-intro";
      intro.textContent = t("visualize.candidatesIntro");
      wrap.append(intro);
    }
    renderCandidates(wrap, payload.candidates);
    message.bubble.append(wrap);
  }
  if (payload.visualization) {
    renderCereviLink(message.bubble, payload.visualization);
  }
  if (Array.isArray(payload.view_suggestions)) {
    renderViewSuggestions(message.bubble, payload.view_suggestions, payload.visualization);
  }
  if (payload.visualization) {
    renderVisualization(message.bubble, payload.visualization);
  }
}

function parseSseBlock(block) {
  let event = "message";
  const data = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      data.push(line.slice(5).trimStart());
    }
  }
  if (data.length === 0) return null;
  try {
    return { event, payload: JSON.parse(data.join("\n")) };
  } catch {
    return { event, payload: { message: data.join("\n") } };
  }
}

async function readAgentStream(response, onEvent) {
  if (!response.body) throw new Error(t("streamingUnsupported"));
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    buffer = buffer.replace(/\r/g, "");

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const block = buffer.slice(0, boundary).trim();
      buffer = buffer.slice(boundary + 2);
      const parsed = parseSseBlock(block);
      if (parsed) onEvent(parsed.event, parsed.payload);
      boundary = buffer.indexOf("\n\n");
    }
  }

  buffer += decoder.decode();
  const finalBlock = buffer.replace(/\r/g, "").trim();
  if (finalBlock) {
    const parsed = parseSseBlock(finalBlock);
    if (parsed) onEvent(parsed.event, parsed.payload);
  }
}

async function sendMessage(text, extraContext) {
  const prompt = text.trim();
  if (!prompt) return;

  const detectedLanguage = detectInputLanguage(prompt);
  if (detectedLanguage && detectedLanguage !== uiLanguage) {
    setUiLanguage(detectedLanguage);
  }

  createMessage("user", prompt);
  input.value = "";
  focusComposer();
  setStatus("connecting", "loading");
  const streamMessage = createStreamingMessage();
  let completed = false;

  const context = {
    session_id: getSessionId(),
    ui_language: uiLanguage,
    ...(extraContext && typeof extraContext === "object" ? extraContext : {}),
  };

  try {
    const response = await fetch("/v1/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: prompt, context }),
    });
    if (!response.ok) throw new Error(await response.text());

    await readAgentStream(response, (event, payload) => {
      if (event === "status") {
        appendStatusEvent(streamMessage, payload);
        setStatus("thinking", "loading");
        return;
      }
      if (event === "final") {
        completed = true;
        if (String(payload.reply || "").trim()) appendFinalText(streamMessage, payload.reply);
        renderFinalExtras(streamMessage, payload);
        setScopeNotice(payload);
        setStatus(String(payload.source || "").includes("deepseek") ? "deepseek" : "ready");
        return;
      }
      if (event === "error") {
        completed = true;
        appendErrorText(streamMessage, payload.message);
        setStatus("error", "error");
      }
    });

    if (!completed) {
      appendErrorText(streamMessage, t("streamEnded"));
      setStatus("error", "error");
    }
  } catch (error) {
    appendErrorText(streamMessage, error.message);
    setStatus("error", "error");
  } finally {
    focusComposer();
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  sendMessage(input.value);
});

input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

for (const button of promptButtons) {
  button.addEventListener("click", () => sendMessage(button.dataset.prompt || ""));
}

languageToggle?.addEventListener("click", () => setUiLanguage(uiLanguage === "en" ? "zh" : "en"));

input.addEventListener("blur", () => {
  if (!document.body.classList.contains("chat-mode")) return;
  // Don't steal focus while the user is selecting text in the conversation.
  const selection = window.getSelection();
  if (selection && !selection.isCollapsed) return;
  window.setTimeout(() => {
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return;
    focusComposer();
  }, 0);
});

applyLanguage();
loadBrowserConfig();
focusComposer();
