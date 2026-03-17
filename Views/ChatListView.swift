import SwiftUI

struct ChatListView: View {
    @EnvironmentObject var session: SessionManager
    let searchText: String

    var filteredSessions: [ChatSession] {
        let sorted = session.chatSessions.sorted { a, b in
            if a.isPinned != b.isPinned { return a.isPinned }
            return a.sortTimestamp > b.sortTimestamp
        }

        if searchText.isEmpty { return sorted }

        return sorted.filter {
            $0.contact.displayName.localizedCaseInsensitiveContains(searchText) ||
            $0.lastMessagePreview.localizedCaseInsensitiveContains(searchText)
        }
    }

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(filteredSessions) { chatSession in
                    ChatListRow(chatSession: chatSession)
                        .onTapGesture {
                            session.selectChat(chatSession)
                        }
                }
            }
        }
    }
}

struct ChatListRow: View {
    @EnvironmentObject var session: SessionManager
    @ObservedObject var chatSession: ChatSession
    @State private var isHovered = false

    private var isSelected: Bool {
        session.selectedChat?.id == chatSession.id
    }

    var body: some View {
        HStack(spacing: 10) {
            ZStack(alignment: .topTrailing) {
                AvatarView(
                    url: chatSession.contact.avatarURL,
                    size: 40,
                    fallbackName: chatSession.contact.displayName
                )

                if chatSession.unreadCount > 0 {
                    BadgeView(count: chatSession.unreadCount)
                        .offset(x: 6, y: -6)
                }
            }

            VStack(alignment: .leading, spacing: 3) {
                HStack {
                    Text(chatSession.contact.displayName)
                        .font(.system(size: 13, weight: .regular))
                        .foregroundColor(.primaryText)
                        .lineLimit(1)

                    Spacer()

                    Text(chatSession.lastMessageTime)
                        .font(.system(size: 10))
                        .foregroundColor(.secondaryText)
                }

                Text(chatSession.lastMessagePreview)
                    .font(.system(size: 11))
                    .foregroundColor(.secondaryText)
                    .lineLimit(1)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(
            isSelected ? Color.chatListSelected :
            (isHovered ? Color.chatListHover : Color.clear)
        )
        .onHover { hovering in
            isHovered = hovering
        }
        .contextMenu {
            Button("Pin to Top") {
                chatSession.isPinned.toggle()
            }
            Button("Mark as Read") {
                chatSession.markAsRead()
            }
            Divider()
            Button("Delete Chat") {
                if let idx = session.chatSessions.firstIndex(where: { $0.id == chatSession.id }) {
                    session.chatSessions.remove(at: idx)
                    if session.selectedChat?.id == chatSession.id {
                        session.selectedChat = nil
                    }
                }
            }
        }
    }
}
