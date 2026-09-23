const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Ensure font and asset extensions are included
config.resolver.assetExts.push("ttf");

module.exports = withNativeWind(config, { input: "./global.css" });
