import SwiftUI

struct AvatarView: View {
    let url: String
    let size: CGFloat
    let fallbackName: String

    @State private var imageData: Data?
    @State private var loadFailed = false

    private var cornerFraction: CGFloat {
        AppSettings.shared.avatarCornerFraction
    }

    var body: some View {
        Group {
            if let data = imageData, let nsImage = NSImage(data: data) {
                Image(nsImage: nsImage)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
            } else {
                fallbackAvatar
            }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: size * cornerFraction))
        .task(id: url) {
            await loadAvatar()
        }
    }

    private var fallbackAvatar: some View {
        ZStack {
            RoundedRectangle(cornerRadius: size * cornerFraction)
                .fill(avatarColor)
            Text(initials)
                .font(.system(size: size * 0.38, weight: .medium))
                .foregroundColor(.white)
        }
    }

    private var initials: String {
        let name = fallbackName.isEmpty ? "?" : fallbackName
        return String(name.prefix(1)).uppercased()
    }

    private var avatarColor: Color {
        let colors: [Color] = [
            Color(red: 0.95, green: 0.45, blue: 0.35),
            Color(red: 0.40, green: 0.72, blue: 0.95),
            Color(red: 0.55, green: 0.82, blue: 0.48),
            Color(red: 0.90, green: 0.65, blue: 0.30),
            Color(red: 0.70, green: 0.50, blue: 0.88),
            Color(red: 0.85, green: 0.42, blue: 0.60),
        ]
        let hash = abs(fallbackName.hashValue)
        return colors[hash % colors.count]
    }

    private func loadAvatar() async {
        guard !url.isEmpty, !loadFailed else { return }

        if let cached = AvatarCache.shared.get(url) {
            imageData = cached
            return
        }

        do {
            let data: Data
            if url.hasPrefix("http://") || url.hasPrefix("https://") {
                guard let fetchURL = URL(string: url) else { return }
                let (d, _) = try await URLSession.shared.data(from: fetchURL)
                data = d
            } else {
                data = try await WeChatAPI.shared.getAvatar(url: url)
            }
            AvatarCache.shared.set(url, data: data)
            imageData = data
        } catch {
            loadFailed = true
        }
    }
}

final class AvatarCache {
    static let shared = AvatarCache()
    private var cache: [String: Data] = [:]
    private let lock = NSLock()

    func get(_ key: String) -> Data? {
        lock.lock()
        defer { lock.unlock() }
        return cache[key]
    }

    func set(_ key: String, data: Data) {
        lock.lock()
        defer { lock.unlock() }
        cache[key] = data
    }

    func clearAll() {
        lock.lock()
        defer { lock.unlock() }
        cache.removeAll()
    }

    private init() {}
}
