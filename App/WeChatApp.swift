import SwiftUI

@main
struct WeChatApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @StateObject private var sessionManager = SessionManager.shared
    @AppStorage("themeMode") private var themeMode: String = "dark"

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(sessionManager)
                .frame(minWidth: 800, minHeight: 500)
                .preferredColorScheme(colorSchemeFor(themeMode))
                .onAppear {
                    configureWindowAppearance()
                }
        }
        .windowStyle(.hiddenTitleBar)
        .defaultSize(width: 960, height: 680)
        .commands {
            CommandGroup(replacing: .newItem) {}
        }

        Window("Settings", id: "settings") {
            SettingsWindow()
                .environmentObject(sessionManager)
                .preferredColorScheme(colorSchemeFor(themeMode))
        }
        .defaultSize(width: 780, height: 560)
    }

    private func colorSchemeFor(_ mode: String) -> ColorScheme? {
        switch mode {
        case "light": return .light
        case "dark": return .dark
        default: return nil
        }
    }

    private func configureWindowAppearance() {
        if let window = NSApplication.shared.windows.first {
            window.titlebarAppearsTransparent = true
            window.titleVisibility = .hidden
            window.isMovableByWindowBackground = true
            window.backgroundColor = .clear
            window.isOpaque = false
        }
    }
}
