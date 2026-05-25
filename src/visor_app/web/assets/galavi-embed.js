/**
 * Galavi canvas embed for chat bubbles.
 *
 * Loads `galavi` + `@galavi/ome-zarr-adapter` from esm.sh so this app can
 * embed the same dataset viewer behavior without a frontend build step.
 */

const GALAVI_URL = "https://esm.sh/galavi@2026.4.30";
const OME_ZARR_ADAPTER_URL = "https://esm.sh/@galavi/ome-zarr-adapter@2026.4.30";
const ZARRITA_URL = "https://esm.sh/zarrita";

const VIEW_DEFS = {
  volume: { mode: "3d", label: "3D" },
  xy: { mode: "xy", label: "Coronal", axes: ["x", "y"], axisMap: [0, 1, 2] },
  xz: { mode: "xz", label: "Horizontal", axes: ["x", "z"], axisMap: [0, 2, 1] },
  yz: { mode: "yz", label: "Sagittal", axes: ["y", "z"], axisMap: [1, 2, 0] },
};

let modulesPromise = null;

function loadModules() {
  if (!modulesPromise) {
    modulesPromise = Promise.all([
      import(GALAVI_URL),
      import(OME_ZARR_ADAPTER_URL),
      import(ZARRITA_URL),
    ]).then(([galavi, adapter, zarr]) => ({ galavi, adapter, zarr }));
  }
  return modulesPromise;
}

function hasWebGPU() {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

function normalizeViewType(value) {
  return Object.prototype.hasOwnProperty.call(VIEW_DEFS, value) ? value : "volume";
}

function createCanvas() {
  const canvas = document.createElement("canvas");
  canvas.className = "galavi-canvas";
  canvas.width = 720;
  canvas.height = 420;
  return canvas;
}

function fallbackMessage(container, text) {
  const note = document.createElement("div");
  note.className = "galavi-fallback";
  note.textContent = text;
  container.appendChild(note);
}

function resolveDatasetUrl(url) {
  if (!url) return "";
  try {
    return new URL(url).href;
  } catch {
    if (typeof window === "undefined") {
      return url;
    }
    return new URL(url, window.location.href).href;
  }
}

async function fetchOmeMetadata(url) {
  try {
    const response = await fetch(`${url.replace(/\/$/, "")}/zarr.json`);
    if (!response.ok) return {};
    const payload = await response.json();
    return payload?.attributes?.ome || {};
  } catch {
    return {};
  }
}

function clampNumber(value, minValue, maxValue) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return minValue;
  return Math.max(minValue, Math.min(maxValue, numberValue));
}

function formatControlNumber(value) {
  if (!Number.isFinite(value)) return "0";
  if (Math.abs(value) >= 10) return value.toFixed(1);
  return value.toFixed(3);
}

function channelOptions(info, metadata = {}) {
  const omeroChannels = Array.isArray(metadata?.omero?.channels) ? metadata.omero.channels : [];
  if (omeroChannels.length) {
    return omeroChannels.map((channel, index) => ({
      index,
      label: channel?.label || `Channel ${index}`,
    }));
  }

  const labels = Array.isArray(info.channelLabels) ? info.channelLabels : [];
  const channelDim = info.selectionDims?.find((dim) => dim?.name === "c");
  const defaultIndex = Number.isInteger(info.defaultSelection?.c) ? info.defaultSelection.c : 0;
  const count = Math.max(1, labels.length, Number(channelDim?.size) || 0, defaultIndex + 1);
  return Array.from({ length: count }, (_, index) => ({
    index,
    label: labels[index] || `Channel ${index}`,
  }));
}

function channelCount(info, metadata = {}) {
  return channelOptions(info, metadata).length;
}

function normalizedRange(range, fallback = [0, 1]) {
  if (!Array.isArray(range) || range.length < 2) return fallback;
  const lowValue = Number(range[0]);
  const highValue = Number(range[1]);
  if (!Number.isFinite(lowValue) || !Number.isFinite(highValue)) return fallback;
  return [Math.max(0, lowValue), Math.max(lowValue + 0.00001, highValue)];
}

function contrastBounds(info) {
  const autoRange = normalizedRange(info.autoContrast);
  const highValue = Math.min(1, Math.max(autoRange[1] * 4, autoRange[1] + 0.001));
  return [0, Math.max(highValue, 0.001)];
}

function createControlSection(title, modifier = "") {
  const section = document.createElement("section");
  section.className = "galavi-control";
  if (modifier) section.classList.add(`galavi-control-${modifier}`);
  const heading = document.createElement("h3");
  heading.textContent = title;
  section.append(heading);
  return section;
}

function createDoubleThumbSlider({ bounds, initialMin, initialMax, step, onChange }) {
  const root = document.createElement("div");
  root.className = "galavi-dual-range";

  const slider = document.createElement("div");
  slider.className = "galavi-dual-range-slider";
  const track = document.createElement("div");
  track.className = "galavi-dual-range-track";
  const fill = document.createElement("div");
  fill.className = "galavi-dual-range-fill";
  const minThumb = document.createElement("button");
  minThumb.type = "button";
  minThumb.className = "galavi-range-thumb is-min";
  minThumb.setAttribute("aria-label", "Contrast minimum");
  const maxThumb = document.createElement("button");
  maxThumb.type = "button";
  maxThumb.className = "galavi-range-thumb is-max";
  maxThumb.setAttribute("aria-label", "Contrast maximum");
  slider.append(track, fill, minThumb, maxThumb);

  const value = document.createElement("span");
  value.className = "galavi-control-value";
  root.append(slider, value);

  let minValue = clampNumber(initialMin, bounds[0], bounds[1]);
  let maxValue = clampNumber(initialMax, minValue + step, bounds[1]);
  let activeThumb = null;
  let activePointerId = null;

  const contrastSpan = () => Math.max(bounds[1] - bounds[0], step);

  const snap = (rawValue) => {
    const clamped = clampNumber(rawValue, bounds[0], bounds[1]);
    const snapped = bounds[0] + Math.round((clamped - bounds[0]) / step) * step;
    return clampNumber(snapped, bounds[0], bounds[1]);
  };
  const toRatio = (rawValue) => {
    const valueClamped = clampNumber(rawValue, bounds[0], bounds[1]);
    return clampNumber((valueClamped - bounds[0]) / contrastSpan(), 0, 1);
  };
  const fromPointer = (event) => {
    const rect = slider.getBoundingClientRect();
    if (rect.width <= 0) return minValue;
    const ratio = clampNumber((event.clientX - rect.left) / rect.width, 0, 1);
    return bounds[0] + ratio * contrastSpan();
  };
  const update = () => {
    minValue = clampNumber(minValue, bounds[0], maxValue - step);
    maxValue = clampNumber(maxValue, minValue + step, bounds[1]);
    root.style.setProperty("--start-ratio", String(toRatio(minValue)));
    root.style.setProperty("--end-ratio", String(toRatio(maxValue)));
    minThumb.style.zIndex = activeThumb === "max" ? "2" : "3";
    maxThumb.style.zIndex = activeThumb === "min" ? "2" : "3";
    value.textContent = `${formatControlNumber(minValue)} – ${formatControlNumber(maxValue)}`;
    onChange([minValue, maxValue]);
  };
  const setThumb = (which, rawValue) => {
    if (which === "min") {
      minValue = Math.min(snap(rawValue), maxValue - step);
    } else {
      maxValue = Math.max(snap(rawValue), minValue + step);
    }
    update();
  };
  const endDrag = (event) => {
    if (activeThumb === null) return;
    activeThumb = null;
    if (activePointerId !== null) {
      try { slider.releasePointerCapture(activePointerId); } catch { /* ignore */ }
      activePointerId = null;
    }
  };
  slider.addEventListener("pointerdown", (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    event.preventDefault();
    const nextValue = fromPointer(event);
    const which = Math.abs(nextValue - minValue) <= Math.abs(nextValue - maxValue) ? "min" : "max";
    activeThumb = which;
    activePointerId = event.pointerId;
    try { slider.setPointerCapture(event.pointerId); } catch { /* ignore */ }
    setThumb(which, nextValue);
  });
  slider.addEventListener("pointermove", (event) => {
    if (activeThumb === null || event.pointerId !== activePointerId) return;
    setThumb(activeThumb, fromPointer(event));
  });
  slider.addEventListener("pointerup", endDrag);
  slider.addEventListener("pointercancel", endDrag);
  slider.addEventListener("lostpointercapture", endDrag);

  update();
  return root;
}

function createSingleThumbSlider({ min, max, initialValue, step, ariaLabel, onChange }) {
  const root = document.createElement("div");
  root.className = "galavi-single-range";

  const slider = document.createElement("div");
  slider.className = "galavi-single-range-slider";
  slider.tabIndex = 0;
  slider.setAttribute("role", "slider");
  slider.setAttribute("aria-label", ariaLabel);
  slider.setAttribute("aria-valuemin", String(min));
  slider.setAttribute("aria-valuemax", String(max));

  const track = document.createElement("div");
  track.className = "galavi-single-range-track";
  const fill = document.createElement("div");
  fill.className = "galavi-single-range-fill";
  const thumb = document.createElement("button");
  thumb.type = "button";
  thumb.className = "galavi-range-thumb is-single";
  thumb.tabIndex = -1;
  thumb.setAttribute("aria-hidden", "true");
  slider.append(track, fill, thumb);
  root.append(slider);

  let value = clampNumber(initialValue, min, max);
  let activePointerId = null;

  const span = () => Math.max(max - min, step);
  const snap = (rawValue) => {
    const clamped = clampNumber(rawValue, min, max);
    const snapped = min + Math.round((clamped - min) / step) * step;
    return clampNumber(snapped, min, max);
  };
  const toRatio = (rawValue) => {
    const valueClamped = clampNumber(rawValue, min, max);
    return clampNumber((valueClamped - min) / span(), 0, 1);
  };
  const fromPointer = (event) => {
    const rect = slider.getBoundingClientRect();
    if (rect.width <= 0) return value;
    const ratio = clampNumber((event.clientX - rect.left) / rect.width, 0, 1);
    return min + ratio * span();
  };
  const update = () => {
    value = snap(value);
    root.style.setProperty("--value-ratio", String(toRatio(value)));
    slider.setAttribute("aria-valuenow", String(value));
    onChange(value);
  };
  const endDrag = () => {
    if (activePointerId === null) return;
    try { slider.releasePointerCapture(activePointerId); } catch { /* ignore */ }
    activePointerId = null;
  };

  slider.addEventListener("pointerdown", (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    event.preventDefault();
    activePointerId = event.pointerId;
    try { slider.setPointerCapture(event.pointerId); } catch { /* ignore */ }
    value = fromPointer(event);
    update();
    slider.focus({ preventScroll: true });
  });
  slider.addEventListener("pointermove", (event) => {
    if (activePointerId === null || event.pointerId !== activePointerId) return;
    value = fromPointer(event);
    update();
  });
  slider.addEventListener("pointerup", endDrag);
  slider.addEventListener("pointercancel", endDrag);
  slider.addEventListener("lostpointercapture", endDrag);
  slider.addEventListener("keydown", (event) => {
    const jump = event.shiftKey ? step * 10 : step;
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      value -= jump;
      update();
      return;
    }
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      value += jump;
      update();
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      value = min;
      update();
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      value = max;
      update();
    }
  });

  update();
  return root;
}

function keepInspectorInteractionsLocal(inspector) {
  const stop = (event) => event.stopPropagation();
  for (const eventName of ["pointerdown", "pointerup", "mousedown", "mouseup", "click", "dblclick", "touchstart", "touchend"]) {
    inspector.addEventListener(eventName, stop);
  }
}

function createChannelPicker(channels, initialChannel, onChannelChange) {
  const picker = document.createElement("div");
  picker.className = "galavi-channel-picker";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "galavi-channel-button";
  button.setAttribute("aria-haspopup", "listbox");
  button.setAttribute("aria-expanded", "false");
  const menu = document.createElement("div");
  menu.className = "galavi-channel-menu";
  menu.setAttribute("role", "listbox");
  menu.hidden = true;

  let currentChannel = initialChannel;
  const setOpen = (open) => {
    menu.hidden = !open;
    button.setAttribute("aria-expanded", open ? "true" : "false");
  };
  const setCurrent = (channelIndex, notify = true) => {
    currentChannel = channelIndex;
    const selected = channels.find((item) => item.index === currentChannel) || channels[0];
    button.textContent = selected?.label || `Channel ${currentChannel}`;
    for (const option of menu.querySelectorAll("button")) {
      option.classList.toggle("is-selected", Number(option.dataset.channel) === currentChannel);
    }
    if (notify) onChannelChange(currentChannel);
  };

  for (const channel of channels) {
    const option = document.createElement("button");
    option.type = "button";
    option.dataset.channel = String(channel.index);
    option.textContent = channel.label;
    option.setAttribute("role", "option");
    option.addEventListener("click", () => {
      setCurrent(channel.index);
      setOpen(false);
    });
    menu.append(option);
  }

  button.addEventListener("click", () => setOpen(menu.hidden));
  button.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setOpen(false);
  });
  setCurrent(currentChannel, false);
  picker.append(button, menu);
  return picker;
}

function createInspector({ galavi, layerId, info, metadata, channel, onChannelChange, onContrastChange, sliceControl }) {
  const inspector = document.createElement("aside");
  inspector.className = "galavi-inspector";
  keepInspectorInteractionsLocal(inspector);

  const title = document.createElement("div");
  title.className = "galavi-inspector-title";
  title.textContent = "Inspector";
  inspector.append(title);

  const channels = channelOptions(info, metadata);
  const channelSection = createControlSection("Channel", "channel");
  channelSection.append(createChannelPicker(channels, channel, onChannelChange));
  inspector.append(channelSection);

  const bounds = contrastBounds(info);
  const contrastRange = normalizedRange(info.autoContrast, [bounds[0], bounds[1]]);
  const contrastStep = Math.max(0.00001, bounds[1] / 1000);
  let contrastMin = clampNumber(contrastRange[0], bounds[0], bounds[1]);
  let contrastMax = clampNumber(contrastRange[1], bounds[0], bounds[1]);

  const contrastSection = createControlSection("Contrast", "contrast");
  contrastSection.append(
    createDoubleThumbSlider({
      bounds,
      initialMin: contrastMin,
      initialMax: contrastMax,
      step: contrastStep,
      onChange: onContrastChange,
    }),
  );
  inspector.append(contrastSection);

  if (sliceControl) {
    const sliceSection = createControlSection("Slice", "slice");
    const sliceValue = document.createElement("span");
    sliceValue.className = "galavi-control-value";
    const sliceSlider = createSingleThumbSlider({
      min: 0,
      max: sliceControl.max,
      initialValue: sliceControl.value,
      step: 1,
      ariaLabel: `${sliceControl.label} slice`,
      onChange: (nextValue) => {
        sliceControl.value = Math.round(clampNumber(nextValue, 0, sliceControl.max));
      sliceValue.textContent = `${sliceControl.value} / ${sliceControl.max}`;
      galavi.layer(layerId)?.setOptions({ sliceIndex: sliceControl.value });
      syncSliceTarget(galavi, sliceControl);
      },
    });
    sliceSection.append(sliceSlider, sliceValue);
    inspector.append(sliceSection);
  }

  return inspector;
}

function syncSliceTarget(galavi, sliceControl) {
  try {
    const scale = sliceControl.info.transform?.scale?.[sliceControl.axisMap[2]];
    if (!Number.isFinite(scale) || typeof galavi.setTarget !== "function") return;
    const state = galavi.getState?.();
    const target = state?.exploration?.camera?.target;
    if (!Array.isArray(target)) return;
    const nextTarget = [...target];
    nextTarget[sliceControl.axisMap[2]] = (sliceControl.value + 0.5) * scale;
    galavi.setTarget(nextTarget);
  } catch {
    // Slice target sync is a convenience; controls still work without it.
  }
}

function baseState(adapter, info) {
  const physical = adapter.getPhysicalSpace(info);
  const volume = adapter.getVolumeTransform(info);
  const distance = volume.maxExtent * 1.5;
  return {
    exploration: {
      camera: {
        navMode: "orbit",
        projMode: "perspective",
        position: [
          volume.center[0] + distance * Math.cos(-0.4) * Math.sin(0.5),
          volume.center[1] + distance * Math.sin(-0.4),
          volume.center[2] + distance * Math.cos(-0.4) * Math.cos(0.5),
        ],
        target: volume.center,
      },
      lod: { mode: "auto", level: 0 },
    },
    physical,
  };
}

function volumeConfig(adapter, info, metadata, channel) {
  return {
    layerId: "volume",
    viewId: "volume",
    info,
    metadata,
    state: {
      ...baseState(adapter, info),
      layers: [
        {
          id: "volume",
          type: "volume",
          data: { fetch: info.fetchTile },
          options: {
            dataSize: info.dataSize,
            levelScales: info.levelScales,
            levelRange: info.levelRange,
            tileSize: info.tileSize,
            selection: { ...info.defaultSelection, c: channel },
          },
          render: {
            visible: true,
            colormap: "gray",
            contrastLimits: info.autoContrast,
            blending: "additive",
          },
        },
      ],
    },
    view: {
      type: "volume",
      layers: ["volume"],
      controls: { orbit: {}, fly: {}, resolution: {} },
      overlays: { scalebar: { visibleWhenActive: true, position: "top-right" } },
      activatable: true,
    },
  };
}

function sliceConfig(adapter, sliceSource, viewDef, channel) {
  const info = sliceSource.info;
  const sliceAxis = viewDef.axisMap[2];
  const initialSlice = Math.floor(info.dataSize[sliceAxis] / 2);
  const tileWidth = sliceSource.tileSize[viewDef.axisMap[0]];
  const tileHeight = sliceSource.tileSize[viewDef.axisMap[1]];
  return {
    layerId: "slice",
    viewId: "section",
    info,
    metadata: sliceSource.metadata,
    sliceControl: {
      label: viewDef.label,
      value: initialSlice,
      max: Math.max(0, info.dataSize[sliceAxis] - 1),
      axisMap: viewDef.axisMap,
      info,
    },
    state: {
      ...baseState(adapter, info),
      layers: [
        {
          id: "slice",
          type: "slice",
          data: { fetch: sliceSource.fetch },
          options: {
            axes: viewDef.axes,
            dataSize: info.dataSize,
            levelRange: info.levelRange,
            tileSize: [tileWidth, tileHeight],
            sliceIndex: initialSlice,
            selection: { ...info.defaultSelection, c: channel },
          },
          render: {
            visible: true,
            colormap: "gray",
            contrastLimits: info.autoContrast,
            blending: "additive",
          },
        },
      ],
    },
    view: {
      type: "slice",
      layers: ["slice"],
      controls: { panzoom: {}, resolution: {} },
      overlays: { scalebar: { visibleWhenActive: true, position: "top-right" } },
      activatable: true,
    },
  };
}

function setInitialLod(galavi, info) {
  if (Array.isArray(info.levelRange)) {
    galavi.setLodLevel?.(info.levelRange[1]);
  }
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => galavi?.setLodMode?.("auto"));
  }
}

/**
 * @param {HTMLElement} container
 * @param {{ zarr_url: string, specimen_name?: string, specimen_id?: string, view_type?: string, channel?: number|null }} viz
 * @returns {Promise<{ destroy: () => void } | null>}
 */
export async function mountGalaviEmbed(container, viz) {
  container.innerHTML = "";
  container.classList.add("galavi-embed");
  const viewType = normalizeViewType(viz?.view_type);
  const viewDef = VIEW_DEFS[viewType];
  const datasetUrl = resolveDatasetUrl(viz?.zarr_url);

  if (!viz || !datasetUrl) {
    fallbackMessage(container, "No visualization payload to render.");
    return null;
  }

  if (!hasWebGPU()) {
    fallbackMessage(container, "This browser does not support WebGPU; the dataset URL is " + datasetUrl);
    return null;
  }

  const header = document.createElement("div");
  header.className = "galavi-header";
  const headerTitle = document.createElement("span");
  headerTitle.textContent = `${viz.specimen_name || viz.specimen_id || "Dataset"} · ${viewDef.label}`;
  const previewBadge = document.createElement("span");
  previewBadge.className = "galavi-preview-badge";
  previewBadge.textContent = "Preview";
  header.append(headerTitle, previewBadge);
  container.appendChild(header);

  const body = document.createElement("div");
  body.className = "galavi-body";
  const canvasShell = document.createElement("div");
  canvasShell.className = "galavi-canvas-shell";
  const canvas = createCanvas();
  canvasShell.append(canvas);
  body.append(canvasShell);
  container.append(body);

  let modules;
  try {
    modules = await loadModules();
  } catch (err) {
    fallbackMessage(container, `Failed to load galavi modules: ${err?.message || err}`);
    return null;
  }

  const { createGalavi } = modules.galavi;
  const adapter = modules.adapter;
  let config;
  try {
    if (viewType === "volume") {
      const [metadata, info] = await Promise.all([
        fetchOmeMetadata(datasetUrl),
        adapter.openOMEZarr(datasetUrl),
      ]);
      const selectedChannel = Math.min(
        channelCount(info, metadata) - 1,
        Number.isInteger(viz.channel) ? viz.channel : info.defaultSelection?.c ?? 0,
      );
      config = volumeConfig(adapter, info, metadata, selectedChannel);
    } else {
      const sliceSource = await openSlice(modules, datasetUrl, viewDef.axisMap[2]);
      const info = sliceSource.info;
      const selectedChannel = Math.min(
        channelCount(info, sliceSource.metadata) - 1,
        Number.isInteger(viz.channel) ? viz.channel : info.defaultSelection?.c ?? 0,
      );
      config = sliceConfig(adapter, sliceSource, viewDef, selectedChannel);
    }
  } catch (err) {
    fallbackMessage(container, `Failed to read OME-Zarr: ${err?.message || err}`);
    return null;
  }

  let galavi;
  try {
    galavi = await createGalavi({
      state: config.state,
      views: { [config.viewId]: { ...config.view, canvas } },
    });
    galavi.setActiveView?.(config.viewId);
    setInitialLod(galavi, config.info);
  } catch (err) {
    fallbackMessage(container, `Failed to initialise galavi: ${err?.message || err}`);
    return null;
  }

  let currentChannel = Number(config.state.layers[0].options.selection.c ?? 0);
  body.append(
    createInspector({
      galavi,
      layerId: config.layerId,
      info: config.info,
      metadata: config.metadata,
      channel: currentChannel,
      sliceControl: config.sliceControl,
      onChannelChange: (nextChannel) => {
        currentChannel = nextChannel;
        config.state.layers[0].options.selection = {
          ...config.state.layers[0].options.selection,
          c: currentChannel,
        };
        galavi.layer(config.layerId)?.setOptions({ selection: config.state.layers[0].options.selection });
      },
      onContrastChange: (range) => {
        galavi.layer(config.layerId)?.setRender({ contrastLimits: range });
      },
    }),
  );

  return {
    destroy() {
      try {
        galavi?.destroy?.();
      } catch {
        // Best-effort teardown; ignore.
      }
    },
  };
}

async function openSlice(modules, url, sliceAxis) {
  const info = await modules.adapter.openOMEZarr(url);
  const zarr = modules.zarr;
  const store = new zarr.FetchStore(url);
  let root;
  try {
    root = await zarr.open.v3(store, { kind: "group" });
  } catch {
    root = await zarr.open.v2(store, { kind: "group" });
  }

  const ome = root.attrs?.ome;
  const metadata = ome || {};
  const multiscale = ome?.multiscales?.[0] || root.attrs?.multiscales?.[0];
  if (!multiscale) throw new Error(`openSlice: no multiscales in ${url}`);

  const axes = multiscale.axes || [];
  const arrays = [];
  for (const dataset of multiscale.datasets || []) {
    const location = root.resolve(dataset.path);
    try {
      arrays.push(await zarr.open.v3(location, { kind: "array" }));
    } catch {
      arrays.push(await zarr.open.v2(location, { kind: "array" }));
    }
  }
  if (!arrays.length) throw new Error(`openSlice: no arrays in ${url}`);

  const planeTile = 512;
  const tileSize = [info.tileSize[0], info.tileSize[1], info.tileSize[2]];
  tileSize[sliceAxis] = 1;
  for (let axisIndex = 0; axisIndex < 3; axisIndex += 1) {
    if (axisIndex !== sliceAxis) {
      tileSize[axisIndex] = Math.max(tileSize[axisIndex], planeTile);
    }
  }
  const totalVoxels = tileSize[0] * tileSize[1] * tileSize[2];
  const dtype = info.dtype;

  const fetch = async (request) => {
    const level = Math.max(0, Math.min(request.level ?? 0, arrays.length - 1));
    const position = request.position ?? [0, 0, 0];
    const selection = request.selection ?? info.defaultSelection;
    const levelInfo = info.levels[level];
    const array = arrays[level];
    const selectors = new Array(axes.length);
    let outOfBounds = false;
    let validWidth = 0;
    let validHeight = 0;

    for (let axisIndex = 0; axisIndex < axes.length; axisIndex += 1) {
      const axisName = axes[axisIndex].name;
      if (axisName === "x" || axisName === "y" || axisName === "z") {
        const spatialAxis = axisName === "x" ? 0 : axisName === "y" ? 1 : 2;
        const start = position[spatialAxis];
        if (spatialAxis === sliceAxis) {
          if (start < 0 || start >= levelInfo.shape[spatialAxis]) {
            outOfBounds = true;
            break;
          }
          selectors[axisIndex] = start;
        } else {
          if (start < 0 || start >= levelInfo.shape[spatialAxis]) {
            outOfBounds = true;
            break;
          }
          const end = Math.min(start + tileSize[spatialAxis], levelInfo.shape[spatialAxis]);
          selectors[axisIndex] = zarr.slice(start, end);
          if (
            (sliceAxis === 2 && spatialAxis === 0) ||
            (sliceAxis === 1 && spatialAxis === 0) ||
            (sliceAxis === 0 && spatialAxis === 1)
          ) {
            validWidth = end - start;
          } else {
            validHeight = end - start;
          }
        }
      } else {
        selectors[axisIndex] = selection[axisName] ?? 0;
      }
    }

    if (outOfBounds) return new ArrayBuffer(totalVoxels * 2);

    try {
      const result = await zarr.get(array, selectors);
      if (!isZarrGetResult(result)) {
        throw new Error("openSlice: unexpected zarr.get result");
      }
      return packPlaneToFloat16(result.data, dtype, tileSize, validWidth, validHeight, sliceAxis);
    } catch {
      return new ArrayBuffer(totalVoxels * 2);
    }
  };

  return { info, metadata, tileSize, fetch };
}

function packPlaneToFloat16(data, dtype, tileSize, validWidth, validHeight, sliceAxis) {
  const tileWidth = sliceAxis === 0 ? tileSize[1] : tileSize[0];
  const tileHeight = sliceAxis === 2 ? tileSize[1] : tileSize[2];
  const totalVoxels = tileSize[0] * tileSize[1] * tileSize[2];
  const output = new Uint16Array(totalVoxels);
  const width = Math.max(0, Math.min(validWidth, tileWidth));
  const height = Math.max(0, Math.min(validHeight, tileHeight));
  const maxLength = Math.min(data.length, width * height);

  let offset = 0;
  let scale = 1;
  if (dtype.includes("uint8") || dtype === "|u1") {
    scale = 1 / 255;
  } else if (dtype.includes("uint16") || dtype.includes("<u2") || dtype.includes(">u2")) {
    scale = 1 / 65535;
  } else if (dtype.includes("int8") || dtype === "|i1") {
    offset = 128;
    scale = 1 / 255;
  } else if (dtype.includes("int16") || dtype.includes("<i2") || dtype.includes(">i2")) {
    offset = 32768;
    scale = 1 / 65535;
  }

  let sourceOffset = 0;
  for (let rowIndex = 0; rowIndex < height; rowIndex += 1) {
    const destinationRow = rowIndex * tileWidth;
    for (let columnIndex = 0; columnIndex < width && sourceOffset < maxLength; columnIndex += 1) {
      output[destinationRow + columnIndex] = floatToFloat16((data[sourceOffset] + offset) * scale);
      sourceOffset += 1;
    }
  }
  return output.buffer;
}

function floatToFloat16(value) {
  const float32 = new Float32Array(1);
  const int32 = new Int32Array(float32.buffer);
  float32[0] = value;
  const bits = int32[0];
  const sign = (bits >> 31) & 0x0001;
  const exponent = (bits >> 23) & 0x00ff;
  const fraction = bits & 0x007fffff;
  if (exponent === 0) return 0;
  if (exponent === 0xff) return (sign << 15) | 0x7c00;
  const nextExponent = exponent - 127 + 15;
  if (nextExponent >= 31) return (sign << 15) | 0x7c00;
  if (nextExponent <= 0) return 0;
  return (sign << 15) | (nextExponent << 10) | (fraction >> 13);
}

function isZarrGetResult(value) {
  return typeof value === "object" && value !== null && "data" in value;
}
