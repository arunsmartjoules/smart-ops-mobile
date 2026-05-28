const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// Treat .html and .wasm as bundleable assets (.wasm needed for expo-sqlite web worker)
config.resolver.assetExts = [...(config.resolver.assetExts || []), "html", "wasm"];

module.exports = withNativeWind(config, { input: "./app/global.css" });
