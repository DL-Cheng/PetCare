const mqttSettings = {
  enabled: true,
  brokerUrl: "wss://broker.emqx.io:8084/mqtt",
  sensorTopic: "petbox/sensor",
  commandTopic: "petbox/fan/set",
  clientId: `petbox_web_${Math.random().toString(16).slice(2)}`,
};

const state = {
  mode: "auto",
  temperature: 27.4,
  humidity: 58,
  threshold: 28,
  fanOn: false,
  mqttClient: null,
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
  if (state.mode === "auto") {
    state.fanOn = state.temperature >= state.threshold;
  }
}

function render() {
  updateFanByMode();

  elements.temperatureValue.textContent = state.temperature.toFixed(1);
  elements.humidityValue.textContent = Math.round(state.humidity).toString();
  elements.thresholdValue.textContent = state.threshold.toString();
  elements.fanStatus.textContent = state.fanOn ? "ON" : "OFF";
  elements.fanStatus.classList.toggle("on", state.fanOn);
  elements.fanToggleButton.classList.toggle("off", state.fanOn);
  elements.fanToggleText.textContent = state.fanOn ? "關閉風扇" : "啟動風扇";
  elements.modeText.textContent = state.mode === "auto" ? "自動" : "手動";
  elements.updatedAt.textContent = new Date().toLocaleTimeString("zh-TW", { hour12: false });
  elements.topicText.textContent = mqttSettings.sensorTopic;

  const isHot = state.temperature >= state.threshold;
  elements.temperatureCard.classList.toggle("hot", isHot);
  elements.temperatureNote.textContent = isHot ? "溫度過高，啟動降溫" : "舒適範圍";

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
    if (Number.isFinite(Number(data.temperature))) {
      state.temperature = Number(data.temperature);
    }
    if (Number.isFinite(Number(data.humidity))) {
      state.humidity = Number(data.humidity);
    }
    render();
  } catch {
    console.warn("MQTT payload is not valid JSON:", payload);
  }
}

function connectMqtt() {
  if (!mqttSettings.enabled || !window.mqtt) {
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
  });

  client.on("message", (_topic, message) => {
    handleSensorPayload(message.toString());
  });

  client.on("close", () => {
    elements.connectionState.classList.remove("connected");
    elements.connectionState.querySelector("span:last-child").textContent = "MQTT 離線";
  });
}

function startDemoData() {
  setInterval(() => {
    if (state.mqttClient?.connected) {
      return;
    }

    const nextTemperature = state.temperature + (Math.random() - 0.44) * 0.45;
    const nextHumidity = state.humidity + (Math.random() - 0.5) * 2;
    state.temperature = Math.min(33, Math.max(24, nextTemperature));
    state.humidity = Math.min(82, Math.max(42, nextHumidity));
    render();
  }, 3500);
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
startDemoData();
render();
