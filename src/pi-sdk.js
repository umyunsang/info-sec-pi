import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import pkg from '../package.json' with { type: 'json' };

const sdkEntry = import.meta.resolve('@earendil-works/pi-coding-agent');
const sdkConfig = new URL('./config.js', sdkEntry);

// Pi reads piConfig once. Initialize only that module with isp's manifest;
// the rest of the SDK resolves docs and assets from its bundled package.
process.env.PI_PACKAGE_DIR = fileURLToPath(new URL('../', import.meta.url));
let config;
try {
  config = await import(sdkConfig);
} finally {
  delete process.env.PI_PACKAGE_DIR;
}

if (config.APP_NAME !== pkg.piConfig.name ||
    config.CONFIG_DIR_NAME !== pkg.piConfig.configDir ||
    config.VERSION !== pkg.version) {
  throw new Error('Could not initialize the isp profile.');
}

process.env.PI_SKIP_VERSION_CHECK = '1';
process.env.PI_TELEMETRY = '0';

// Pi 1.6 constructs its Agent inside the SDK. Bind the SDK's core imports
// to the compiled source kept in this package.
const sdkModules = new URL('./', sdkEntry).href;
const ownedCore = new URL('../packages/agent-core/dist/index.js', import.meta.url).href;
registerHooks({
  resolve(specifier, context, nextResolve) {
    const isSdkCore = specifier === '@earendil-works/pi-agent-core' &&
      context.parentURL?.startsWith(sdkModules);
    return nextResolve(isSdkCore ? ownedCore : specifier, context);
  },
});

export const piSdk = await import(sdkEntry);
