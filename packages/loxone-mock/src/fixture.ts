// A fixture representing a full (fictional) house, so the mock has enough
// variety of rooms/categories/device types for discovery, monitoring, and
// action-tier testing.

export const fixtureStructure = {
  rooms: {
    "room-living": { name: "Living Room" },
    "room-kitchen": { name: "Kitchen" },
    "room-master-bedroom": { name: "Master Bedroom" },
    "room-kids-bedroom": { name: "Kids Bedroom" },
    "room-bathroom": { name: "Bathroom" },
    "room-office": { name: "Office" },
    "room-hallway": { name: "Hallway" },
    "room-garage": { name: "Garage" },
    "room-terrace": { name: "Terrace" },
    "room-utility": { name: "Utility Room" },
    "room-pool": { name: "Pool" },
    "room-roof": { name: "Roof" },
    "room-wells": { name: "Heat Pump Wells" },
    "room-perimeter": { name: "Yard Perimeter" },
  },
  cats: {
    "cat-lighting": { name: "Lighting", type: "lights" },
    "cat-shading": { name: "Shading", type: "shading" },
    "cat-climate": { name: "Climate", type: "climate" },
    "cat-security": { name: "Security", type: "security" },
    "cat-audio": { name: "Audio", type: "audio" },
    "cat-energy": { name: "Energy", type: "energy" },
    "cat-irrigation": { name: "Irrigation", type: "irrigation" },
    "cat-pool": { name: "Pool", type: "pool" },
    "cat-cctv": { name: "CCTV", type: "cctv" },
  },
  controls: {
    // Living Room
    "ctrl-living-light": {
      name: "Living Room Light",
      type: "Dimmer",
      room: "room-living",
      cat: "cat-lighting",
      states: { active: "state-living-light-active" },
    },
    "ctrl-living-blind": {
      name: "Living Room Blind",
      type: "Jalousie",
      room: "room-living",
      cat: "cat-shading",
      states: { position: "state-living-blind-position" },
    },
    "ctrl-living-climate": {
      name: "Living Room Climate",
      type: "IRoomControllerV2",
      room: "room-living",
      cat: "cat-climate",
      states: { temp: "state-living-climate-temp", targetTemp: "state-living-climate-target-temp" },
    },
    "ctrl-living-audio": {
      name: "Living Room Audio",
      type: "AudioZoneV2",
      room: "room-living",
      cat: "cat-audio",
      states: { power: "state-living-audio-power", volume: "state-living-audio-volume" },
    },

    // Kitchen
    "ctrl-kitchen-light": {
      name: "Kitchen Light",
      type: "Dimmer",
      room: "room-kitchen",
      cat: "cat-lighting",
      states: { active: "state-kitchen-light-active" },
    },
    "ctrl-kitchen-blind": {
      name: "Kitchen Blind",
      type: "Jalousie",
      room: "room-kitchen",
      cat: "cat-shading",
      states: { position: "state-kitchen-blind-position" },
    },
    "ctrl-kitchen-climate": {
      name: "Kitchen Climate",
      type: "IRoomControllerV2",
      room: "room-kitchen",
      cat: "cat-climate",
      states: { temp: "state-kitchen-climate-temp", targetTemp: "state-kitchen-climate-target-temp" },
    },
    "ctrl-kitchen-smoke": {
      name: "Kitchen Smoke Detector",
      type: "SmokeDetector",
      room: "room-kitchen",
      cat: "cat-security",
      states: { alarm: "state-kitchen-smoke-alarm" },
    },

    // Master Bedroom
    "ctrl-master-light": {
      name: "Master Bedroom Light",
      type: "Dimmer",
      room: "room-master-bedroom",
      cat: "cat-lighting",
      states: { active: "state-master-light-active" },
    },
    "ctrl-master-blind": {
      name: "Master Bedroom Blind",
      type: "Jalousie",
      room: "room-master-bedroom",
      cat: "cat-shading",
      states: { position: "state-master-blind-position" },
    },
    "ctrl-master-climate": {
      name: "Master Bedroom Climate",
      type: "IRoomControllerV2",
      room: "room-master-bedroom",
      cat: "cat-climate",
      states: { temp: "state-master-climate-temp", targetTemp: "state-master-climate-target-temp" },
    },
    "ctrl-master-audio": {
      name: "Master Bedroom Audio",
      type: "AudioZoneV2",
      room: "room-master-bedroom",
      cat: "cat-audio",
      states: { power: "state-master-audio-power", volume: "state-master-audio-volume" },
    },

    // Kids Bedroom
    "ctrl-kids-light": {
      name: "Kids Bedroom Light",
      type: "Switch",
      room: "room-kids-bedroom",
      cat: "cat-lighting",
      states: { active: "state-kids-light-active" },
    },
    "ctrl-kids-blind": {
      name: "Kids Bedroom Blind",
      type: "Jalousie",
      room: "room-kids-bedroom",
      cat: "cat-shading",
      states: { position: "state-kids-blind-position" },
    },
    "ctrl-kids-climate": {
      name: "Kids Bedroom Climate",
      type: "IRoomControllerV2",
      room: "room-kids-bedroom",
      cat: "cat-climate",
      states: { temp: "state-kids-climate-temp", targetTemp: "state-kids-climate-target-temp" },
    },

    // Bathroom
    "ctrl-bathroom-light": {
      name: "Bathroom Light",
      type: "Dimmer",
      room: "room-bathroom",
      cat: "cat-lighting",
      states: { active: "state-bathroom-light-active" },
    },
    "ctrl-bathroom-climate": {
      name: "Bathroom Underfloor Heating",
      type: "IRoomControllerV2",
      room: "room-bathroom",
      cat: "cat-climate",
      states: { temp: "state-bathroom-climate-temp", targetTemp: "state-bathroom-climate-target-temp" },
    },
    "ctrl-bathroom-fan": {
      name: "Bathroom Extractor Fan",
      type: "Switch",
      room: "room-bathroom",
      cat: "cat-climate",
      states: { active: "state-bathroom-fan-active" },
    },

    // Office
    "ctrl-office-light": {
      name: "Office Light",
      type: "Dimmer",
      room: "room-office",
      cat: "cat-lighting",
      states: { active: "state-office-light-active" },
    },
    "ctrl-office-blind": {
      name: "Office Blind",
      type: "Jalousie",
      room: "room-office",
      cat: "cat-shading",
      states: { position: "state-office-blind-position" },
    },
    "ctrl-office-climate": {
      name: "Office Climate",
      type: "IRoomControllerV2",
      room: "room-office",
      cat: "cat-climate",
      states: { temp: "state-office-climate-temp", targetTemp: "state-office-climate-target-temp" },
    },

    // Hallway
    "ctrl-hallway-light": {
      name: "Hallway Light",
      type: "Switch",
      room: "room-hallway",
      cat: "cat-lighting",
      states: { active: "state-hallway-light-active" },
    },
    "ctrl-hallway-alarm": {
      name: "House Alarm Panel",
      type: "Alarm",
      room: "room-hallway",
      cat: "cat-security",
      states: { armed: "state-hallway-alarm-armed" },
    },

    // Garage
    "ctrl-garage-light": {
      name: "Garage Light",
      type: "Switch",
      room: "room-garage",
      cat: "cat-lighting",
      states: { active: "state-garage-light-active" },
    },
    "ctrl-garage-gate": {
      name: "Garage Gate",
      type: "Gate",
      room: "room-garage",
      cat: "cat-security",
      states: { position: "state-garage-gate-position" },
    },

    // Terrace
    "ctrl-terrace-light": {
      name: "Terrace Light",
      type: "Switch",
      room: "room-terrace",
      cat: "cat-lighting",
      states: { active: "state-terrace-light-active" },
    },
    "ctrl-terrace-audio": {
      name: "Terrace Audio",
      type: "AudioZoneV2",
      room: "room-terrace",
      cat: "cat-audio",
      states: { power: "state-terrace-audio-power", volume: "state-terrace-audio-volume" },
    },
    "ctrl-terrace-irrigation": {
      name: "Garden Irrigation Valve",
      type: "Switch",
      room: "room-terrace",
      cat: "cat-irrigation",
      states: { active: "state-terrace-irrigation-active" },
    },

    // Utility Room
    "ctrl-utility-meter": {
      name: "Main Energy Meter",
      type: "Meter",
      room: "room-utility",
      cat: "cat-energy",
      states: { power: "state-utility-meter-power", total: "state-utility-meter-total" },
    },
    "ctrl-utility-leak": {
      name: "Water Leak Sensor",
      type: "WaterSensor",
      room: "room-utility",
      cat: "cat-security",
      states: { alarm: "state-utility-leak-alarm" },
    },

    // Pool
    "ctrl-pool-heater": {
      name: "Pool Heater",
      type: "IRoomControllerV2",
      room: "room-pool",
      cat: "cat-pool",
      states: { temp: "state-pool-heater-temp", targetTemp: "state-pool-heater-target-temp" },
    },
    "ctrl-pool-pump": {
      name: "Pool Pump",
      type: "Switch",
      room: "room-pool",
      cat: "cat-pool",
      states: { active: "state-pool-pump-active" },
    },

    // Roof — solar PV, two 6 kWp arrays angled 30° to catch morning and
    // afternoon sun respectively.
    "ctrl-solar-array-east": {
      name: "Solar Array 1 (East-facing, 6 kWp, 30° tilt — morning sun)",
      type: "SolarProducer",
      room: "room-roof",
      cat: "cat-energy",
      states: { power: "state-solar-east-power", total: "state-solar-east-total" },
    },
    "ctrl-solar-array-west": {
      name: "Solar Array 2 (West-facing, 6 kWp, 30° tilt — afternoon sun)",
      type: "SolarProducer",
      room: "room-roof",
      cat: "cat-energy",
      states: { power: "state-solar-west-power", total: "state-solar-west-total" },
    },

    // Heat pump wells (open-loop ground source: one supply, one return borehole)
    "ctrl-well-inlet": {
      name: "Heat Pump Inlet Well (Supply)",
      type: "TemperatureSensor",
      room: "room-wells",
      cat: "cat-climate",
      states: { temp: "state-well-inlet-temp" },
    },
    "ctrl-well-outlet": {
      name: "Heat Pump Outlet Well (Return)",
      type: "TemperatureSensor",
      room: "room-wells",
      cat: "cat-climate",
      states: { temp: "state-well-outlet-temp" },
    },

    // Yard perimeter — outdoor cameras/motion detection and entrance control
    "ctrl-perimeter-camera-front": {
      name: "Front Yard Camera",
      type: "Camera",
      room: "room-perimeter",
      cat: "cat-cctv",
      states: { motion: "state-perimeter-camera-front-motion" },
    },
    "ctrl-perimeter-camera-back": {
      name: "Back Yard Camera",
      type: "Camera",
      room: "room-perimeter",
      cat: "cat-cctv",
      states: { motion: "state-perimeter-camera-back-motion" },
    },
    "ctrl-perimeter-camera-driveway": {
      name: "Driveway Camera",
      type: "Camera",
      room: "room-perimeter",
      cat: "cat-cctv",
      states: { motion: "state-perimeter-camera-driveway-motion" },
    },
    "ctrl-perimeter-motion-front": {
      name: "Front Yard Motion Detector",
      type: "PresenceDetector",
      room: "room-perimeter",
      cat: "cat-security",
      states: { motion: "state-perimeter-motion-front-active" },
    },
    "ctrl-perimeter-motion-back": {
      name: "Back Yard Motion Detector",
      type: "PresenceDetector",
      room: "room-perimeter",
      cat: "cat-security",
      states: { motion: "state-perimeter-motion-back-active" },
    },
    "ctrl-perimeter-gate": {
      name: "Entrance Gate",
      type: "Gate",
      room: "room-perimeter",
      cat: "cat-security",
      states: { position: "state-perimeter-gate-position" },
    },
    "ctrl-perimeter-intercom": {
      name: "Entrance Intercom",
      type: "Intercom",
      room: "room-perimeter",
      cat: "cat-security",
      states: { ring: "state-perimeter-intercom-ring" },
    },
  },
};

export const fixtureStateValues: Record<string, number | string> = {
  "state-living-light-active": 0,
  "state-living-blind-position": 0,
  "state-living-climate-temp": 21.5,
  "state-living-climate-target-temp": 22,
  "state-living-audio-power": 0,
  "state-living-audio-volume": 20,

  "state-kitchen-light-active": 0,
  "state-kitchen-blind-position": 0,
  "state-kitchen-climate-temp": 22,
  "state-kitchen-climate-target-temp": 21,
  "state-kitchen-smoke-alarm": 0,

  "state-master-light-active": 0,
  "state-master-blind-position": 100,
  "state-master-climate-temp": 20.5,
  "state-master-climate-target-temp": 20,
  "state-master-audio-power": 0,
  "state-master-audio-volume": 15,

  "state-kids-light-active": 0,
  "state-kids-blind-position": 100,
  "state-kids-climate-temp": 21,
  "state-kids-climate-target-temp": 21,

  "state-bathroom-light-active": 0,
  "state-bathroom-climate-temp": 23,
  "state-bathroom-climate-target-temp": 24,
  "state-bathroom-fan-active": 0,

  "state-office-light-active": 0,
  "state-office-blind-position": 0,
  "state-office-climate-temp": 21,
  "state-office-climate-target-temp": 21,

  "state-hallway-light-active": 0,
  "state-hallway-alarm-armed": 0,

  "state-garage-light-active": 0,
  "state-garage-gate-position": 0,

  "state-terrace-light-active": 0,
  "state-terrace-audio-power": 0,
  "state-terrace-audio-volume": 30,
  "state-terrace-irrigation-active": 0,

  "state-utility-meter-power": 850,
  "state-utility-meter-total": 4231.6,
  "state-utility-leak-alarm": 0,

  "state-pool-heater-temp": 25.2,
  "state-pool-heater-target-temp": 27,
  "state-pool-pump-active": 0,

  "state-solar-east-power": 3.8,
  "state-solar-east-total": 812.4,
  "state-solar-west-power": 0.6,
  "state-solar-west-total": 754.2,

  "state-well-inlet-temp": 12.4,
  "state-well-outlet-temp": 8.1,

  "state-perimeter-camera-front-motion": 0,
  "state-perimeter-camera-back-motion": 0,
  "state-perimeter-camera-driveway-motion": 0,
  "state-perimeter-motion-front-active": 0,
  "state-perimeter-motion-back-active": 0,
  "state-perimeter-gate-position": 0,
  "state-perimeter-intercom-ring": 0,
};
