const { withAppBuildGradle } = require("@expo/config-plugins");

/**
 * Signs release builds with a real keystore instead of the debug key that
 * `expo prebuild` wires in by default. Play Protect, Google Play and Android's
 * update mechanism all treat a debug-signed APK as untrusted.
 *
 * The keystore and its passwords live OUTSIDE the repository and are passed in
 * through the environment at build time:
 *
 *   ARTHIQ_KEYSTORE_PATH       absolute path to the .keystore / .jks file
 *   ARTHIQ_KEYSTORE_PASSWORD
 *   ARTHIQ_KEY_ALIAS
 *   ARTHIQ_KEY_PASSWORD
 *
 * With any of them missing the build falls back to the debug key and prints a
 * warning, so local development still works — but that APK must never be
 * published. `android/` is generated and gitignored, which is why this lives
 * in a config plugin and not in a hand-edited build.gradle.
 */
const MARKER = "// arthiq-release-signing";

const SIGNING_CONFIG = `
        ${MARKER}
        release {
            def ksPath = System.getenv('ARTHIQ_KEYSTORE_PATH')
            if (ksPath && file(ksPath).exists()) {
                storeFile file(ksPath)
                storePassword System.getenv('ARTHIQ_KEYSTORE_PASSWORD')
                keyAlias System.getenv('ARTHIQ_KEY_ALIAS')
                keyPassword System.getenv('ARTHIQ_KEY_PASSWORD')
            }
        }`;

const withReleaseSigning = (config) =>
  withAppBuildGradle(config, (config) => {
    let gradle = config.modResults.contents;
    if (gradle.includes(MARKER)) return config;

    // 1) add a `release` signing config next to the generated `debug` one
    gradle = gradle.replace(
      /(signingConfigs\s*\{[\s\S]*?debug\s*\{[\s\S]*?\n\s{8}\})/,
      `$1${SIGNING_CONFIG}`,
    );

    // 2) point the release build type at it (debug key only as a loud fallback)
    gradle = gradle.replace(
      /(release\s*\{\s*\n(?:\s*\/\/.*\n)*\s*)signingConfig signingConfigs\.debug/,
      `$1signingConfig (System.getenv('ARTHIQ_KEYSTORE_PATH') ? signingConfigs.release : signingConfigs.debug)
            if (!System.getenv('ARTHIQ_KEYSTORE_PATH')) {
                logger.warn('WARNING: ARTHIQ_KEYSTORE_PATH not set - release APK is signed with the DEBUG key. Do not publish it.')
            }`,
    );

    config.modResults.contents = gradle;
    return config;
  });

module.exports = withReleaseSigning;
