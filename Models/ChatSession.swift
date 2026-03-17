import Foundation

class ChatSession: Identifiable, ObservableObject, Hashable {
    let id: String
    var contact: WXContact
    @Published var messages: [WXMessage] = []
    @Published var unreadCount: Int = 0
    @Published var draft: String = ""
    var isPinned: Bool = false

    var lastMessage: WXMessage? {
        messages.last
    }

    var lastMessagePreview: String {
        guard let msg = lastMessage else { return "" }
        return msg.displayContent
    }

    var lastMessageTime: String {
        guard let msg = lastMessage else { return "" }
        return msg.formattedTime
    }

    var sortTimestamp: TimeInterval {
        lastMessage?.timestamp ?? 0
    }

    init(id: String, contact: WXContact) {
        self.id = id
        self.contact = contact
    }

    func appendMessage(_ msg: WXMessage) {
        messages.append(msg)
        if !msg.isFromSelf {
            unreadCount += 1
        }
    }

    func markAsRead() {
        unreadCount = 0
    }

    static func == (lhs: ChatSession, rhs: ChatSession) -> Bool {
        lhs.id == rhs.id
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }
}
