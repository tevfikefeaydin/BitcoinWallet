import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  private var privacyShield: UIView?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    window = UIWindow(frame: UIScreen.main.bounds)

    factory.startReactNative(
      withModuleName: "BTCWalletMobile",
      in: window,
      launchOptions: launchOptions
    )

#if !DEBUG
    // Ekran kaydı / AirPlay yansıtma sırasında içerik gizlenir (Android FLAG_SECURE karşılığı).
    // Debug derlemelerinde geliştirme sırasında ekran paylaşımı engellenmesin diye kapalıdır.
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(screenCaptureDidChange),
      name: UIScreen.capturedDidChangeNotification,
      object: nil
    )
    updatePrivacyShield(inactive: false)
#endif

    return true
  }

  // MARK: - Gizlilik perdesi

  /// Uygulama değiştirici önizlemesine mnemonic, bakiye veya adres düşmesin.
  func applicationWillResignActive(_ application: UIApplication) {
    updatePrivacyShield(inactive: true)
  }

  func applicationDidBecomeActive(_ application: UIApplication) {
    updatePrivacyShield(inactive: false)
  }

  @objc private func screenCaptureDidChange() {
    updatePrivacyShield(inactive: UIApplication.shared.applicationState != .active)
  }

  private func updatePrivacyShield(inactive: Bool) {
#if DEBUG
    let captured = false
#else
    let captured = UIScreen.main.isCaptured
#endif
    guard inactive || captured else {
      privacyShield?.removeFromSuperview()
      privacyShield = nil
      return
    }
    guard privacyShield == nil, let window = window else { return }

    let shield = UIView(frame: window.bounds)
    shield.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    shield.backgroundColor = UIColor(red: 7 / 255, green: 10 / 255, blue: 15 / 255, alpha: 1)

    let title = UILabel()
    title.text = "BTC Wallet"
    title.textColor = UIColor(red: 244 / 255, green: 247 / 255, blue: 251 / 255, alpha: 1)
    title.font = .systemFont(ofSize: 28, weight: .heavy)
    title.translatesAutoresizingMaskIntoConstraints = false
    shield.addSubview(title)
    NSLayoutConstraint.activate([
      title.centerXAnchor.constraint(equalTo: shield.centerXAnchor),
      title.centerYAnchor.constraint(equalTo: shield.centerYAnchor),
    ])

    window.addSubview(shield)
    privacyShield = shield
  }

  // MARK: - Klavye

  /// Üçüncü taraf klavyeler kurtarma ifadesini ve PIN'i görebilir; yalnızca sistem klavyesine izin ver.
  func application(
    _ application: UIApplication,
    shouldAllowExtensionPointIdentifier extensionPointIdentifier: UIApplication.ExtensionPointIdentifier
  ) -> Bool {
    extensionPointIdentifier != .keyboard
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
