const mqttSettings = {
  enabled: true,
  brokerUrl: "wss://broker.emqx.io:8084/mqtt",
  sensorTopic: "petbox/sensor",
  commandTopic: "petbox/fan/set",
  clientId: `petbox_web_${Math.random().toString(16).slice(2)}`,
};

const state = {
  mode: "auto",
  temperature: null,
  humidity: null,
  threshold: 28,
  fanOn: false,
  mqttClient: null,
  hasSensorData: false,
};

const elements = {
  temperatureValue: document.querySelector("#temperatureValue"),
  humidityValue: document.querySelector("#humidityValue"),
  temperatureNote: document.querySelector("#temperatureNote"),
  thresholdSlider: document.querySelector("#thresholdSlider"),
  thresholdValue: document.querySelector("#thresholdValue"),
  fanStatus: document.querySelector("#fanStatus"),
  fanToggleButton: document.querySelector("#fanToggleButton"),
  fanToggleText: document.querySelector("#fanToggleText"),
  modeText: document.querySelector("#modeText"),
  updatedAt: document.querySelector("#updatedAt"),
  topicText: document.querySelector("#topicText"),
  connectionState: document.querySelector("#connectionState"),
  autoPanel: document.querySelector("#autoPanel"),
  manualPanel: document.querySelector("#manualPanel"),
  modeButtons: document.querySelectorAll(".mode-button"),
  temperatureCard: document.querySelector(".temperature-card"),
};

function publishFanCommand() {
  const payload = JSON.stringify({
    mode: state.mode,
    fan: state.fanOn ? "ON" : "OFF",
    threshold: state.threshold,
  });

  if (state.mqttClient?.connected) {
    state.mqttClient.publish(mqttSettings.commandTopic, payload);
  }
}

function updateFanByMode() {
  if (state.mode === "auto" && Number.isFinite(state.temperature)) {
    state.fanOn = state.temperature >= state.threshold;
  }
}

function render() {
  updateFanByMode();

  elements.temperatureValue.textContent = Number.isFinite(state.temperature) ? state.temperature.toFixed(1) : "--";
  elements.humidityValue.textContent = Number.isFinite(state.humidity) ? Math.round(state.humidity).toString() : "--";
  elements.thresholdValue.textContent = state.threshold.toString();
  elements.fanStatus.textContent = state.fanOn ? "ON" : "OFF";
  elements.fanStatus.classList.toggle("on", state.fanOn);
  elements.fanToggleButton.classList.toggle("off", state.fanOn);
  elements.fanToggleText.textContent = state.fanOn ? "關閉風扇" : "啟動風扇";
  elements.modeText.textContent = state.mode === "auto" ? "自動" : "手動";
  elements.updatedAt.textContent = new Date().toLocaleTimeString("zh-TW", { hour12: false });
  elements.topicText.textContent = mqttSettings.sensorTopic;

  const isHot = Number.isFinite(state.temperature) && state.temperature >= state.threshold;
  elements.temperatureCard.classList.toggle("hot", isHot);
  elements.temperatureNote.textContent = state.hasSensorData
    ? isHot
      ? "溫度過高，啟動降溫"
      : "舒適範圍"
    : "等待 MQTT 資料";

  elements.modeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === state.mode);
  });

  const isManual = state.mode === "manual";
  elements.manualPanel.classList.toggle("disabled", !isManual);
  elements.manualPanel.setAttribute("aria-disabled", String(!isManual));
  elements.fanToggleButton.disabled = !isManual;
  elements.autoPanel.style.display = state.mode === "auto" ? "block" : "none";
}

function setMode(mode) {
  state.mode = mode;
  render();
  publishFanCommand();
}

function handleSensorPayload(payload) {
  try {
    const data = JSON.parse(payload);
    const previousFanState = state.fanOn;

    if (Number.isFinite(Number(data.temperature))) {
      state.temperature = Number(data.temperature);
      state.hasSensorData = true;
    }
    if (Number.isFinite(Number(data.humidity))) {
      state.humidity = Number(data.humidity);
      state.hasSensorData = true;
    }
    if (typeof data.fan === "string") {
      state.fanOn = data.fan.toUpperCase() === "ON";
    }
    render();

    if (state.mode === "auto" && previousFanState !== state.fanOn) {
      publishFanCommand();
    }
  } catch {
    console.warn("MQTT payload is not valid JSON:", payload);
  }
}

function connectMqtt() {
  if (!mqttSettings.enabled) {
    elements.connectionState.querySelector("span:last-child").textContent = "MQTT 未啟用";
    return;
  }

  if (!window.mqtt) {
    elements.connectionState.querySelector("span:last-child").textContent = "MQTT 函式庫未載入";
    return;
  }

  const client = mqtt.connect(mqttSettings.brokerUrl, {
    clientId: mqttSettings.clientId,
    clean: true,
    reconnectPeriod: 3000,
    connectTimeout: 8000,
  });

  state.mqttClient = client;

  client.on("connect", () => {
    elements.connectionState.classList.add("connected");
    elements.connectionState.querySelector("span:last-child").textContent = "MQTT 已連線";
    client.subscribe(mqttSettings.sensorTopic);
    publishFanCommand();
  });

  client.on("message", (_topic, message) => {
    handleSensorPayload(message.toString());
  });

  client.on("close", () => {
    elements.connectionState.classList.remove("connected");
    elements.connectionState.querySelector("span:last-child").textContent = "MQTT 離線";
  });

  client.on("error", () => {
    elements.connectionState.classList.remove("connected");
    elements.connectionState.querySelector("span:last-child").textContent = "MQTT 連線錯誤";
  });
}

elements.thresholdSlider.addEventListener("input", (event) => {
  state.threshold = Number(event.target.value);
  render();
});

elements.thresholdSlider.addEventListener("change", publishFanCommand);

elements.fanToggleButton.addEventListener("click", () => {
  if (state.mode !== "manual") {
    return;
  }
  state.fanOn = !state.fanOn;
  render();
  publishFanCommand();
});

elements.modeButtons.forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.mode));
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

connectMqtt();
render();
