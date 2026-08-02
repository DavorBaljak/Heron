export const fixtureStructure = {
  rooms: {
    "room-living": { name: "Living Room" },
    "room-bedroom": { name: "Bedroom" },
  },
  cats: {
    "cat-lighting": { name: "Lighting", type: "lights" },
    "cat-shading": { name: "Shading", type: "shading" },
  },
  controls: {
    "ctrl-living-light": {
      name: "Living Room Light",
      type: "LightController",
      room: "room-living",
      cat: "cat-lighting",
      states: { active: "state-living-light-active" },
    },
    "ctrl-bedroom-light": {
      name: "Bedroom Light",
      type: "LightController",
      room: "room-bedroom",
      cat: "cat-lighting",
      states: { active: "state-bedroom-light-active" },
    },
    "ctrl-living-blind": {
      name: "Living Room Blind",
      type: "Jalousie",
      room: "room-living",
      cat: "cat-shading",
      states: { position: "state-living-blind-position" },
    },
  },
};
