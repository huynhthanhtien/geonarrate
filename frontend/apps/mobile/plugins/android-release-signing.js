const { withAppBuildGradle } = require("expo/config-plugins");

/**
 * Ký APK release bằng keystore lấy từ biến môi trường khi build CI:
 * ANDROID_KEYSTORE_PATH / ANDROID_STORE_PASSWORD / ANDROID_KEY_ALIAS / ANDROID_KEY_PASSWORD.
 * Không có keystore thì giữ cách ký debug như bản build local.
 *
 * Phiên bản native lấy từ EXPO_ANDROID_VERSION_CODE / EXPO_ANDROID_VERSION_NAME
 * để workflow GitHub Release gắn số version theo tag.
 */
module.exports = function androidReleaseSigning(config) {
  return withAppBuildGradle(config, (result) => {
    let contents = result.modResults.contents;

    const versionCode = process.env.EXPO_ANDROID_VERSION_CODE;
    const versionName = process.env.EXPO_ANDROID_VERSION_NAME;
    if (versionCode) {
      contents = contents.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`);
    }
    if (versionName) {
      contents = contents.replace(/versionName\s+"[^"]*"/, `versionName "${versionName}"`);
    }

    if (!contents.includes("ANDROID_KEYSTORE_PATH")) {
      contents = contents.replace(
        "    signingConfigs {\n        debug {",
        '    def releaseKeystore = System.getenv("ANDROID_KEYSTORE_PATH")\n    signingConfigs {\n        debug {',
      );
      contents = contents.replace(
        /\n        \}\n    \}\n    buildTypes \{\n        debug \{/,
        `
        }
        if (releaseKeystore) {
            release {
                storeFile file(releaseKeystore)
                storePassword System.getenv("ANDROID_STORE_PASSWORD")
                keyAlias System.getenv("ANDROID_KEY_ALIAS")
                keyPassword System.getenv("ANDROID_KEY_PASSWORD")
            }
        }
    }
    buildTypes {
        debug {`,
      );
      contents = contents.replace(
        "            signingConfig signingConfigs.debug\n            def enableShrinkResources",
        "            signingConfig releaseKeystore ? signingConfigs.release : signingConfigs.debug\n            def enableShrinkResources",
      );
    }

    result.modResults.contents = contents;
    return result;
  });
};
