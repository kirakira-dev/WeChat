import SwiftUI
#if canImport(AppKit)
import AppKit
#endif

class AppSettings: ObservableObject {
    static let shared = AppSettings()
    private let ud = UserDefaults.standard

    @Published var themeMode: String { didSet { ud.set(themeMode, forKey: "themeMode"); applyTheme() } }
    @Published var customAccentR: Double { didSet { ud.set(customAccentR, forKey: "customAccentR") } }
    @Published var customAccentG: Double { didSet { ud.set(customAccentG, forKey: "customAccentG") } }
    @Published var customAccentB: Double { didSet { ud.set(customAccentB, forKey: "customAccentB") } }
    @Published var customBubbleR: Double { didSet { ud.set(customBubbleR, forKey: "customBubbleR") } }
    @Published var customBubbleG: Double { didSet { ud.set(customBubbleG, forKey: "customBubbleG") } }
    @Published var customBubbleB: Double { didSet { ud.set(customBubbleB, forKey: "customBubbleB") } }
    @Published var customBgR: Double { didSet { ud.set(customBgR, forKey: "customBgR") } }
    @Published var customBgG: Double { didSet { ud.set(customBgG, forKey: "customBgG") } }
    @Published var customBgB: Double { didSet { ud.set(customBgB, forKey: "customBgB") } }
    @Published var fontSize: Double { didSet { ud.set(fontSize, forKey: "fontSize") } }
    @Published var avatarStyle: String { didSet { ud.set(avatarStyle, forKey: "avatarStyle") } }
    @Published var messageDensity: String { didSet { ud.set(messageDensity, forKey: "messageDensity") } }
    @Published var showAvatarsInChat: Bool { didSet { ud.set(showAvatarsInChat, forKey: "showAvatarsInChat") } }

    @Published var language: String { didSet { ud.set(language, forKey: "language") } }
    @Published var launchAtLogin: Bool { didSet { ud.set(launchAtLogin, forKey: "launchAtLogin"); applyLaunchAtLogin() } }
    @Published var showDockBadge: Bool { didSet { ud.set(showDockBadge, forKey: "showDockBadge"); applyDockBadge() } }
    @Published var confirmBeforeQuit: Bool { didSet { ud.set(confirmBeforeQuit, forKey: "confirmBeforeQuit") } }
    @Published var defaultTab: String { didSet { ud.set(defaultTab, forKey: "defaultTab") } }
    @Published var soundEnabled: Bool { didSet { ud.set(soundEnabled, forKey: "soundEnabled") } }
    @Published var notificationStyle: String { didSet { ud.set(notificationStyle, forKey: "notificationStyle") } }
    @Published var autoSwitchToNewChat: Bool { didSet { ud.set(autoSwitchToNewChat, forKey: "autoSwitchToNewChat") } }
    @Published var showMessagePreview: Bool { didSet { ud.set(showMessagePreview, forKey: "showMessagePreview") } }
    @Published var keepWindowOnTop: Bool { didSet { ud.set(keepWindowOnTop, forKey: "keepWindowOnTop"); applyWindowLevel() } }
    @Published var minimizeToTray: Bool { didSet { ud.set(minimizeToTray, forKey: "minimizeToTray") } }
    @Published var openLinksInApp: Bool { didSet { ud.set(openLinksInApp, forKey: "openLinksInApp") } }

    @Published var sendWithReturn: Bool { didSet { ud.set(sendWithReturn, forKey: "sendWithReturn") } }
    @Published var showTimestamps: Bool { didSet { ud.set(showTimestamps, forKey: "showTimestamps") } }
    @Published var showReadReceipts: Bool { didSet { ud.set(showReadReceipts, forKey: "showReadReceipts") } }
    @Published var autoPlayVoice: Bool { didSet { ud.set(autoPlayVoice, forKey: "autoPlayVoice") } }
    @Published var autoDownloadImages: Bool { didSet { ud.set(autoDownloadImages, forKey: "autoDownloadImages") } }
    @Published var autoDownloadFiles: Bool { didSet { ud.set(autoDownloadFiles, forKey: "autoDownloadFiles") } }
    @Published var maxImagePreviewSize: Int { didSet { ud.set(maxImagePreviewSize, forKey: "maxImagePreviewSize") } }
    @Published var chatHistoryLimit: Int { didSet { ud.set(chatHistoryLimit, forKey: "chatHistoryLimit") } }

    @Published var showOnlineStatus: Bool { didSet { ud.set(showOnlineStatus, forKey: "showOnlineStatus") } }
    @Published var allowStrangerMessages: Bool { didSet { ud.set(allowStrangerMessages, forKey: "allowStrangerMessages") } }
    @Published var hideTypingIndicator: Bool { didSet { ud.set(hideTypingIndicator, forKey: "hideTypingIndicator") } }
    @Published var blurMediaInList: Bool { didSet { ud.set(blurMediaInList, forKey: "blurMediaInList") } }
    @Published var lockAppWithPassword: Bool { didSet { ud.set(lockAppWithPassword, forKey: "lockAppWithPassword") } }

    @Published var muteAll: Bool { didSet { ud.set(muteAll, forKey: "muteAll") } }
    @Published var groupNotifications: Bool { didSet { ud.set(groupNotifications, forKey: "groupNotifications") } }
    @Published var mentionNotifications: Bool { didSet { ud.set(mentionNotifications, forKey: "mentionNotifications") } }
    @Published var doNotDisturbEnabled: Bool { didSet { ud.set(doNotDisturbEnabled, forKey: "doNotDisturbEnabled") } }
    @Published var doNotDisturbStart: String { didSet { ud.set(doNotDisturbStart, forKey: "doNotDisturbStart") } }
    @Published var doNotDisturbEnd: String { didSet { ud.set(doNotDisturbEnd, forKey: "doNotDisturbEnd") } }

    @Published var enableDebugLog: Bool { didSet { ud.set(enableDebugLog, forKey: "enableDebugLog") } }
    @Published var proxyEnabled: Bool { didSet { ud.set(proxyEnabled, forKey: "proxyEnabled") } }
    @Published var proxyHost: String { didSet { ud.set(proxyHost, forKey: "proxyHost") } }
    @Published var proxyPort: Int { didSet { ud.set(proxyPort, forKey: "proxyPort") } }
    @Published var proxyType: String { didSet { ud.set(proxyType, forKey: "proxyType") } }
    @Published var useSystemProxy: Bool { didSet { ud.set(useSystemProxy, forKey: "useSystemProxy") } }
    @Published var maxConcurrentDownloads: Int { didSet { ud.set(maxConcurrentDownloads, forKey: "maxConcurrentDownloads") } }
    @Published var databaseCacheSize: Int { didSet { ud.set(databaseCacheSize, forKey: "databaseCacheSize") } }
    @Published var autoCleanTempFiles: Bool { didSet { ud.set(autoCleanTempFiles, forKey: "autoCleanTempFiles") } }
    @Published var tempFileRetentionDays: Int { didSet { ud.set(tempFileRetentionDays, forKey: "tempFileRetentionDays") } }
    @Published var networkTimeout: Int { didSet { ud.set(networkTimeout, forKey: "networkTimeout") } }
    @Published var enableHardwareAcceleration: Bool { didSet { ud.set(enableHardwareAcceleration, forKey: "enableHardwareAcceleration") } }
    @Published var reduceMotion: Bool { didSet { ud.set(reduceMotion, forKey: "reduceMotion") } }
    @Published var experimentalMarkdown: Bool { didSet { ud.set(experimentalMarkdown, forKey: "experimentalMarkdown") } }
    @Published var enableSpellCheck: Bool { didSet { ud.set(enableSpellCheck, forKey: "enableSpellCheck") } }
    @Published var developerMode: Bool { didSet { ud.set(developerMode, forKey: "developerMode") } }
    @Published var exportFormat: String { didSet { ud.set(exportFormat, forKey: "exportFormat") } }

    var customAccentColor: Color { Color(red: customAccentR, green: customAccentG, blue: customAccentB) }
    var customBubbleColor: Color { Color(red: customBubbleR, green: customBubbleG, blue: customBubbleB) }
    var customBackgroundColor: Color { Color(red: customBgR, green: customBgG, blue: customBgB) }

    var preferredColorScheme: ColorScheme? {
        switch themeMode {
        case "light": return .light
        case "dark": return .dark
        default: return nil
        }
    }

    var messagePadding: CGFloat {
        switch messageDensity {
        case "compact": return 2
        case "comfortable": return 8
        default: return 4
        }
    }

    var avatarCornerFraction: CGFloat {
        switch avatarStyle {
        case "circle": return 0.5
        case "square": return 0.06
        default: return 0.18
        }
    }

    private init() {
        ud.register(defaults: [
            "themeMode": "dark",
            "customAccentR": 0.07, "customAccentG": 0.73, "customAccentB": 0.33,
            "customBubbleR": 0.58, "customBubbleG": 0.87, "customBubbleB": 0.34,
            "customBgR": 0.12, "customBgG": 0.12, "customBgB": 0.12,
            "fontSize": 13.0, "avatarStyle": "rounded", "messageDensity": "normal",
            "showAvatarsInChat": true,
            "language": "system", "launchAtLogin": false, "showDockBadge": true,
            "confirmBeforeQuit": false, "defaultTab": "chats", "soundEnabled": true,
            "notificationStyle": "banner", "autoSwitchToNewChat": true,
            "showMessagePreview": true, "keepWindowOnTop": false,
            "minimizeToTray": false, "openLinksInApp": false,
            "sendWithReturn": true, "showTimestamps": true, "showReadReceipts": true,
            "autoPlayVoice": false, "autoDownloadImages": true, "autoDownloadFiles": false,
            "maxImagePreviewSize": 200, "chatHistoryLimit": 200,
            "showOnlineStatus": true, "allowStrangerMessages": false,
            "hideTypingIndicator": false, "blurMediaInList": false, "lockAppWithPassword": false,
            "muteAll": false, "groupNotifications": true, "mentionNotifications": true,
            "doNotDisturbEnabled": false, "doNotDisturbStart": "22:00", "doNotDisturbEnd": "08:00",
            "enableDebugLog": false, "proxyEnabled": false, "proxyHost": "",
            "proxyPort": 1080, "proxyType": "SOCKS5", "useSystemProxy": true,
            "maxConcurrentDownloads": 3, "databaseCacheSize": 50,
            "autoCleanTempFiles": true, "tempFileRetentionDays": 7,
            "networkTimeout": 30, "enableHardwareAcceleration": true,
            "reduceMotion": false, "experimentalMarkdown": false,
            "enableSpellCheck": true, "developerMode": false, "exportFormat": "json"
        ])

        themeMode = ud.string(forKey: "themeMode") ?? "dark"
        customAccentR = ud.double(forKey: "customAccentR")
        customAccentG = ud.double(forKey: "customAccentG")
        customAccentB = ud.double(forKey: "customAccentB")
        customBubbleR = ud.double(forKey: "customBubbleR")
        customBubbleG = ud.double(forKey: "customBubbleG")
        customBubbleB = ud.double(forKey: "customBubbleB")
        customBgR = ud.double(forKey: "customBgR")
        customBgG = ud.double(forKey: "customBgG")
        customBgB = ud.double(forKey: "customBgB")
        fontSize = ud.double(forKey: "fontSize")
        avatarStyle = ud.string(forKey: "avatarStyle") ?? "rounded"
        messageDensity = ud.string(forKey: "messageDensity") ?? "normal"
        showAvatarsInChat = ud.bool(forKey: "showAvatarsInChat")
        language = ud.string(forKey: "language") ?? "system"
        launchAtLogin = ud.bool(forKey: "launchAtLogin")
        showDockBadge = ud.bool(forKey: "showDockBadge")
        confirmBeforeQuit = ud.bool(forKey: "confirmBeforeQuit")
        defaultTab = ud.string(forKey: "defaultTab") ?? "chats"
        soundEnabled = ud.bool(forKey: "soundEnabled")
        notificationStyle = ud.string(forKey: "notificationStyle") ?? "banner"
        autoSwitchToNewChat = ud.bool(forKey: "autoSwitchToNewChat")
        showMessagePreview = ud.bool(forKey: "showMessagePreview")
        keepWindowOnTop = ud.bool(forKey: "keepWindowOnTop")
        minimizeToTray = ud.bool(forKey: "minimizeToTray")
        openLinksInApp = ud.bool(forKey: "openLinksInApp")
        sendWithReturn = ud.bool(forKey: "sendWithReturn")
        showTimestamps = ud.bool(forKey: "showTimestamps")
        showReadReceipts = ud.bool(forKey: "showReadReceipts")
        autoPlayVoice = ud.bool(forKey: "autoPlayVoice")
        autoDownloadImages = ud.bool(forKey: "autoDownloadImages")
        autoDownloadFiles = ud.bool(forKey: "autoDownloadFiles")
        maxImagePreviewSize = ud.integer(forKey: "maxImagePreviewSize")
        chatHistoryLimit = ud.integer(forKey: "chatHistoryLimit")
        showOnlineStatus = ud.bool(forKey: "showOnlineStatus")
        allowStrangerMessages = ud.bool(forKey: "allowStrangerMessages")
        hideTypingIndicator = ud.bool(forKey: "hideTypingIndicator")
        blurMediaInList = ud.bool(forKey: "blurMediaInList")
        lockAppWithPassword = ud.bool(forKey: "lockAppWithPassword")
        muteAll = ud.bool(forKey: "muteAll")
        groupNotifications = ud.bool(forKey: "groupNotifications")
        mentionNotifications = ud.bool(forKey: "mentionNotifications")
        doNotDisturbEnabled = ud.bool(forKey: "doNotDisturbEnabled")
        doNotDisturbStart = ud.string(forKey: "doNotDisturbStart") ?? "22:00"
        doNotDisturbEnd = ud.string(forKey: "doNotDisturbEnd") ?? "08:00"
        enableDebugLog = ud.bool(forKey: "enableDebugLog")
        proxyEnabled = ud.bool(forKey: "proxyEnabled")
        proxyHost = ud.string(forKey: "proxyHost") ?? ""
        proxyPort = ud.integer(forKey: "proxyPort")
        proxyType = ud.string(forKey: "proxyType") ?? "SOCKS5"
        useSystemProxy = ud.bool(forKey: "useSystemProxy")
        maxConcurrentDownloads = ud.integer(forKey: "maxConcurrentDownloads")
        databaseCacheSize = ud.integer(forKey: "databaseCacheSize")
        autoCleanTempFiles = ud.bool(forKey: "autoCleanTempFiles")
        tempFileRetentionDays = ud.integer(forKey: "tempFileRetentionDays")
        networkTimeout = ud.integer(forKey: "networkTimeout")
        enableHardwareAcceleration = ud.bool(forKey: "enableHardwareAcceleration")
        reduceMotion = ud.bool(forKey: "reduceMotion")
        experimentalMarkdown = ud.bool(forKey: "experimentalMarkdown")
        enableSpellCheck = ud.bool(forKey: "enableSpellCheck")
        developerMode = ud.bool(forKey: "developerMode")
        exportFormat = ud.string(forKey: "exportFormat") ?? "json"
    }

    func applyTheme() {
        #if canImport(AppKit)
        DispatchQueue.main.async {
            switch self.themeMode {
            case "light": NSApp.appearance = NSAppearance(named: .aqua)
            case "dark", "custom": NSApp.appearance = NSAppearance(named: .darkAqua)
            default: NSApp.appearance = nil
            }
        }
        #endif
    }

    func applyWindowLevel() {
        #if canImport(AppKit)
        DispatchQueue.main.async {
            NSApp.windows.first?.level = self.keepWindowOnTop ? .floating : .normal
        }
        #endif
    }

    func applyDockBadge() {
        #if canImport(AppKit)
        if !showDockBadge {
            NSApp.dockTile.badgeLabel = nil
        }
        #endif
    }

    func applyLaunchAtLogin() {
        #if canImport(AppKit)
        if #available(macOS 13.0, *) {}
        #endif
    }

    func applyAllSettings() {
        applyTheme()
        applyWindowLevel()
        applyDockBadge()
    }

    func resetAllSettings() {
        let domain = Bundle.main.bundleIdentifier ?? "com.tencent.xinWeChat"
        ud.removePersistentDomain(forName: domain)
        ud.synchronize()

        let fresh = AppSettings()
        let mirror = Mirror(reflecting: fresh)
        for child in mirror.children {
            guard let label = child.label?.replacingOccurrences(of: "_", with: "") else { continue }
            if let val = child.value as? String { ud.set(val, forKey: label) }
            else if let val = child.value as? Bool { ud.set(val, forKey: label) }
            else if let val = child.value as? Double { ud.set(val, forKey: label) }
            else if let val = child.value as? Int { ud.set(val, forKey: label) }
        }

        themeMode = "dark"
        fontSize = 13
        avatarStyle = "rounded"
        messageDensity = "normal"
        showAvatarsInChat = true
        sendWithReturn = true
        showTimestamps = true
        chatHistoryLimit = 200
        keepWindowOnTop = false
        showDockBadge = true
        enableSpellCheck = true
        applyAllSettings()
    }
}
