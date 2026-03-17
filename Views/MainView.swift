import SwiftUI

struct MainView: View {
    @EnvironmentObject var session: SessionManager

    var body: some View {
        HStack(spacing: 0) {
            IconSidebar()
                .frame(width: 54)

            MiddlePanel()
                .frame(width: 250)

            Color.divider
                .frame(width: 0.5)

            if session.selectedChat != nil {
                ChatView()
            } else {
                EmptyChatView()
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

struct IconSidebar: View {
    @EnvironmentObject var session: SessionManager
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        VStack(spacing: 0) {
            Color.clear.frame(height: 40)

            AvatarView(
                url: session.contact(for: session.dataReader.wxid)?.avatarURL ?? session.api.userInfo?.avatarURL ?? "",
                size: 34,
                fallbackName: session.contact(for: session.dataReader.wxid)?.displayName ?? session.api.userInfo?.nickname ?? "Me"
            )
            .padding(.bottom, 20)

            VStack(spacing: 4) {
                SidebarIconButton(
                    systemName: "message.fill",
                    isActive: session.currentTab == .chats,
                    badgeCount: totalUnread
                ) {
                    session.currentTab = .chats
                }

                SidebarIconButton(
                    systemName: "person.2.fill",
                    isActive: session.currentTab == .contacts
                ) {
                    session.currentTab = .contacts
                }

                SidebarIconButton(
                    systemName: "star.fill",
                    isActive: session.currentTab == .favorites
                ) {
                    session.currentTab = .favorites
                }

                SidebarIconButton(
                    systemName: "square.grid.2x2.fill",
                    isActive: session.currentTab == .miniPrograms
                ) {
                    session.currentTab = .miniPrograms
                }
            }

            Spacer()

            VStack(spacing: 4) {
                SidebarIconButton(systemName: "folder.fill") {
                    NSWorkspace.shared.open(URL(fileURLWithPath: session.dataReader.dbBasePath))
                }
                SidebarIconButton(systemName: "gearshape.fill") {
                    openWindow(id: "settings")
                }
            }
            .padding(.bottom, 16)
        }
        .frame(maxHeight: .infinity)
        .background(Color.sidebarBackground)
    }

    private var totalUnread: Int {
        session.chatSessions.reduce(0) { $0 + $1.unreadCount }
    }
}

struct SidebarIconButton: View {
    let systemName: String
    var isActive: Bool = false
    var badgeCount: Int = 0
    let action: () -> Void

    @State private var isHovered = false

    var body: some View {
        Button(action: action) {
            ZStack(alignment: .topTrailing) {
                Image(systemName: systemName)
                    .font(.system(size: 18))
                    .foregroundColor(isActive ? .sidebarIconActive : .sidebarIcon)
                    .frame(width: 42, height: 36)
                    .background(
                        RoundedRectangle(cornerRadius: 6)
                            .fill(isActive ? Color.sidebarSelected : (isHovered ? Color.sidebarHover : Color.clear))
                    )

                if badgeCount > 0 {
                    BadgeView(count: badgeCount)
                        .offset(x: 6, y: -4)
                }
            }
        }
        .buttonStyle(.plain)
        .onHover { hovering in
            isHovered = hovering
        }
    }
}

struct BadgeView: View {
    let count: Int

    var body: some View {
        Text(count > 99 ? "99+" : "\(count)")
            .font(.system(size: 9, weight: .medium))
            .foregroundColor(.white)
            .padding(.horizontal, count > 9 ? 4 : 2)
            .padding(.vertical, 1)
            .frame(minWidth: 16, minHeight: 16)
            .background(Capsule().fill(Color.badgeRed))
    }
}

struct MiddlePanel: View {
    @EnvironmentObject var session: SessionManager
    @State private var searchText = ""

    var body: some View {
        VStack(spacing: 0) {
            VStack(spacing: 8) {
                Color.clear.frame(height: 28)

                HStack(spacing: 6) {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 12))
                        .foregroundColor(.secondaryText)
                    TextField("Search", text: $searchText)
                        .textFieldStyle(.plain)
                        .font(.system(size: 12))
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 5)
                .background(
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color.gray.opacity(0.15))
                )
                .padding(.horizontal, 10)
            }
            .padding(.bottom, 8)

            switch session.currentTab {
            case .chats:
                ChatListView(searchText: searchText)
            case .contacts:
                ContactsListView(searchText: searchText)
            case .favorites:
                FavoritesView()
            case .miniPrograms:
                MiniProgramsView()
            }
        }
        .frame(maxHeight: .infinity)
        .background(Color.chatListBackground)
    }
}

struct EmptyChatView: View {
    var body: some View {
        ZStack {
            Color.chatBackground
            Image(nsImage: NSApp.applicationIconImage)
                .resizable()
                .frame(width: 120, height: 120)
                .opacity(0.08)
        }
    }
}

struct FavoritesView: View {
    var body: some View {
        VStack {
            Spacer()
            Text("Favorites")
                .foregroundColor(.secondaryText)
                .font(.system(size: 13))
            Spacer()
        }
    }
}

struct MiniProgramsView: View {
    var body: some View {
        VStack {
            Spacer()
            Text("Mini Programs")
                .foregroundColor(.secondaryText)
                .font(.system(size: 13))
            Spacer()
        }
    }
}
