export default {
  expo: {
    name: "AniYu",
    slug: "AniYu",
    version: "1.0.6",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "aniyu",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    
    updates: {
      url: "https://u.expo.dev/f438370b-8c69-4d6e-bb2e-a8c67823cd0d"
    },
    
    runtimeVersion: {
      policy: "appVersion"
    },

    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.aniyu.app",
      googleServicesFile: "./GoogleService-Info.plist",
      usesAppleSignIn: true
    },
    android: {
      adaptiveIcon: {
        backgroundColor: "#E6F4FE",
        foregroundImage: "./assets/images/android-icon-foreground.png",
        backgroundImage: "./assets/images/android-icon-background.png",
        monochromeImage: "./assets/images/android-icon-monochrome.png"
      },
      edgeToEdgeEnabled: true,
      package: "com.aniyu.app",
      googleServicesFile: "./google-services.json"
    },
    web: {
      output: "static",
      favicon: "./assets/images/favicon.png"
    },
    plugins: [
      "expo-router",
      [
        "expo-splash-screen",
        {
          image: "./assets/images/splash-icon.png",
          imageWidth: 200,
          resizeMode: "contain",
          backgroundColor: "#ffffff",
          dark: {
            backgroundColor: "#000000"
          }
        }
      ],
      [
        "expo-location",
        {
          "locationAlwaysAndWhenInUsePermission": "Allow AniYu to use your location to customize your feed and improve security."
        }
      ],
      [
        "expo-notifications",
        {
          "color": "#2563eb"
        }
      ],
      "expo-video",
      "expo-font",
      [
        "react-native-google-mobile-ads",
        {
          "androidAppId": "ca-app-pub-9826157970378029~7056657389", 
          "iosAppId": "ca-app-pub-9826157970378029~7998052970"     
        }
      ],      
      "@react-native-google-signin/google-signin",
      "expo-apple-authentication"
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true
    },
    extra: {
      router: {
        origin: false
      },
      eas: {
        projectId: "f438370b-8c69-4d6e-bb2e-a8c67823cd0d"
      }
    }
  }
};