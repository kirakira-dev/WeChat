import SwiftUI

enum SettingsTab: String, CaseIterable, Identifiable {
    case general = "General"
    case appearance = "Appearance"
    case account = "Account"
    case chat = "Chat"
    case notifications = "Notifications"
    case privacy = "Privacy & Security"
    case storage = "Storage & Data"
    case shortcuts = "Keyboard Shortcuts"
    case network = "Network"
    case advanced = "Advanced"

    var id: String { rawValue }

    var icon: String {
        switch self {
        case .general: return "gearshape"
        case .appearance: return "paintbrush"
        case .account: return "person.circle"
        case .chat: return "bubble.left.and.bubble.right"
        case .notifications: return "bell"
        case .privacy: return "lock.shield"
        case .storage: return "externaldrive"
        case .shortcuts: return "keyboard"
        case .network: return "wifi"
        case .advanced: return "wrench.and.screwdriver"
        }
    }
}

struct SettingsWindow: View {
    @ObservedObject private var settings = AppSettings.shared
    @EnvironmentObject var session: SessionManager
    @State private var selectedTab: SettingsTab = .general

    var body: some View {
        NavigationSplitView {
            List(SettingsTab.allCases, selection: $selectedTab) { tab in
                Label(tab.rawValue, systemImage: tab.icon)
                    .tag(tab)
            }
            .listStyle(.sidebar)
            .frame(minWidth: 180)
        } detail: {
            ScrollView {
                detailContent
                    .padding(24)
                    .frame(maxWidth: 600, alignment: .leading)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color(nsColor: .windowBackgroundColor))
        }
        .frame(minWidth: 720, minHeight: 500)
        .frame(idealWidth: 780, idealHeight: 560)
    }

    @ViewBuilder
    private var detailContent: some View {
        switch selectedTab {
        case .general: GeneralSettingsView(settings: settings)
        case .appearance: AppearanceSettingsView(settings: settings)
        case .account: AccountSettingsView(settings: settings, session: session)
        case .chat: ChatSettingsView(settings: settings)
        case .notifications: NotificationSettingsView(settings: settings)
        case .privacy: PrivacySettingsView(settings: settings)
        case .storage: StorageSettingsView(settings: settings, session: session)
        case .shortcuts: ShortcutsSettingsView()
        case .network: NetworkSettingsView(settings: settings)
        case .advanced: AdvancedSettingsView(settings: settings)
        }
    }
}

struct SettingsSectionHeader: View {
    let title: String
    var body: some View {
        Text(title)
            .font(.system(size: 13, weight: .semibold))
            .foregroundColor(.primary)
            .padding(.top, 12)
            .padding(.bottom, 4)
    }
}

struct SettingsDescription: View {
    let text: String
    var body: some View {
        Text(text)
            .font(.system(size: 11))
            .foregroundColor(.secondary)
            .padding(.bottom, 4)
    }
}

struct GeneralSettingsView: View {
    @ObservedObject var settings: AppSettings

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("General")
                .font(.system(size: 20, weight: .semibold))

            GroupBox {
                VStack(alignment: .leading, spacing: 12) {
                    SettingsSectionHeader(title: "Startup")
                    Toggle("Launch WeChat at login", isOn: $settings.launchAtLogin)
                    Toggle("Confirm before quitting", isOn: $settings.confirmBeforeQuit)

                    HStack {
                        Text("Default tab on launch")
                        Spacer()
                        Picker("", selection: $settings.defaultTab) {
                            Text("Chats").tag("chats")
                            Text("Contacts").tag("contacts")
                        }
                        .frame(width: 140)
                    }
                }
                .padding(8)
            }

            GroupBox {
                VStack(alignment: .leading, spacing: 12) {
                    SettingsSectionHeader(title: "Behavior")
                    Toggle("Show unread count on Dock icon", isOn: $settings.showDockBadge)
                    Toggle("Auto-switch to new incoming chat", isOn: $settings.autoSwitchToNewChat)
                    Toggle("Keep window on top of other apps", isOn: $settings.keepWindowOnTop)
                    Toggle("Minimize to menu bar instead of Dock", isOn: $settings.minimizeToTray)
                    Toggle("Open links inside app", isOn: $settings.openLinksInApp)
                }
                .padding(8)
            }

            GroupBox {
                VStack(alignment: .leading, spacing: 12) {
                    SettingsSectionHeader(title: "Language")

                    HStack {
                        Text("Interface language")
                        Spacer()
                        Picker("", selection: $settings.language) {
                            Text("System Default").tag("system")
                            Text("English").tag("en")
                            Text("Chinese (Simplified)").tag("zh-Hans")
                            Text("Chinese (Traditional)").tag("zh-Hant")
                            Text("Japanese").tag("ja")
                            Text("Korean").tag("ko")
                        }
                        .frame(width: 180)
                    }

                    SettingsDescription(text: "Restart the app after changing language.")
                }
                .padding(8)
            }

            GroupBox {
                VStack(alignment: .leading, spacing: 12) {
                    SettingsSectionHeader(title: "Sound")
                    Toggle("Enable sound effects", isOn: $settings.soundEnabled)

                    HStack {
                        Text("Notification style")
                        Spacer()
                        Picker("", selection: $settings.notificationStyle) {
                            Text("Banner").tag("banner")
                            Text("Alert").tag("alert")
                            Text("None").tag("none")
                        }
                        .frame(width: 140)
                    }

                    Toggle("Show message preview in notifications", isOn: $settings.showMessagePreview)
                }
                .padding(8)
            }
        }
        .font(.system(size: 13))
    }
}

struct AppearanceSettingsView: View {
    @ObservedObject var settings: AppSettings
    @State private var accentColor: Color
    @State private var bubbleColor: Color
    @State private var bgColor: Color

    init(settings: AppSettings) {
        self.settings = settings
        _accentColor = State(initialValue: settings.customAccentColor)
        _bubbleColor = State(initialValue: settings.customBubbleColor)
        _bgColor = State(initialValue: settings.customBackgroundColor)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Appearance")
                .font(.system(size: 20, weight: .semibold))

            GroupBox {
                VStack(alignment: .leading, spacing: 12) {
                    SettingsSectionHeader(title: "Theme")

                    Picker("Mode", selection: $settings.themeMode) {
                        Text("Light").tag("light")
                        Text("Dark").tag("dark")
                        Text("Custom").tag("custom")
                    }
                    .pickerStyle(.segmented)

                    if settings.themeMode == "custom" {
                        Divider()
                        SettingsDescription(text: "Customize colors for the Custom theme. Uses dark mode as base.")

                        HStack {
                            Text("Accent color")
                            Spacer()
                            ColorPicker("", selection: $accentColor, supportsOpacity: false)
                                .onChange(of: accentColor) { newVal in
                                    if let comps = NSColor(newVal).usingColorSpace(.sRGB) {
                                        settings.customAccentR = Double(comps.redComponent)
                                        settings.customAccentG = Double(comps.greenComponent)
                                        settings.customAccentB = Double(comps.blueComponent)
                                    }
                                }
                        }

                        HStack {
                            Text("My bubble color")
                            Spacer()
                            ColorPicker("", selection: $bubbleColor, supportsOpacity: false)
                                .onChange(of: bubbleColor) { newVal in
                                    if let comps = NSColor(newVal).usingColorSpace(.sRGB) {
                                        settings.customBubbleR = Double(comps.redComponent)
                                        settings.customBubbleG = Double(comps.greenComponent)
                                        settings.customBubbleB = Double(comps.blueComponent)
                                    }
                                }
                        }

                        HStack {
                            Text("Chat background")
                            Spacer()
                            ColorPicker("", selection: $bgColor, supportsOpacity: false)
                                .onChange(of: bgColor) { newVal in
                                    if let comps = NSColor(newVal).usingColorSpace(.sRGB) {
                                        settings.customBgR = Double(comps.redComponent)
                                        settings.customBgG = Double(comps.greenComponent)
                                        settings.customBgB = Double(comps.blueComponent)
                                    }
                                }
                        }

                        HStack(spacing: 12) {
                            Text("Preview:")
                                .foregroundColor(.secondary)
                            RoundedRectangle(cornerRadius: 6)
                                .fill(bgColor)
                                .frame(width: 40, height: 28)
                                .overlay(RoundedRectangle(cornerRadius: 6).stroke(Color.gray.opacity(0.3)))
                            RoundedRectangle(cornerRadius: 6)
                                .fill(bubbleColor)
                                .frame(width: 40, height: 28)
                            RoundedRectangle(cornerRadius: 6)
                                .fill(accentColor)
                                .frame(width: 40, height: 28)
                        }
                    }
                }
                .padding(8)
            }

            GroupBox {
                VStack(alignment: .leading, spacing: 12) {
                    SettingsSectionHeader(title: "Font & Layout")

                    HStack {
                        Text("Message font size")
                        Spacer()
                        Text("\(Int(settings.fontSize)) pt")
                            .foregroundColor(.secondary)
                            .frame(width: 40, alignment: .trailing)
                        Slider(value: $settings.fontSize, in: 10...20, step: 1)
                            .frame(width: 160)
                    }

                    Text("The quick brown fox jumps over the lazy dog")
                        .font(.system(size: settings.fontSize))
                        .padding(8)
                        .background(RoundedRectangle(cornerRadius: 6).fill(Color.gray.opacity(0.1)))

                    Divider()

                    HStack {
                        Text("Avatar shape")
                        Spacer()
                        Picker("", selection: $settings.avatarStyle) {
                            Text("Rounded").tag("rounded")
                            Text("Circle").tag("circle")
                            Text("Square").tag("square")
                        }
                        .frame(width: 140)
                    }

                    HStack {
                        Text("Message density")
                        Spacer()
                        Picker("", selection: $settings.messageDensity) {
                            Text("Compact").tag("compact")
                            Text("Normal").tag("normal")
                            Text("Comfortable").tag("comfortable")
                        }
                        .frame(width: 140)
                    }

                    Toggle("Show avatars in chat", isOn: $settings.showAvatarsInChat)
                }
                .padding(8)
            }
        }
        .font(.system(size: 13))
    }
}

struct AccountSettingsView: View {
    @ObservedObject var settings: AppSettings
    @ObservedObject var session: SessionManager

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Account")
                .font(.system(size: 20, weight: .semibold))

            GroupBox {
                VStack(alignment: .leading, spacing: 12) {
                    SettingsSectionHeader(title: "Current Account")

                    HStack(spacing: 14) {
                        let selfContact = session.contact(for: session.dataReader.wxid)
                        AvatarView(
                            url: selfContact?.avatarURL ?? "",
                            size: 56,
                            fallbackName: selfContact?.displayName ?? session.dataReader.wxid
                        )
                        VStack(alignment: .leading, spacing: 4) {
                            Text(selfContact?.displayName ?? "Unknown")
                                .font(.system(size: 16, weight: .medium))
                            Text("WeChat ID: \(session.dataReader.wxid)")
                                .font(.system(size: 11, design: .monospaced))
                                .foregroundColor(.secondary)
                                .textSelection(.enabled)
                            if let sig = selfContact?.signature, !sig.isEmpty {
                                Text(sig)
                                    .font(.system(size: 11))
                                    .foregroundColor(.secondary)
                            }
                        }
                    }
                }
                .padding(8)
            }

            GroupBox {
                VStack(alignment: .leading, spacing: 12) {
                    SettingsSectionHeader(title: "Data Source")

                    HStack {
                        Text("Mode")
                        Spacer()
                        Text(session.dataSource == .localDB ? "Local Database" : session.dataSource == .webProtocol ? "Web Protocol" : "Not Connected")
                            .foregroundColor(.secondary)
                    }

                    HStack {
                        Text("DB Key Status")
                        Spacer()
                        Group {
                            switch session.dbKeyStatus {
                            case .ready: Text("Ready").foregroundColor(.green)
                            case .checking: Text("Checking...").foregroundColor(.orange)
                            case .extracting: Text("Extracting...").foregroundColor(.orange)
                            case .noKey: Text("No Keys").foregroundColor(.red)
                            case .failed(let msg): Text("Failed: \(msg)").foregroundColor(.red)
                            }
                        }
                        .font(.system(size: 12))
                    }
                }
                .padding(8)
            }

            GroupBox {
                VStack(alignment: .leading, spacing: 12) {
                    SettingsSectionHeader(title: "Statistics")
                    LabeledContent("Contacts") { Text("\(session.contacts.count)") }
                    LabeledContent("Conversations") { Text("\(session.chatSessions.count)") }
                    LabeledContent("Group Chats") { Text("\(session.groupContacts.count)") }
                    LabeledContent("Personal Contacts") { Text("\(session.personalContacts.count)") }
                }
                .padding(8)
            }

            GroupBox {
                VStack(alignment: .leading, spacing: 12) {
                    SettingsSectionHeader(title: "Key Cache")

                    HStack {
                        Text(session.dataReader.keysFilePath)
                            .font(.system(size: 11, design: .monospaced))
                            .foregroundColor(.secondary)
                            .lineLimit(1)
                            .truncationMode(.middle)
                        Spacer()
                        Button("Reveal") {
                            NSWorkspace.shared.selectFile(session.dataReader.keysFilePath, inFileViewerRootedAtPath: "")
                        }
                        .controlSize(.small)
                    }
                }
                .padding(8)
            }

            Button("Logout") {
                Task { await session.logout() }
            }
            .foregroundColor(.red)
        }
        .font(.system(size: 13))
    }
}

struct ChatSettingsView: View {
    @ObservedObject var settings: AppSettings

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Chat")
                .font(.system(size: 20, weight: .semibold))

            GroupBox {
                VStack(alignment: .leading, spacing: 12) {
                    SettingsSectionHeader(title: "Input")
                    Toggle("Press Return to send (Shift+Return for new line)", isOn: $settings.sendWithReturn)
                    SettingsDescription(text: "When disabled, Return inserts a new line and Shift+Return sends.")
                }
                .padding(8)
            }

            GroupBox {
                VStack(alignment: .leading, spacing: 12) {
                    SettingsSectionHeader(title: "Display")
                    Toggle("Show timestamps on messages", isOn: $settings.showTimestamps)
                    Toggle("Show read receipts", isOn: $settings.showReadReceipts)
                }
                .padding(8)
            }

            GroupBox {
                VStack(alignment: .leading, spacing: 12) {
                    SettingsSectionHeader(title: "Media")
                    Toggle("Auto-play voice messages", isOn: $settings.autoPlayVoice)
                    Toggle("Auto-download images", isOn: $settings.autoDownloadImages)
                    Toggle("Auto-download files", isOn: $settings.autoDownloadFiles)

                    HStack {
                        Text("Max image preview size")
                        Spacer()
                        Text("\(settings.maxImagePreviewSize) px")
                            .foregroundColor(.secondary)
                            .frame(width: 50, alignment: .trailing)
                        Slider(value: Binding(
                            get: { Double(settings.maxImagePreviewSize) },
                            set: { settings.maxImagePreviewSize = Int($0) }
                        ), in: 100...400, step: 50)
                        .frame(width: 160)
                    }
                }
                .padding(8)
            }

            GroupBox {
                VStack(alignment: .leading, spacing: 12) {
                    SettingsSectionHeader(title: "History")

                    HStack {
                        Text("Messages to load per conversation")
                        Spacer()
                        TextField("", value: $settings.chatHistoryLimit, format: .number)
                            .textFieldStyle(.roundedBorder)
                            .frame(width: 80)
                    }
                    SettingsDescription(text: "Higher values use more memory. Default: 200")
                }
                .padding(8)
            }
        }
        .font(.system(size: 13))
    }
}

struct NotificationSettingsView: View {
    @ObservedObject var settings: AppSettings

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Notifications")
                .font(.system(size: 20, weight: .semibold))

            GroupBox {
                VStack(alignment: .leading, spacing: 12) {
                    SettingsSectionHeader(title: "General")
                    Toggle("Mute all notifications", isOn: $settings.muteAll)

                    if !settings.muteAll {
                        Toggle("Group chat notifications", isOn: $settings.groupNotifications)
                        Toggle("Notify when mentioned in groups", isOn: $settings.mentionNotifications)

                        HStack {
                            Text("Notification style")
                            Spacer()
                            Picker("", selection: $settings.notificationStyle) {
                                Text("Banner").tag("banner")
                                Text("Alert").tag("alert")
                                Text("None").tag("none")
                            }
                            .frame(width: 140)
                        }

                        Toggle("Show message preview in notification", isOn: $settings.showMessagePreview)
                        Toggle("Play notification sound", isOn: $settings.soundEnabled)
                    }
                }
                .padding(8)
            }

            GroupBox {
                VStack(alignment: .leading, spacing: 12) {
                    SettingsSectionHeader(title: "Do Not Disturb")
                    Toggle("Enable Do Not Disturb schedule", isOn: $settings.doNotDisturbEnabled)

                    if settings.doNotDisturbEnabled {
                        HStack {
                            Text("From")
                            TextField("", text: $settings.doNotDisturbStart)
                                .textFieldStyle(.roundedBorder)
                                .frame(width: 70)
                            Text("to")
                            TextField("", text: $settings.doNotDisturbEnd)
                                .textFieldStyle(.roundedBorder)
                                .frame(width: 70)
                            Spacer()
                        }
                        SettingsDescription(text: "24-hour format (e.g. 22:00 to 08:00)")
                    }
                }
                .padding(8)
            }
        }
        .font(.system(size: 13))
    }
}

struct PrivacySettingsView: View {
    @ObservedObject var settings: AppSettings

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Privacy & Security")
                .font(.system(size: 20, weight: .semibold))

            GroupBox {
                VStack(alignment: .leading, spacing: 12) {
                    SettingsSectionHeader(title: "Visibility")
                    Toggle("Show online status to contacts", isOn: $settings.showOnlineStatus)
                    Toggle("Hide typing indicator", isOn: $settings.hideTypingIndicator)
                }
                .padding(8)
            }

            GroupBox {
                VStack(alignment: .leading, spacing: 12) {
                    SettingsSectionHeader(title: "Messages")
                    Toggle("Allow messages from strangers", isOn: $settings.allowStrangerMessages)
                    SettingsDescription(text: "When disabled, only contacts can send you messages.")
                }
                .padding(8)
            }

            GroupBox {
                VStack(alignment: .leading, spacing: 12) {
                    SettingsSectionHeader(title: "Media")
                    Toggle("Blur media thumbnails in chat list", isOn: $settings.blurMediaInList)
                    SettingsDescription(text: "Hides media previews in the conversation list for privacy.")
                }
                .padding(8)
            }

            GroupBox {
                VStack(alignment: .leading, spacing: 12) {
                    SettingsSectionHeader(title: "App Lock")
                    Toggle("Lock app with system password", isOn: $settings.lockAppWithPassword)
                    SettingsDescription(text: "Require macOS password when reopening the app after inactivity.")
                }
                .padding(8)
            }
        }
        .font(.system(size: 13))
    }
}

struct StorageSettingsView: View {
    @ObservedObject var settings: AppSettings
    @ObservedObject var session: SessionManager
    @State private var dbSizes: [(String, String)] = []

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Storage & Data")
                .font(.system(size: 20, weight: .semibold))

            GroupBox {
                VStack(alignment: .leading, spacing: 12) {
                    SettingsSectionHeader(title: "Database Location")

                    HStack {
                        Text(session.dataReader.dbBasePath)
                            .font(.system(size: 11, design: .monospaced))
                            .foregroundColor(.secondary)
                            .lineLimit(2)
                            .truncationMode(.middle)
                        Spacer()
                        Button("Open in Finder") {
                            NSWorkspace.shared.open(URL(fileURLWithPath: session.dataReader.dbBasePath))
                        }
                        .controlSize(.small)
                    }
                }
                .padding(8)
            }

            GroupBox {
                VStack(alignment: .leading, spacing: 12) {
                    SettingsSectionHeader(title: "Database Sizes")

                    ForEach(dbSizes, id: \.0) { name, size in
                        HStack {
                            Text(name)
                            Spacer()
                            Text(size)
                                .foregroundColor(.secondary)
                        }
                    }

                    if dbSizes.isEmpty {
                        Button("Scan Database Sizes") {
                            scanDBSizes()
                        }
                        .controlSize(.small)
                    }
                }
                .padding(8)
            }

            GroupBox {
                VStack(alignment: .leading, spacing: 12) {
                    SettingsSectionHeader(title: "Export")

                    HStack {
                        Text("Export format")
                        Spacer()
                        Picker("", selection: $settings.exportFormat) {
                            Text("JSON").tag("json")
                            Text("CSV").tag("csv")
                            Text("HTML").tag("html")
                        }
                        .frame(width: 120)
                    }

                    Button("Export Chat History...") {
                        exportChatHistory()
                    }
                    .controlSize(.small)
                }
                .padding(8)
            }

            GroupBox {
                VStack(alignment: .leading, spacing: 12) {
                    SettingsSectionHeader(title: "Cache")
                    Toggle("Auto-clean temporary files", isOn: $settings.autoCleanTempFiles)

                    HStack {
                        Text("Keep temp files for")
                        Spacer()
                        TextField("", value: $settings.tempFileRetentionDays, format: .number)
                            .textFieldStyle(.roundedBorder)
                            .frame(width: 60)
                        Text("days")
                    }

                    Button("Clear Avatar Cache") {
                        AvatarCache.shared.clearAll()
                    }
                    .controlSize(.small)
                }
                .padding(8)
            }
        }
        .font(.system(size: 13))
        .onAppear { scanDBSizes() }
    }

    private func scanDBSizes() {
        let fm = FileManager.default
        let paths: [(String, String)] = [
            ("contact.db", session.dataReader.contactDBPath),
            ("session.db", session.dataReader.sessionDBPath),
            ("message_0.db", session.dataReader.messageDBPath),
            ("head_image.db", session.dataReader.headImageDBPath),
            ("favorite.db", session.dataReader.favoriteDBPath),
            ("emoticon.db", session.dataReader.emoticonDBPath),
        ]
        dbSizes = paths.compactMap { name, path in
            guard let attrs = try? fm.attributesOfItem(atPath: path),
                  let size = attrs[.size] as? UInt64 else { return nil }
            return (name, ByteCountFormatter.string(fromByteCount: Int64(size), countStyle: .file))
        }
    }

    private func exportChatHistory() {
        let panel = NSSavePanel()
        panel.allowedContentTypes = [.json]
        panel.nameFieldStringValue = "wechat_export.\(settings.exportFormat)"
        panel.runModal()
    }
}

struct ShortcutsSettingsView: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Keyboard Shortcuts")
                .font(.system(size: 20, weight: .semibold))

            GroupBox {
                VStack(alignment: .leading, spacing: 10) {
                    SettingsSectionHeader(title: "Navigation")
                    shortcutRow("Open Settings", "Cmd + ,")
                    shortcutRow("Switch to Chats", "Cmd + 1")
                    shortcutRow("Switch to Contacts", "Cmd + 2")
                    shortcutRow("Switch to Favorites", "Cmd + 3")
                    shortcutRow("Search", "Cmd + F")
                }
                .padding(8)
            }

            GroupBox {
                VStack(alignment: .leading, spacing: 10) {
                    SettingsSectionHeader(title: "Chat")
                    shortcutRow("Send Message", "Return")
                    shortcutRow("New Line", "Shift + Return")
                    shortcutRow("Select Previous Chat", "Cmd + [")
                    shortcutRow("Select Next Chat", "Cmd + ]")
                    shortcutRow("Close Chat", "Cmd + W")
                }
                .padding(8)
            }

            GroupBox {
                VStack(alignment: .leading, spacing: 10) {
                    SettingsSectionHeader(title: "Actions")
                    shortcutRow("Attach File", "Cmd + Shift + A")
                    shortcutRow("Take Screenshot", "Cmd + Shift + S")
                    shortcutRow("Emoji Picker", "Cmd + E")
                    shortcutRow("Copy Message", "Cmd + C")
                    shortcutRow("Quit", "Cmd + Q")
                }
                .padding(8)
            }

            SettingsDescription(text: "Keyboard shortcuts are not customizable in this version.")
        }
        .font(.system(size: 13))
    }

    private func shortcutRow(_ label: String, _ keys: String) -> some View {
        HStack {
            Text(label)
            Spacer()
            Text(keys)
                .font(.system(size: 11, design: .monospaced))
                .foregroundColor(.secondary)
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(RoundedRectangle(cornerRadius: 4).fill(Color.gray.opacity(0.15)))
        }
    }
}

struct NetworkSettingsView: View {
    @ObservedObject var settings: AppSettings

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Network")
                .font(.system(size: 20, weight: .semibold))

            GroupBox {
                VStack(alignment: .leading, spacing: 12) {
                    SettingsSectionHeader(title: "Proxy")
                    Toggle("Use system proxy settings", isOn: $settings.useSystemProxy)

                    if !settings.useSystemProxy {
                        Toggle("Enable custom proxy", isOn: $settings.proxyEnabled)

                        if settings.proxyEnabled {
                            HStack {
                                Text("Type")
                                Spacer()
                                Picker("", selection: $settings.proxyType) {
                                    Text("SOCKS5").tag("SOCKS5")
                                    Text("HTTP").tag("HTTP")
                                    Text("HTTPS").tag("HTTPS")
                                }
                                .frame(width: 120)
                            }

                            HStack {
                                Text("Host")
                                Spacer()
                                TextField("127.0.0.1", text: $settings.proxyHost)
                                    .textFieldStyle(.roundedBorder)
                                    .frame(width: 180)
                            }

                            HStack {
                                Text("Port")
                                Spacer()
                                TextField("", value: $settings.proxyPort, format: .number)
                                    .textFieldStyle(.roundedBorder)
                                    .frame(width: 80)
                            }
                        }
                    }
                }
                .padding(8)
            }

            GroupBox {
                VStack(alignment: .leading, spacing: 12) {
                    SettingsSectionHeader(title: "Connection")

                    HStack {
                        Text("Network timeout")
                        Spacer()
                        TextField("", value: $settings.networkTimeout, format: .number)
                            .textFieldStyle(.roundedBorder)
                            .frame(width: 60)
                        Text("seconds")
                    }

                    HStack {
                        Text("Max concurrent downloads")
                        Spacer()
                        Stepper(value: $settings.maxConcurrentDownloads, in: 1...10) {
                            Text("\(settings.maxConcurrentDownloads)")
                                .frame(width: 30)
                        }
                    }
                }
                .padding(8)
            }
        }
        .font(.system(size: 13))
    }
}

struct AdvancedSettingsView: View {
    @ObservedObject var settings: AppSettings
    @State private var showResetConfirm = false

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Advanced")
                .font(.system(size: 20, weight: .semibold))

            GroupBox {
                VStack(alignment: .leading, spacing: 12) {
                    SettingsSectionHeader(title: "Performance")
                    Toggle("Enable hardware acceleration", isOn: $settings.enableHardwareAcceleration)
                    SettingsDescription(text: "Uses GPU for rendering. Disable if experiencing display issues.")
                    Toggle("Reduce motion and animations", isOn: $settings.reduceMotion)

                    HStack {
                        Text("Database cache size")
                        Spacer()
                        TextField("", value: $settings.databaseCacheSize, format: .number)
                            .textFieldStyle(.roundedBorder)
                            .frame(width: 60)
                        Text("MB")
                    }
                    SettingsDescription(text: "Memory allocated for database page cache.")
                }
                .padding(8)
            }

            GroupBox {
                VStack(alignment: .leading, spacing: 12) {
                    SettingsSectionHeader(title: "Text & Input")
                    Toggle("Enable spell checking", isOn: $settings.enableSpellCheck)
                    Toggle("Render Markdown in messages (experimental)", isOn: $settings.experimentalMarkdown)
                    SettingsDescription(text: "Renders **bold**, *italic*, `code`, and links in message text.")
                }
                .padding(8)
            }

            GroupBox {
                VStack(alignment: .leading, spacing: 12) {
                    SettingsSectionHeader(title: "Cleanup")
                    Toggle("Auto-clean temporary files", isOn: $settings.autoCleanTempFiles)

                    HStack {
                        Text("Keep temp files for")
                        Spacer()
                        TextField("", value: $settings.tempFileRetentionDays, format: .number)
                            .textFieldStyle(.roundedBorder)
                            .frame(width: 60)
                        Text("days")
                    }
                }
                .padding(8)
            }

            GroupBox {
                VStack(alignment: .leading, spacing: 12) {
                    SettingsSectionHeader(title: "Developer")
                    Toggle("Enable debug logging", isOn: $settings.enableDebugLog)
                    SettingsDescription(text: "Writes detailed logs to Console.app. May impact performance.")
                    Toggle("Developer mode", isOn: $settings.developerMode)
                    SettingsDescription(text: "Shows internal IDs, raw message data, and database queries.")

                    HStack {
                        Text("Export format")
                        Spacer()
                        Picker("", selection: $settings.exportFormat) {
                            Text("JSON").tag("json")
                            Text("CSV").tag("csv")
                            Text("HTML").tag("html")
                        }
                        .frame(width: 120)
                    }
                }
                .padding(8)
            }

            GroupBox {
                VStack(alignment: .leading, spacing: 12) {
                    SettingsSectionHeader(title: "Connection")

                    HStack {
                        Text("Network timeout")
                        Spacer()
                        TextField("", value: $settings.networkTimeout, format: .number)
                            .textFieldStyle(.roundedBorder)
                            .frame(width: 60)
                        Text("sec")
                    }

                    HStack {
                        Text("Max concurrent downloads")
                        Spacer()
                        Stepper(value: $settings.maxConcurrentDownloads, in: 1...10) {
                            Text("\(settings.maxConcurrentDownloads)")
                                .frame(width: 30)
                        }
                    }
                }
                .padding(8)
            }

            GroupBox {
                VStack(alignment: .leading, spacing: 12) {
                    SettingsSectionHeader(title: "Reset")

                    Button("Reset All Settings to Defaults") {
                        showResetConfirm = true
                    }
                    .foregroundColor(.red)
                    .alert("Reset All Settings?", isPresented: $showResetConfirm) {
                        Button("Cancel", role: .cancel) {}
                        Button("Reset", role: .destructive) {
                            settings.resetAllSettings()
                        }
                    } message: {
                        Text("This will reset all settings to their default values. This action cannot be undone.")
                    }

                    SettingsDescription(text: "Restores all preferences to factory defaults.")
                }
                .padding(8)
            }
        }
        .font(.system(size: 13))
    }
}
