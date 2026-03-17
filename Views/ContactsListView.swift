import SwiftUI

struct ContactsListView: View {
    @EnvironmentObject var session: SessionManager
    let searchText: String

    private var filteredContacts: [WXContact] {
        let list = session.personalContacts
        if searchText.isEmpty { return list }
        return list.filter {
            $0.displayName.localizedCaseInsensitiveContains(searchText) ||
            $0.pinyin.localizedCaseInsensitiveContains(searchText)
        }
    }

    private var groupedContacts: [(String, [WXContact])] {
        let dict = Dictionary(grouping: filteredContacts) { contact -> String in
            let first = contact.pinyin.prefix(1).uppercased()
            if first.isEmpty || !first.first!.isLetter { return "#" }
            return first
        }
        return dict.sorted { $0.key < $1.key }
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                ContactSpecialRow(icon: "person.badge.plus", title: "New Friends")
                ContactSpecialRow(icon: "person.3.fill", title: "Group Chats")
                ContactSpecialRow(icon: "tag.fill", title: "Tags")
                ContactSpecialRow(icon: "megaphone.fill", title: "Official Accounts")

                Color.divider.frame(height: 0.5)
                    .padding(.vertical, 4)

                ForEach(groupedContacts, id: \.0) { section, contacts in
                    Text(section)
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(.secondaryText)
                        .padding(.horizontal, 16)
                        .padding(.top, 8)
                        .padding(.bottom, 4)

                    ForEach(contacts) { contact in
                        ContactRow(contact: contact)
                            .onTapGesture {
                                session.openChat(with: contact)
                            }
                    }
                }

                Text("\(filteredContacts.count) contacts")
                    .font(.system(size: 11))
                    .foregroundColor(.secondaryText)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.vertical, 12)
            }
        }
    }
}

struct ContactSpecialRow: View {
    let icon: String
    let title: String
    @State private var isHovered = false

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 16))
                .foregroundColor(.wechatGreen)
                .frame(width: 36, height: 36)
                .background(
                    RoundedRectangle(cornerRadius: 6)
                        .fill(Color.wechatGreen.opacity(0.12))
                )

            Text(title)
                .font(.system(size: 13))
                .foregroundColor(.primaryText)

            Spacer()
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(isHovered ? Color.chatListHover : Color.clear)
        .onHover { isHovered = $0 }
    }
}

struct ContactRow: View {
    let contact: WXContact
    @State private var isHovered = false

    var body: some View {
        HStack(spacing: 10) {
            AvatarView(
                url: contact.avatarURL,
                size: 36,
                fallbackName: contact.displayName
            )

            Text(contact.displayName)
                .font(.system(size: 13))
                .foregroundColor(.primaryText)
                .lineLimit(1)

            Spacer()
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 5)
        .background(isHovered ? Color.chatListHover : Color.clear)
        .onHover { isHovered = $0 }
    }
}
