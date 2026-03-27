const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// Allow Metro to bundle .html files as assets
config.resolver.assetExts = [...(config.resolver.assetExts || []), "html"];

module.exports = withNativeWind(config, { input: "./app/global.css" });
