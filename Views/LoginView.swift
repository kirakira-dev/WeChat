import SwiftUI

struct LoginView: View {
    @EnvironmentObject var session: SessionManager
    @State private var isLoading = false
    @State private var showQRLogin = false

    var body: some View {
        VStack(spacing: 0) {
            Color.clear.frame(height: 28)

            Spacer()

            VStack(spacing: 24) {
                Image(nsImage: NSApp.applicationIconImage)
                    .resizable()
                    .frame(width: 64, height: 64)
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                    .shadow(color: .black.opacity(0.1), radius: 4, y: 2)

                Text("WeChat")
                    .font(.system(size: 22, weight: .medium))
                    .foregroundColor(.primaryText)

                if showQRLogin {
                    qrLoginSection
                } else {
                    localDataSection
                }
            }
            .padding(.horizontal, 60)

            Spacer()

            HStack(spacing: 16) {
                if !showQRLogin {
                    Button("Use QR Code Login Instead") {
                        showQRLogin = true
                    }
                    .buttonStyle(.plain)
                    .font(.system(size: 12))
                    .foregroundColor(.wechatGreen)
                } else {
                    Button("Use Local Data Instead") {
                        showQRLogin = false
                    }
                    .buttonStyle(.plain)
                    .font(.system(size: 12))
                    .foregroundColor(.wechatGreen)
                }
            }
            .padding(.bottom, 30)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.loginBackground)
    }

    private var localDataSection: some View {
        VStack(spacing: 16) {
            switch session.dbKeyStatus {
            case .checking:
                ProgressView()
                    .scaleEffect(1.2)
                Text("Checking WeChat data...")
                    .font(.system(size: 13))
                    .foregroundColor(.secondaryText)

            case .ready:
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 40))
                    .foregroundColor(.wechatGreen)
                Text("Loading from WeChat database...")
                    .font(.system(size: 13))
                    .foregroundColor(.secondaryText)

            case .extracting:
                ProgressView()
                    .scaleEffect(1.2)
                Text("Extracting DB key from WeChat...")
                    .font(.system(size: 13))
                    .foregroundColor(.secondaryText)
                Text("Make sure WeChat is running")
                    .font(.system(size: 11))
                    .foregroundColor(.secondaryText.opacity(0.7))

            case .noKey:
                VStack(spacing: 12) {
                    if !session.dataReader.wxid.isEmpty {
                        Text("Found: \(session.dataReader.wxid)")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(.primaryText)
                    }

                    Text(session.statusMessage)
                        .font(.system(size: 12))
                        .foregroundColor(.secondaryText)
                        .multilineTextAlignment(.center)

                    Button("Extract Keys (Start WeChat First)") {
                        Task {
                            session.dbKeyStatus = .extracting
                            session.statusMessage = "Scanning WeChat memory for keys..."
                            let success = session.dataReader.extractKeysFromRunningWeChat()
                            if success {
                                session.dbKeyStatus = .ready
                                await session.loadLocalData()
                            } else {
                                session.dbKeyStatus = .noKey
                                session.statusMessage = "Could not extract keys. Make sure WeChat is running."
                            }
                        }
                    }
                    .buttonStyle(WeChatButtonStyle())

                    VStack(spacing: 4) {
                        Text("To extract keys, run in Terminal:")
                            .font(.system(size: 11))
                            .foregroundColor(.secondaryText)
                        Text("sudo /tmp/find_wechat_keys")
                            .font(.system(size: 11, design: .monospaced))
                            .foregroundColor(.primaryText)
                            .padding(6)
                            .background(
                                RoundedRectangle(cornerRadius: 4)
                                    .fill(Color(red: 0.92, green: 0.92, blue: 0.92))
                            )
                            .onTapGesture {
                                NSPasteboard.general.clearContents()
                                NSPasteboard.general.setString("sudo /tmp/find_wechat_keys", forType: .string)
                            }
                        Text("(Keys are cached at ~/.wechat_db_keys.json)")
                            .font(.system(size: 10))
                            .foregroundColor(.secondaryText.opacity(0.7))
                    }
                    .padding(.top, 8)
                }

            case .failed(let msg):
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 40))
                    .foregroundColor(.red)
                Text(msg)
                    .font(.system(size: 12))
                    .foregroundColor(.red)
                    .multilineTextAlignment(.center)

                Button("Retry") {
                    session.hasInitialized = false
                    Task { await session.initialize() }
                }
                .buttonStyle(WeChatButtonStyle())
            }
        }
    }

    private var qrLoginSection: some View {
        VStack(spacing: 16) {
            qrCodeView
                .frame(width: 240, height: 240)

            statusText
                .font(.system(size: 13))
                .foregroundColor(.secondaryText)
                .multilineTextAlignment(.center)
        }
        .onAppear {
            if !isLoading {
                startQRLogin()
            }
        }
    }

    @ViewBuilder
    private var qrCodeView: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 8)
                .fill(Color.white)
                .shadow(color: .black.opacity(0.06), radius: 8, y: 2)

            if let data = session.api.qrCodeData, let nsImage = NSImage(data: data) {
                Image(nsImage: nsImage)
                    .resizable()
                    .interpolation(.none)
                    .aspectRatio(contentMode: .fit)
                    .padding(16)
            } else if isLoading {
                VStack(spacing: 12) {
                    ProgressView()
                        .scaleEffect(1.2)
                    Text("Loading QR Code...")
                        .font(.system(size: 12))
                        .foregroundColor(.secondaryText)
                }
            }

            if case .scanned = session.api.loginState {
                Color.white.opacity(0.92)
                VStack(spacing: 12) {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 40))
                        .foregroundColor(.wechatGreen)
                    Text("Scanned")
                        .font(.system(size: 15, weight: .medium))
                    Text("Confirm login on your phone")
                        .font(.system(size: 12))
                        .foregroundColor(.secondaryText)
                }
            }
        }
    }

    private var statusText: some View {
        Group {
            switch session.api.loginState {
            case .idle:
                Text("Scan QR Code to log in to WeChat")
            case .waitingScan:
                Text("Open WeChat on your phone\nand scan this QR Code")
            case .scanned:
                Text("Confirm login on your phone")
            case .loggedIn:
                Text("Login successful")
            case .failed(let msg):
                Text("Login failed: \(msg)")
            }
        }
    }

    private func startQRLogin() {
        isLoading = true
        Task {
            await session.login()
            isLoading = false
        }
    }
}

struct WeChatButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 13, weight: .medium))
            .foregroundColor(.white)
            .padding(.horizontal, 24)
            .padding(.vertical, 8)
            .background(
                RoundedRectangle(cornerRadius: 4)
                    .fill(configuration.isPressed ? Color.wechatDarkGreen : Color.wechatGreen)
            )
    }
}
