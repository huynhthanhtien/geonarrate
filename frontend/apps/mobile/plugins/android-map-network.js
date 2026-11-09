const { withAppBuildGradle, withMainApplication } = require("expo/config-plugins");

module.exports = function androidMapNetwork(config) {
  config = withAppBuildGradle(config, (result) => {
    const dependency = 'implementation("org.maplibre.gl:android-sdk-opengl:13.6.1")';
    if (!result.modResults.contents.includes(dependency)) {
      result.modResults.contents = result.modResults.contents.replace(
        /^dependencies \{/m, `dependencies {\n    ${dependency}`,
      );
    }
    return result;
  });
  return withMainApplication(config, (result) => {
    if (!result.modResults.contents.includes("HttpRequestUtil.setOkHttpClient")) {
      result.modResults.contents = result.modResults.contents.replace("    super.onCreate()", `    super.onCreate()
    val mapDispatcher = okhttp3.Dispatcher().apply {
      maxRequests = 4
      maxRequestsPerHost = 4
    }
    org.maplibre.android.module.http.HttpRequestUtil.setOkHttpClient(
      okhttp3.OkHttpClient.Builder()
        .dispatcher(mapDispatcher)
        .addInterceptor { chain ->
          chain.proceed(chain.request().newBuilder().header("User-Agent", "GeoNarrate-Android/1.0").build())
        }
        .build()
    )`);
    }
    return result;
  });
};
