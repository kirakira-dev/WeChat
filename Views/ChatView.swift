import SwiftUI

struct ChatView: View {
    @EnvironmentObject var session: SessionManager
    @ObservedObject private var settings = AppSettings.shared
    @State private var inputText = ""
    @State private var scrollProxy: ScrollViewProxy?
    @State private var showEmojiPicker = false
    @State private var showChatInfo = false

    private var chat: ChatSession? {
        session.selectedChat
    }

    var body: some View {
        VStack(spacing: 0) {
            chatHeader
            Color.divider.frame(height: 0.5)
            messagesArea
            Color.divider.frame(height: 0.5)
            inputArea
        }
        .background(Color.chatBackground)
    }

    private var chatHeader: some View {
        HStack {
            Color.clear.frame(height: 28)
                .overlay(
                    HStack {
                        Spacer()
                        Text(chat?.contact.displayName ?? "")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundColor(.chatHeaderText)
                        if let contact = chat?.contact, contact.isGroup {
                            Text("(\(contact.memberCount))")
                                .font(.system(size: 12))
                                .foregroundColor(.secondaryText)
                        }
                        Spacer()
                    }
                )

            HStack(spacing: 16) {
                Button(action: {}) {
                    Image(systemName: "phone.fill")
                        .font(.system(size: 14))
                        .foregroundColor(.secondaryText)
                }
                .buttonStyle(.plain)

                Button(action: {}) {
                    Image(systemName: "video.fill")
                        .font(.system(size: 14))
                        .foregroundColor(.secondaryText)
                }
                .buttonStyle(.plain)

                Button(action: { showChatInfo.toggle() }) {
                    Image(systemName: "ellipsis")
                        .font(.system(size: 14))
                        .foregroundColor(.secondaryText)
                }
                .buttonStyle(.plain)
                .popover(isPresented: $showChatInfo) {
                    chatInfoPopover
                }
            }
            .padding(.trailing, 16)
        }
        .frame(height: 52)
        .background(Color.chatBackground)
    }

    private var chatInfoPopover: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let contact = chat?.contact {
                HStack(spacing: 10) {
                    AvatarView(url: contact.avatarURL, size: 40, fallbackName: contact.displayName)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(contact.displayName)
                            .font(.system(size: 13, weight: .medium))
                        Text(contact.id)
                            .font(.system(size: 10, design: .monospaced))
                            .foregroundColor(.secondaryText)
                    }
                }
                if !contact.signature.isEmpty {
                    Text(contact.signature)
                        .font(.system(size: 11))
                        .foregroundColor(.secondaryText)
                }
                Divider()
                Text("Messages: \(chat?.messages.count ?? 0)")
                    .font(.system(size: 11))
                    .foregroundColor(.secondaryText)
            }
        }
        .padding(16)
        .frame(width: 240)
    }

    private var messagesArea: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: settings.messagePadding) {
                    ForEach(chat?.messages ?? []) { message in
                        MessageRow(message: message, contact: chat?.contact)
                            .environmentObject(session)
                            .id(message.id)
                    }
                }
                .padding(.vertical, 12)
                .padding(.horizontal, 16)
            }
            .onAppear {
                scrollProxy = proxy
                scrollToBottom(proxy: proxy)
            }
            .onChange(of: chat?.messages.count) { _ in
                if let proxy = scrollProxy {
                    scrollToBottom(proxy: proxy)
                }
            }
        }
    }

    private func scrollToBottom(proxy: ScrollViewProxy) {
        if let lastID = chat?.messages.last?.id {
            if settings.reduceMotion {
                proxy.scrollTo(lastID, anchor: .bottom)
            } else {
                withAnimation(.easeOut(duration: 0.2)) {
                    proxy.scrollTo(lastID, anchor: .bottom)
                }
            }
        }
    }

    private var inputArea: some View {
        VStack(spacing: 0) {
            HStack(spacing: 16) {
                InputToolButton(systemName: "face.smiling") {
                    showEmojiPicker.toggle()
                }
                .popover(isPresented: $showEmojiPicker) {
                    emojiPicker
                }

                InputToolButton(systemName: "paperclip") {
                    pickFile()
                }

                InputToolButton(systemName: "scissors") {
                    captureScreenshot()
                }

                InputToolButton(systemName: "ellipsis.circle") {}

                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 6)

            TextEditor(text: $inputText)
                .font(.system(size: settings.fontSize))
                .scrollContentBackground(.hidden)
                .background(Color.chatInputBackground)
                .frame(height: 80)
                .padding(.horizontal, 12)

            HStack {
                Spacer()

                if !inputText.isEmpty {
                    Text(settings.sendWithReturn
                         ? "Press Enter to send, Shift+Enter for new line"
                         : "Press Shift+Enter to send, Enter for new line")
                        .font(.system(size: 10))
                        .foregroundColor(.secondaryText)
                }

                if settings.sendWithReturn {
                    Button("Send") {
                        sendCurrentMessage()
                    }
                    .buttonStyle(SendButtonStyle())
                    .keyboardShortcut(.return, modifiers: [])
                    .disabled(inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                } else {
                    Button("Send") {
                        sendCurrentMessage()
                    }
                    .buttonStyle(SendButtonStyle())
                    .keyboardShortcut(.return, modifiers: .shift)
                    .disabled(inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 10)
        }
        .background(Color.chatInputBackground)
    }

    private var emojiPicker: some View {
        let emojis = ["😀","😂","🤣","😍","😘","🥰","😊","😎","🤔","😢",
                      "😭","😤","🥺","😱","😴","🤗","🤩","😇","🥳","😈",
                      "👍","👎","👋","🙏","💪","❤️","🔥","⭐","🎉","💯",
                      "👀","💔","😏","🙄","😳","🤦","🤷","💀","🫡","🫶"]
        return VStack(spacing: 0) {
            LazyVGrid(columns: Array(repeating: GridItem(.fixed(36)), count: 8), spacing: 4) {
                ForEach(emojis, id: \.self) { emoji in
                    Button(action: {
                        inputText += emoji
                        showEmojiPicker = false
                    }) {
                        Text(emoji)
                            .font(.system(size: 22))
                            .frame(width: 36, height: 36)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(12)
        }
        .frame(width: 320)
    }

    private func sendCurrentMessage() {
        let text = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        inputText = ""
        Task {
            await session.sendMessage(text: text)
        }
    }

    private func pickFile() {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false
        panel.canChooseFiles = true
        if panel.runModal() == .OK, let url = panel.url {
            guard let data = try? Data(contentsOf: url) else { return }
            let filename = url.lastPathComponent
            let imageExts = ["png", "jpg", "jpeg", "gif", "bmp", "webp"]
            if imageExts.contains(url.pathExtension.lowercased()) {
                Task { await session.sendImage(data: data, filename: filename) }
            } else {
                Task { await session.sendFile(data: data, filename: filename) }
            }
        }
    }

    private func captureScreenshot() {
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
        task.arguments = ["-i", "-c"]
        try? task.run()
        task.waitUntilExit()

        if let img = NSPasteboard.general.readObjects(forClasses: [NSImage.self])?.first as? NSImage,
           let tiff = img.tiffRepresentation,
           let bitmap = NSBitmapImageRep(data: tiff),
           let pngData = bitmap.representation(using: .png, properties: [:]) {
            Task { await session.sendImage(data: pngData, filename: "screenshot.png") }
        }
    }
}

struct MessageRow: View {
    @EnvironmentObject var session: SessionManager
    @ObservedObject private var settings = AppSettings.shared
    let message: WXMessage
    let contact: WXContact?

    var body: some View {
        if message.msgType == .system {
            systemMessage
        } else {
            chatMessage
        }
    }

    private var systemMessage: some View {
        Text(message.displayContent)
            .font(.system(size: 11))
            .foregroundColor(.secondaryText)
            .padding(.horizontal, 12)
            .padding(.vertical, 3)
            .background(
                RoundedRectangle(cornerRadius: 4)
                    .fill(Color.systemMsgBackground)
            )
            .frame(maxWidth: .infinity, alignment: .center)
            .padding(.vertical, 4)
    }

    private var chatMessage: some View {
        HStack(alignment: .top, spacing: 8) {
            if message.isFromSelf {
                Spacer(minLength: 60)
                messageBubble
                if settings.showAvatarsInChat {
                    senderAvatar
                }
            } else {
                if settings.showAvatarsInChat {
                    senderAvatar
                }
                messageBubble
                Spacer(minLength: 60)
            }
        }
        .padding(.vertical, settings.messagePadding)
    }

    private var senderAvatar: some View {
        let senderContact = session.contact(for: message.fromUser)
        return AvatarView(
            url: message.isFromSelf
                ? (session.contact(for: session.dataReader.wxid)?.avatarURL ?? "")
                : (senderContact?.avatarURL ?? contact?.avatarURL ?? ""),
            size: 36,
            fallbackName: message.isFromSelf
                ? "Me"
                : (senderContact?.displayName ?? contact?.displayName ?? "?")
        )
    }

    @ViewBuilder
    private var messageBubble: some View {
        VStack(alignment: message.isFromSelf ? .trailing : .leading, spacing: 2) {
            if !message.isFromSelf, let c = contact, c.isGroup {
                Text(resolvedSenderName)
                    .font(.system(size: 11))
                    .foregroundColor(.secondaryText)
            }

            HStack(spacing: 0) {
                if message.isFromSelf {
                    Spacer(minLength: 0)
                }

                VStack(alignment: message.isFromSelf ? .trailing : .leading, spacing: 2) {
                    bubbleContent
                        .padding(.horizontal, 10)
                        .padding(.vertical, 8)
                        .background(
                            MessageBubbleShape(isFromSelf: message.isFromSelf)
                                .fill(message.isFromSelf ? Color.bubbleSelf : Color.bubbleOther)
                        )
                        .shadow(color: .black.opacity(0.04), radius: 1, y: 1)

                    if settings.showTimestamps {
                        Text(message.formattedTime)
                            .font(.system(size: 9))
                            .foregroundColor(.secondaryText.opacity(0.7))
                    }
                }

                if !message.isFromSelf {
                    Spacer(minLength: 0)
                }
            }
        }
    }

    @ViewBuilder
    private var bubbleContent: some View {
        switch message.msgType {
        case .text:
            RichTextView(text: message.displayContent, fontSize: settings.fontSize)
                .textSelection(.enabled)
        case .image:
            AsyncImageMessage(message: message, maxSize: CGFloat(settings.maxImagePreviewSize))
        default:
            Text(message.displayContent)
                .font(.system(size: settings.fontSize))
                .foregroundColor(.secondaryText)
                .italic()
        }
    }

    private var resolvedSenderName: String {
        let senderID = message.fromUser
        if let c = session.contact(for: senderID) {
            return c.displayName
        }
        if senderID.hasPrefix("wxid_") {
            return String(senderID.dropFirst(5).prefix(8))
        }
        return senderID
    }
}

struct RichTextView: View {
    let text: String
    var fontSize: Double = 13

    var body: some View {
        Text(makeAttributedString())
            .font(.system(size: fontSize))
            .foregroundColor(.primaryText)
            .tint(.blue)
    }

    private func makeAttributedString() -> AttributedString {
        var result = AttributedString(text)
        let pattern = #"https?://[^\s<>\"\u{FF0C}\u{3002}\u{300B}\u{FF09}]+"#
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return result }

        let nsString = text as NSString
        let nsRange = NSRange(location: 0, length: nsString.length)

        for match in regex.matches(in: text, range: nsRange).reversed() {
            guard let swiftRange = Range(match.range, in: text),
                  let attrRange = Range(swiftRange, in: result),
                  let url = URL(string: String(text[swiftRange])) else { continue }
            result[attrRange].link = url
            result[attrRange].underlineStyle = .single
        }
        return result
    }
}

struct AsyncImageMessage: View {
    let message: WXMessage
    var maxSize: CGFloat = 200
    @State private var imageData: Data?

    var body: some View {
        Group {
            if let data = imageData, let nsImage = NSImage(data: data) {
                Image(nsImage: nsImage)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(maxWidth: maxSize, maxHeight: maxSize)
                    .clipShape(RoundedRectangle(cornerRadius: 4))
            } else {
                Image(systemName: "photo")
                    .font(.system(size: 32))
                    .foregroundColor(.secondaryText)
                    .frame(width: 100, height: 100)
            }
        }
        .task {
            do {
                imageData = try await WeChatAPI.shared.getMessageImage(msgID: message.id)
            } catch {}
        }
    }
}

struct MessageBubbleShape: Shape {
    let isFromSelf: Bool

    func path(in rect: CGRect) -> Path {
        let cornerRadius: CGFloat = 6
        let arrowSize: CGFloat = 6
        let arrowY: CGFloat = 14

        var path = Path()

        if isFromSelf {
            let bodyRect = CGRect(x: rect.minX, y: rect.minY, width: rect.width - arrowSize, height: rect.height)
            path.addRoundedRect(in: bodyRect, cornerSize: CGSize(width: cornerRadius, height: cornerRadius))
            path.move(to: CGPoint(x: bodyRect.maxX, y: arrowY - arrowSize/2))
            path.addLine(to: CGPoint(x: bodyRect.maxX + arrowSize, y: arrowY))
            path.addLine(to: CGPoint(x: bodyRect.maxX, y: arrowY + arrowSize/2))
        } else {
            let bodyRect = CGRect(x: rect.minX + arrowSize, y: rect.minY, width: rect.width - arrowSize, height: rect.height)
            path.addRoundedRect(in: bodyRect, cornerSize: CGSize(width: cornerRadius, height: cornerRadius))
            path.move(to: CGPoint(x: bodyRect.minX, y: arrowY - arrowSize/2))
            path.addLine(to: CGPoint(x: bodyRect.minX - arrowSize, y: arrowY))
            path.addLine(to: CGPoint(x: bodyRect.minX, y: arrowY + arrowSize/2))
        }

        return path
    }
}

struct InputToolButton: View {
    let systemName: String
    var action: () -> Void = {}
    @State private var isHovered = false

    var body: some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 16))
                .foregroundColor(isHovered ? .primaryText : .secondaryText)
        }
        .buttonStyle(.plain)
        .onHover { isHovered = $0 }
    }
}

struct SendButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 12))
            .foregroundColor(isEnabled ? .primaryText : .secondaryText)
            .padding(.horizontal, 16)
            .padding(.vertical, 5)
            .background(
                RoundedRectangle(cornerRadius: 4)
                    .fill(Color(red: 0.87, green: 0.87, blue: 0.87).opacity(0.5))
            )
            .opacity(configuration.isPressed ? 0.7 : 1.0)
    }
}
