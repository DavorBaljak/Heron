const CONTROL_ICONS = {
  Dimmer: "💡",
  Switch: "🔌",
  Jalousie: "🪟",
  Gate: "🚪",
  IRoomControllerV2: "🌡️",
  TemperatureSensor: "🌡️",
  AudioZoneV2: "🔊",
  Camera: "📷",
  Intercom: "📞",
  PresenceDetector: "🚶",
  SmokeDetector: "🔥",
  WaterSensor: "💧",
  Alarm: "🚨",
  Meter: "⚡",
  SolarProducer: "☀️",
};

const BOOL_KEYS = new Set(["active", "motion", "ring"]);

function iconFor(type) {
  return CONTROL_ICONS[type] ?? "⚙️";
}

const NUMERIC_KEYS = new Set(["position", "temp", "targetTemp", "power", "total", "volume"]);

/** Formats a single state key/value into { text, className }. Falls back to
 * a plain "key: value" for anything not explicitly known — real Miniservers
 * may have control types/keys the mock fixture never exercises. Also handles
 * a normally-numeric key holding a raw command string instead (e.g. the mock
 * stores a Jalousie's last "down"/"up" command as its position when that
 * command isn't itself a number) by just showing it as-is. */
function formatState(key, value) {
  if (BOOL_KEYS.has(key)) {
    const on = Number(value) === 1;
    const label = key === "motion" ? (on ? "Motion" : "Clear") : key === "ring" ? (on ? "Ringing" : "Idle") : on ? "On" : "Off";
    return { text: label, className: on ? (key === "motion" || key === "ring" ? "alarm" : "on") : "" };
  }
  if (key === "alarm") {
    const triggered = Number(value) === 1;
    return { text: triggered ? "ALARM" : "OK", className: triggered ? "alarm" : "" };
  }
  if (NUMERIC_KEYS.has(key) && (typeof value !== "number" || Number.isNaN(value))) {
    return { text: `${key}: ${value}`, className: "" };
  }
  if (key === "position") {
    return { text: `${Math.round(Number(value))}%`, className: "" };
  }
  if (key === "temp") {
    return { text: `${Number(value).toFixed(1)}°C`, className: "" };
  }
  if (key === "targetTemp") {
    return { text: `target ${Number(value).toFixed(1)}°C`, className: "" };
  }
  if (key === "power") {
    return { text: `${Number(value).toFixed(2)} kW`, className: "" };
  }
  if (key === "total") {
    return { text: `${Number(value).toFixed(1)} kWh`, className: "" };
  }
  if (key === "volume") {
    return { text: `vol ${Math.round(Number(value))}%`, className: "" };
  }
  return { text: `${key}: ${value}`, className: "" };
}

function controlValueId(uuid, key) {
  return `state-${uuid}-${key}`;
}

function renderControl(control, states) {
  const stateEntries = Object.entries(control.states ?? {});
  const values = stateEntries
    .map(([key]) => {
      const value = states[key];
      if (value === undefined) return "";
      const { text, className } = formatState(key, value);
      return `<span class="control-value ${className}" id="${controlValueId(control.uuid, key)}" data-key="${key}">${text}</span>`;
    })
    .filter(Boolean)
    .join(" ");

  return `
    <div class="control-row">
      <span class="control-icon">${iconFor(control.type)}</span>
      <span class="control-name">${control.name}</span>
      ${values || '<span class="control-value">—</span>'}
    </div>`;
}

function render(structure, states) {
  const roomsEl = document.getElementById("rooms");
  const controlsByRoom = new Map();
  for (const control of structure.controls) {
    const roomUuid = control.room ?? "__none__";
    if (!controlsByRoom.has(roomUuid)) controlsByRoom.set(roomUuid, []);
    controlsByRoom.get(roomUuid).push(control);
  }

  const rooms = [...structure.rooms].sort((a, b) => a.name.localeCompare(b.name));
  roomsEl.innerHTML = rooms
    .filter((room) => controlsByRoom.has(room.uuid))
    .map((room) => {
      const controls = controlsByRoom.get(room.uuid) ?? [];
      const controlsHtml = controls
        .map((control) => renderControl(control, states[control.uuid] ?? {}))
        .join("");
      return `<section class="room-card"><h2>${room.name}</h2>${controlsHtml}</section>`;
    })
    .join("");
}

function applyUpdate(update) {
  const el = document.getElementById(controlValueId(update.uuid, update.key));
  if (!el) return;
  const { text, className } = formatState(update.key, update.value);
  el.textContent = text;
  el.className = `control-value ${className} flash`;
  // Restart the flash animation on repeated updates.
  void el.offsetWidth;
  el.classList.add("flash");
}

function setStatus(text, className) {
  const el = document.getElementById("connectionStatus");
  el.textContent = text;
  el.className = `status ${className}`;
}

function connectWebSocket() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${protocol}//${location.host}`);

  ws.addEventListener("open", () => setStatus("Connected", "connected"));
  ws.addEventListener("close", () => {
    setStatus("Disconnected — retrying…", "disconnected");
    setTimeout(connectWebSocket, 2000);
  });
  ws.addEventListener("error", () => ws.close());
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.type === "state_update") {
      applyUpdate(message);
    }
  });
}

async function main() {
  const response = await fetch("/api/snapshot");
  const snapshot = await response.json();
  render(snapshot.structure, snapshot.states);
  connectWebSocket();
}

main();
