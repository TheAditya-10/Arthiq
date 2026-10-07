const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// The source uses NodeNext-style relative imports ("./foo.js" for foo.ts/foo.tsx).
// Metro doesn't map .js -> .ts/.tsx by itself, so retry without the extension.
const defaultResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = defaultResolve ?? context.resolveRequest;
  try {
    return resolve(context, moduleName, platform);
  } catch (error) {
    if (moduleName.startsWith(".") && moduleName.endsWith(".js")) {
      return resolve(context, moduleName.slice(0, -3), platform);
    }
    throw error;
  }
};

module.exports = config;
